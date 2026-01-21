import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { storage } from '../storage';
import { clearTwilioCacheOnLogout } from '../userTwilioService';
import { rateLimitConfigs } from './rateLimiters';

/**
 * Authentication Routes Plugin for Fastify
 * Migrated from Express routes
 */

export default async function authRoutes(fastify: FastifyInstance) {
  // POST /auth/register - User registration
  fastify.post('/auth/register', {
    config: {
      rateLimit: rateLimitConfigs.auth
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { email, password, username, firstName, lastName } = request.body as any;
      
      if (!email || !password || !username) {
        return reply.code(400).send({ message: "Email, password, and username are required" });
      }

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return reply.code(409).send({ message: "User with this email already exists" });
      }

      const existingUsername = await storage.getUserByUsername(username);
      if (existingUsername) {
        return reply.code(409).send({ message: "Username is already taken" });
      }

      // Create new user with tenant
      const user = await storage.createUserWithTenant({
        email,
        password, // Storage layer handles hashing via authenticateUser/createUser
        username,
        firstName: firstName || '',
        lastName: lastName || '',
        role: 'user',
        status: 'active'
      });

      // Create session
      (request as any).session.userId = user.id;
      (request as any).session.user = user;

      return reply.code(201).send({ 
        message: "Registration successful",
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          status: user.status
        }
      });
    } catch (error: any) {
      console.error('Registration error:', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  // POST /auth/login - User login with session-based auth
  fastify.post('/auth/login', {
    config: {
      rateLimit: rateLimitConfigs.auth
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { email, username, password } = request.body as any;
      const loginIdentifier = email || username;
      
      if (!loginIdentifier || !password) {
        return reply.code(400).send({ message: "Email/Username and password are required" });
      }

      // Try to authenticate by email first, then username
      let user = await storage.authenticateUser(loginIdentifier, password);
      
      if (!user) {
        return reply.code(401).send({ message: "Invalid credentials" });
      }

      // Create session
      (request as any).session.userId = user.id;
      (request as any).session.user = user;

      // Update last login
      await storage.updateUser(user.id, { lastLogin: new Date() });

      return reply.send({ 
        message: "Login successful",
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          status: user.status
        }
      });
    } catch (error: any) {
      console.error('Login error:', error);
      return reply.code(500).send({ message: error.message || "An unexpected error occurred during login" });
    }
  });

  // POST /auth/check-email - Check if email exists
  fastify.post('/auth/check-email', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { email } = request.body as any;
      if (!email) {
        return reply.code(400).send({ message: "Email is required" });
      }
      const user = await storage.getUserByEmail(email);
      return reply.send({ exists: !!user });
    } catch (error: any) {
      console.error('Check email error:', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  // POST /auth/signup - User registration
  fastify.post('/auth/signup', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { email, password, fullName } = request.body as any;
      
      if (!email || !password || !fullName) {
        return reply.code(400).send({ message: "Email, password, and full name are required" });
      }

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return reply.code(400).send({ message: "User already exists" });
      }

      // Create new user - storage layer handles password hashing
      const user = await storage.createUserWithTenant({
        email,
        password,
        username: email.split('@')[0],
        firstName: fullName.split(' ')[0],
        lastName: fullName.split(' ').slice(1).join(' ') || '',
        role: 'user',
        status: 'active'
      });

      // Create session
      (request as any).session.userId = user.id;
      (request as any).session.user = user;

      return reply.code(201).send({ 
        message: "User created successfully",
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          status: user.status
        }
      });
    } catch (error: any) {
      console.error('Signup error:', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  // POST /auth/logout - User logout
  fastify.post('/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).session?.userId;
      if (userId) {
        clearTwilioCacheOnLogout(userId);
      }
      
      // Wrap session.destroy in a Promise to properly await it
      await new Promise<void>((resolve, reject) => {
        if (!(request as any).session?.destroy) {
          // No session to destroy
          resolve();
          return;
        }
        (request as any).session.destroy((err: any) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
      
      return reply.send({ message: "Logged out successfully" });
    } catch (error: any) {
      return reply.code(500).send({ message: "Could not log out" });
    }
  });

  // GET /auth/me - Get current user from Auth0 token
  fastify.get('/auth/me', {
    preHandler: async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        return reply.code(401).send({ message: "Not authenticated" });
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const auth = (request as any).user;
      if (!auth || !auth.sub) {
        return reply.code(401).send({ message: "Not authenticated" });
      }

      const userId = parseInt(auth.sub.split('|')[1] || '0');
      const email = auth['https://app.com/email'] || auth.email || '';
      
      let username = auth['https://app.com/name'] || auth.name || auth.nickname || '';
      
      if (!username || username.trim() === '') {
        if (email) {
          username = email.split('@')[0];
        } else {
          username = `user_${auth.sub.split('|')[1] || auth.sub}`;
        }
      }
      
      const role = auth['https://app.com/roles']?.[0] || 'user';

      return reply.send({
        id: userId,
        username,
        email,
        role,
        status: 'active'
      });
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // POST /auth/auth0-session - Create session from Auth0 token
  fastify.post('/auth/auth0-session', {
    preHandler: async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        return reply.code(401).send({ message: "Not authenticated" });
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const auth = (request as any).user;
      if (!auth || !auth.sub) {
        return reply.code(401).send({ message: "Not authenticated" });
      }

      const auth0UserId = auth.sub;
      const email = auth['https://app.com/email'] || auth.email || '';
      
      let username = auth['https://app.com/name'] || auth.name || auth.nickname || '';
      
      if (!username || username.trim() === '') {
        if (email) {
          username = email.split('@')[0];
        } else {
          username = `user_${auth0UserId.split('|')[1] || auth0UserId}`;
        }
      }
      
      const role = auth['https://app.com/roles']?.[0] || 'user';
      const firstName = auth.given_name || '';
      const lastName = auth.family_name || '';
      const avatar = auth.picture || '';

      // Get or create user in database by Auth0 ID
      let user = await storage.getUserByAuth0Id(auth0UserId);
      
      if (!user) {
        // Try to find existing user by email or username
        if (email) {
          user = await storage.getUserByEmail(email);
        }
        if (!user) {
          user = await storage.getUserByUsername(username);
        }
        
        if (user) {
          // Backfill auth0Id for existing user
          user = await storage.updateUser(user.id, {
            auth0Id: auth0UserId,
            username,
            email,
            firstName: firstName || user.firstName,
            lastName: lastName || user.lastName
          });
        } else {
          // Create new user
          user = await storage.createUserWithTenant({
            auth0Id: auth0UserId,
            email,
            username,
            firstName,
            lastName,
            password: '', // No password for Auth0 users
            role
          });
        }
      }

      // Create session
      (request as any).session.userId = user.id;
      (request as any).session.user = user;

      return reply.send({
        message: "Session created",
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          status: user.status,
          twilioConfigured: user.twilioConfigured || false
        }
      });
    } catch (error: any) {
      console.error('Auth0 session creation error:', error);
      return reply.code(500).send({ message: error.message });
    }
  });
}
