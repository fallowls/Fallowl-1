import { FastifyRequest, FastifyReply } from 'fastify';
import { authService } from '../../services/AuthService';
import { z } from 'zod';
import { BadRequestError } from '../../utils/errors';
import { clearTwilioCacheOnLogout } from '../../userTwilioService';
import { storage } from '../../storage';

export async function loginUser(request: FastifyRequest, reply: FastifyReply) {
  const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1)
  });

  const validatedData = loginSchema.safeParse(request.body);
  if (!validatedData.success) {
    throw new BadRequestError('Invalid input data');
  }

  const { email, password } = validatedData.data;
  const result = await authService.login(email, password);

  // Set session for legacy support if needed
  (request as any).session.userId = result.user.id;
  (request as any).session.user = result.user;

  return reply.send(result);
}

export async function signup(request: FastifyRequest, reply: FastifyReply) {
  const signupSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8, "Password must be at least 8 characters"),
    fullName: z.string().min(1, "Full name is required")
  });

  const validatedData = signupSchema.safeParse(request.body);
  if (!validatedData.success) {
    throw new BadRequestError(validatedData.error.errors[0].message);
  }

  const user = await authService.signup(validatedData.data);

  // Set session
  (request as any).session.userId = user.id;
  (request as any).session.user = user;

  return reply.status(201).send({
    message: "User created successfully",
    user
  });
}

export async function checkEmail(request: FastifyRequest, reply: FastifyReply) {
  const schema = z.object({ email: z.string().email() });
  const validatedData = schema.safeParse(request.body);
  
  if (!validatedData.success) {
    throw new BadRequestError('Invalid email format');
  }

  const result = await authService.checkEmail(validatedData.data.email);
  return reply.send(result);
}

export async function logout(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).session?.userId;
  if (userId) {
    clearTwilioCacheOnLogout(userId);
  }

  await (request as any).session.destroy();
  return reply.send({ message: "Logged out successfully" });
}

export async function auth0Session(request: FastifyRequest, reply: FastifyReply) {
  // This logic is complex and closely tied to storage, keeping it in controller or moving to a specific service
  // For now, let's keep it thin and call a helper in storage or service if possible.
  // Given the complexity of the existing routes.ts implementation for auth0-session, 
  // I'll adapt it here to keep the controller relatively thin.
  
  const auth = (request as any).auth;
  if (!auth || !auth.sub) {
    return reply.status(401).send({ message: "Not authenticated" });
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

  let user = await storage.getUserByAuth0Id(auth0UserId);
  
  if (!user) {
    if (email) {
      user = await storage.getUserByEmail(email);
    }
    if (!user) {
      user = await storage.getUserByUsername(username);
    }
    
    if (user) {
      user = await storage.updateUser(user.id, {
        auth0Id: auth0UserId,
        username,
        email: email || user.email,
        firstName,
        lastName,
        avatar,
        emailVerified: auth.email_verified || false
      });
    } else {
      user = await storage.createUser({
        auth0Id: auth0UserId,
        username,
        email: email || `${username}@auth0.local`,
        password: '',
        role,
        status: 'active',
        firstName,
        lastName,
        avatar,
        emailVerified: auth.email_verified || false
      });
    }
  } else {
    user = await storage.updateUser(user.id, {
      username,
      email: email || user.email,
      firstName,
      lastName,
      avatar,
      emailVerified: auth.email_verified || false
    });
  }

  (request as any).session.userId = user.id;
  (request as any).session.user = user;
  (request as any).session.auth0UserId = auth0UserId;

  return reply.send({ 
    message: "Session created",
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      twilioConfigured: user.twilioConfigured || false
    }
  });
}

// Keeping registerUser for backward compatibility or direct use if needed, 
// though signup is preferred for "Smart Login"
export async function registerUser(request: FastifyRequest, reply: FastifyReply) {
    return signup(request, reply);
}
