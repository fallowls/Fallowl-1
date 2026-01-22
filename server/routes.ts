import type { Express } from "express";
import { createServer, type Server } from "http";
import fs from "fs";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { recordingService } from "./services/recordingService";
import { twilioConfigService } from "./services/twilioConfigService";
import { userTwilioCache, clearTwilioCacheOnLogout } from "./userTwilioService";
import { expressjwt } from "express-jwt";
import { expressJwtSecret } from "jwks-rsa";
import twilio from "twilio";
import { z } from "zod";
import { wsService } from "./websocketService";
import { sanitizeUser, sanitizeUsers } from "./utils/dataSanitization";
import { 
  apiLimiter, 
  authLimiter, 
  strictLimiter, 
  webhookLimiter, 
  downloadLimiter,
  smsLimiter,
  callLimiter
} from "./middleware/rateLimiter";
import { 
  insertUserSchema, insertContactSchema, insertCallSchema, insertMessageSchema, 
  insertRecordingSchema, insertVoicemailSchema, insertSettingSchema,
  insertRoleSchema, insertLoginHistorySchema, insertUserActivitySchema,
  insertSubscriptionPlanSchema, insertInvoiceSchema, insertCallNoteSchema,
  insertSmsTemplateSchema, insertSmsCampaignSchema, insertConversationThreadSchema,
  insertContactListSchema, insertContactListMembershipSchema,
  insertLeadSourceSchema, insertLeadStatusSchema, insertLeadCampaignSchema,
  insertLeadSchema, insertLeadActivitySchema, insertLeadTaskSchema,
  insertLeadScoringSchema, insertLeadNurturingSchema,
  insertAiLeadScoreSchema, insertCallIntelligenceSchema, insertAiInsightSchema
} from "@shared/schema";

// Custom type for requests that have gone through session auth
interface AuthenticatedRequest extends Express.Request {
  session: any;
}

// Authentication middleware
const requireAuth = (req: any, res: any, next: any) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
};

const getUserIdFromRequest = (req: any): number => {
  return req.session.userId;
};
import { openaiService } from "./services/openaiService";

// Auth0 JWT validation middleware
const auth0Domain = process.env.VITE_AUTH0_DOMAIN || process.env.AUTH0_DOMAIN;
const auth0Audience = process.env.VITE_AUTH0_AUDIENCE || process.env.AUTH0_AUDIENCE;

if (!auth0Domain) {
  console.warn('⚠️ AUTH0_DOMAIN or VITE_AUTH0_DOMAIN is not set in Express routes. Authentication will fail.');
}

console.log(`🛡️ Express Auth0 using domain: ${auth0Domain}`);

const checkJwt = expressjwt({
  secret: expressJwtSecret({
    cache: true,
    cacheMaxEntries: 5,
    cacheMaxAge: 600000, // 10 minutes in ms
    rateLimit: true,
    jwksRequestsPerMinute: 100, // Increased from 5 to 100
    jwksUri: `https://${auth0Domain}/.well-known/jwks.json`
  }),
  ...(auth0Audience ? { audience: auth0Audience } : {}),
  issuer: `https://${auth0Domain}/`,
  algorithms: ['RS256']
});

// Helper function to generate signed webhook tokens for user identification
export function generateWebhookToken(userId: number): string {
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY environment variable must be set to generate secure webhook tokens');
  }
  
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac('sha256', process.env.ENCRYPTION_KEY)
    .update(`${timestamp}:${userId}`)
    .digest('hex');
  return `${timestamp}:${userId}:${signature}`;
}

// Helper function to verify and decode webhook tokens
export function verifyWebhookToken(token: string): number {
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY environment variable must be set');
  }
  
  const parts = token.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid webhook token format');
  }
  
  const [timestamp, userIdStr, signature] = parts;
  const userId = parseInt(userIdStr);
  
  if (isNaN(userId)) {
    throw new Error('Invalid user ID in token');
  }
  
  // Verify signature
  const expectedSignature = crypto
    .createHmac('sha256', process.env.ENCRYPTION_KEY)
    .update(`${timestamp}:${userId}`)
    .digest('hex');
  
  if (signature !== expectedSignature) {
    throw new Error('Invalid webhook token signature');
  }
  
  // Optionally check token age (e.g., reject tokens older than 24 hours)
  const tokenAge = Date.now() - parseInt(timestamp);
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  if (tokenAge > maxAge) {
    throw new Error('Webhook token expired');
  }
  
  return userId;
}

import { auditLogs } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Admin Audit Log Route
  app.get("/api/admin/audit-logs", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const user = await storage.getUser(userId);
      
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: "Admin privileges required" });
      }

      const logs = await db
        .select()
        .from(auditLogs)
        .orderBy(desc(auditLogs.createdAt))
        .limit(100);
      
      res.json(logs);
    } catch (error: any) {
      console.error('Error fetching audit logs:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Twilio webhook signature validation middleware
  const validateTwilioWebhook = async (req: any, res: any, next: any) => {
    try {
      const signature = req.headers['x-twilio-signature'] || '';
      
      // Determine protocol: always use HTTPS in production, except for localhost
      let protocol = req.protocol;
      const host = req.get('host') || '';
      
      if (!host.includes('localhost') && !host.includes('127.0.0.1')) {
        // Production environment - always use HTTPS
        protocol = 'https';
      }
      
      const url = `${protocol}://${host}${req.originalUrl}`;
      
      // Get the call/message SID to determine which user's credentials to use
      const { CallSid, MessageSid, From, To } = req.body;
      
      let userId: number | null = null;
      
      // For outbound calls from WebRTC client
      if (From && From.startsWith('client:')) {
        const username = From.replace('client:', '');
        const user = await storage.getUserByUsername(username);
        if (user) userId = user.id;
      }
      
      // For incoming calls, lookup user by the phone number being called
      if (!userId && To && !From?.startsWith('client:')) {
        try {
          const user = await storage.getUserByTwilioPhoneNumber(To);
          if (user) {
            userId = user.id;
            console.log('✅ User identified from incoming call to phone number:', To, 'User:', userId);
          }
        } catch (error) {
          console.error('⚠️ Failed to lookup user by phone number:', error);
        }
      }
      
      // For calls with SID, find the user from call record using direct SID lookup
      if (!userId && CallSid) {
        try {
          const call = await storage.getCallByTwilioSid(CallSid);
          if (call) {
            userId = call.userId;
            console.log('✅ User identified from CallSid:', userId);
          }
        } catch (error) {
          console.error('⚠️ Failed to lookup call by SID:', error);
        }
      }
      
      // For messages with SID, find the user from message record using direct SID lookup
      if (!userId && MessageSid) {
        try {
          const message = await storage.getMessageByTwilioSid(MessageSid);
          if (message) {
            userId = message.userId;
            console.log('✅ User identified from MessageSid:', userId);
          }
        } catch (error) {
          console.error('⚠️ Failed to lookup message by SID:', error);
        }
      }
      
      // Try to extract userId from webhook URL token parameter as fallback
      let tokenValidated = false;
      if (!userId && req.query.token) {
        if (!process.env.ENCRYPTION_KEY) {
          console.error('❌ ENCRYPTION_KEY not set - cannot verify webhook token');
          return res.status(500).json({ 
            error: 'Server configuration error',
            details: 'ENCRYPTION_KEY must be set' 
          });
        }
        
        try {
          const [timestamp, userIdStr, signature] = String(req.query.token).split(':');
          const expectedSignature = crypto
            .createHmac('sha256', process.env.ENCRYPTION_KEY)
            .update(`${timestamp}:${userIdStr}`)
            .digest('hex');
          
          // SECURITY: Reduced from 30 days to 24 hours to limit replay attack window
          const tokenMaxAge = 24 * 60 * 60 * 1000; // 24 hours
          if (signature === expectedSignature && Date.now() - parseInt(timestamp) < tokenMaxAge) {
            userId = parseInt(userIdStr);
            tokenValidated = true;
            console.log('✅ User identified from webhook token (24hr TTL):', userId);
          } else {
            console.error('❌ Invalid or expired webhook token');
            return res.status(403).json({ 
              error: 'Forbidden - Invalid webhook token',
              details: 'Token signature mismatch or token expired (24hr limit)'
            });
          }
        } catch (error) {
          console.error('❌ Failed to parse webhook token:', error);
          return res.status(403).json({ 
            error: 'Forbidden - Malformed webhook token',
            details: 'Token format invalid'
          });
        }
      }
      
      // SECURITY: Reject webhooks when userId cannot be determined
      if (!userId) {
        console.error('❌ SECURITY: Could not determine userId for webhook validation - rejecting request');
        console.error('❌ URL:', req.originalUrl);
        console.error('❌ Body:', JSON.stringify(req.body).substring(0, 200));
        return res.status(403).json({ 
          error: 'Forbidden - Cannot validate webhook without user context',
          details: 'Webhook must include valid token parameter or identifiable user information'
        });
      }
      
      // SECURITY: Validate Twilio signature when possible (defense in depth)
      // Token-only validation is allowed for TwiML flows where URL includes token parameter
      // This is necessary because Twilio's signature fails when query params are in the webhook URL
      const { credentials } = await userTwilioCache.getTwilioClient(userId);
      
      // Validate signature using user's auth token
      const isValid = twilio.validateRequest(
        credentials.authToken,
        signature,
        url,
        req.body
      );
      
      if (!isValid) {
        // If token was validated, allow it (TwiML flow with token in URL)
        // Otherwise, reject the invalid signature
        if (tokenValidated) {
          console.log('⚠️ Twilio signature validation skipped - using validated token (TwiML flow)');
          next();
          return;
        }
        
        console.error('❌ Invalid Twilio webhook signature for user:', userId);
        console.error('❌ URL:', url);
        console.error('❌ Signature:', signature.substring(0, 20) + '...');
        return res.status(403).send('Forbidden - Invalid Twilio signature');
      }
      
      console.log('✅ Twilio webhook signature validated for user:', userId);
      next();
    } catch (error: any) {
      console.error('❌ Webhook validation error:', error);
      // SECURITY: Reject webhooks when validation fails to prevent potential attacks
      return res.status(403).json({ 
        error: 'Forbidden - Webhook validation failed',
        details: error.message 
      });
    }
  };

  // Apply general API rate limiter to all /api routes
  app.use('/api', apiLimiter);

  // Smart Login: Check if email exists
  app.post("/api/auth/check-email", strictLimiter, async (req, res) => {
    try {
      const { email } = z.object({ email: z.string().email() }).parse(req.body);
      const user = await storage.getUserByEmail(email);
      res.json({ exists: !!user });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid email format" });
      }
      res.status(500).json({ message: error.message });
    }
  });

  // Authentication routes
  app.post("/api/auth/login", authLimiter, async (req, res) => {
    try {
      const loginSchema = z.object({
        email: z.string().email(),
        password: z.string().min(1)
      });
      const { email, password } = loginSchema.parse(req.body);
      
      const user = await storage.authenticateUser(email, password);
      
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Create session
      (req as any).session.userId = user.id;
      (req as any).session.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status
      };

      res.json({ 
        message: "Login successful",
        user: (req as any).session.user
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input data", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  // Smart Login: Signup
  app.post("/api/auth/signup", strictLimiter, async (req, res) => {
    try {
      const signupSchema = z.object({
        email: z.string().email(),
        password: z.string().min(8, "Password must be at least 8 characters"),
        fullName: z.string().min(1, "Full name is required")
      });
      const { email, password, fullName } = signupSchema.parse(req.body);

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await storage.createUser({
        email,
        password: hashedPassword,
        username: email.split('@')[0], // Generate username from email
        firstName: fullName.split(' ')[0],
        lastName: fullName.split(' ').slice(1).join(' ') || '',
        role: 'user',
        status: 'active'
      });

      // Create session
      (req as any).session.userId = user.id;
      (req as any).session.user = user;

      res.status(201).json({
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
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input data", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    try {
      const userId = (req as any).session?.userId;
      if (userId) {
        clearTwilioCacheOnLogout(userId);
      }
      
      await new Promise<void>((resolve, reject) => {
        (req as any).session.destroy((err: any) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
      
      return res.json({ message: "Logged out successfully" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Debug log for environment variables
  console.log('Server Auth0 Configuration:', {
    domain: auth0Domain,
    audience: auth0Audience,
    env: process.env.NODE_ENV
  });

  app.get("/api/user", async (req, res) => {
    try {
      let userId = (req as any).session?.userId;
      
      if (!userId) {
        return res.status(401).json(null);
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json(null);
      }

      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Auth0 session creation endpoint
  app.post("/api/auth/auth0-session", checkJwt, async (req, res) => {
    try {
      const auth = (req as any).auth;
      if (!auth || !auth.sub) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Extract user info from Auth0 token with better fallbacks
      const auth0UserId = auth.sub; // This is the unique Auth0 user ID
      const email = auth['https://app.com/email'] || auth.email || '';
      
      // Extract username with multiple fallbacks - ensure it's never empty
      let username = auth['https://app.com/name'] || auth.name || auth.nickname || '';
      
      // If still empty, use email prefix or Auth0 ID
      if (!username || username.trim() === '') {
        if (email) {
          username = email.split('@')[0]; // Use email prefix
        } else {
          username = `user_${auth0UserId.split('|')[1] || auth0UserId}`; // Use Auth0 ID
        }
      }
      
      const role = auth['https://app.com/roles']?.[0] || 'user';
      const firstName = auth.given_name || '';
      const lastName = auth.family_name || '';
      const avatar = auth.picture || '';

      console.log('Auth0 token claims:', {
        sub: auth.sub,
        email,
        username,
        name: auth.name,
        nickname: auth.nickname,
        given_name: auth.given_name,
        family_name: auth.family_name
      });

      // Get or create user in database by Auth0 ID
      let user = await storage.getUserByAuth0Id(auth0UserId);
      
      if (!user) {
        // Try to find existing user by username or email (for migration)
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
            email: email || user.email,
            firstName,
            lastName,
            avatar,
            emailVerified: auth.email_verified || false
          });
          console.log(`✅ Backfilled Auth0 ID for existing user (ID: ${user.id})`);
        } else {
          // Create new user with Auth0 details
          user = await storage.createUser({
            auth0Id: auth0UserId,
            username,
            email: email || `${username}@auth0.local`,
            password: '', // No password for Auth0 users
            role,
            status: 'active',
            firstName,
            lastName,
            avatar,
            emailVerified: auth.email_verified || false
          });
          console.log(`✅ New user created from Auth0 (ID: ${user.id})`);
        }
      } else {
        // Update user info from Auth0 if changed
        user = await storage.updateUser(user.id, {
          username,
          email: email || user.email,
          firstName,
          lastName,
          avatar,
          emailVerified: auth.email_verified || false
        });
      }

      // Create session with user ID
      (req as any).session.userId = user.id;
      (req as any).session.user = user;
      (req as any).session.auth0UserId = auth0UserId;

      res.json({ 
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
          twilioConfigured: !!(user.twilioConfigured || (user.twilioAccountSid && user.twilioAuthToken))
        }
      });
    } catch (error: any) {
      console.error('Error creating Auth0 session:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Session-based auth middleware
  const requireSessionAuth = (req: any, res: any, next: any) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    next();
  };

  // Twilio Configuration Status Route
  app.get("/api/user/twilio/status", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const credentials = await storage.getUserTwilioCredentials(userId);
      
      if (!credentials) {
        return res.json({
          isConfigured: false,
          hasCredentials: false,
          phoneNumber: null,
          connection: { status: 'unconfigured' },
          registeredDevices: 0,
          lastHealthCheck: new Date().toISOString()
        });
      }

      // If credentials exist but isConfigured is false, try to auto-fix
      if (!credentials.twilioConfigured && credentials.twilioAccountSid && credentials.twilioAuthToken) {
        await storage.updateUserTwilioCredentials(userId, { twilio_configured: true });
        credentials.twilioConfigured = true;
      }

      return res.json({
        isConfigured: !!credentials.twilioConfigured,
        hasCredentials: true,
        phoneNumber: credentials.twilioPhoneNumber,
        connection: { status: credentials.twilioConfigured ? 'ready' : 'invalid' },
        registeredDevices: 0,
        lastHealthCheck: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error fetching Twilio status:', error);
      return res.status(500).json({ message: error.message });
    }
  });

  // Profile Management Routes
  app.get("/api/profile", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Return user profile data (excluding sensitive fields like password and auth0Id)
      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        phone: user.phone || '',
        avatar: user.avatar || '',
        role: user.role,
        status: user.status,
        emailVerified: user.emailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
        accountType: user.accountType,
        subscriptionPlan: user.subscriptionPlan,
        twilioConfigured: user.twilioConfigured,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      });
    } catch (error: any) {
      console.error('Error fetching profile:', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/profile", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      // Define Zod schema for profile updates
      const profileUpdateSchema = z.object({
        firstName: z.string().max(100).optional(),
        lastName: z.string().max(100).optional(),
        phone: z.string().max(20).optional(),
        avatar: z.string().url().max(500).optional().or(z.literal(''))
      }).strict();

      // Validate input
      const validatedData = profileUpdateSchema.parse(req.body);

      if (Object.keys(validatedData).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      const user = await storage.updateUser(userId, validatedData);
      
      res.json({
        message: "Profile updated successfully",
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          avatar: user.avatar
        }
      });
    } catch (error: any) {
      console.error('Error updating profile:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid input data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.put("/api/profile/password", strictLimiter, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      // Validate input with Zod
      const passwordUpdateSchema = z.object({
        currentPassword: z.string().min(1, "Current password is required"),
        newPassword: z.string().min(8, "New password must be at least 8 characters long")
      }).strict();

      const { currentPassword, newPassword } = passwordUpdateSchema.parse(req.body);

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if user uses Auth0 (no password in database)
      if (user.auth0Id && !user.password) {
        return res.status(400).json({ 
          message: "Password changes are managed through Auth0. Please use the 'Forgot Password' link on the login page." 
        });
      }

      // Verify current password with bcrypt
      const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      // Hash new password with bcrypt
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(userId, { password: hashedPassword });

      res.json({ message: "Password updated successfully" });
    } catch (error: any) {
      console.error('Error updating password:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: error.errors[0]?.message || "Invalid input data" });
      }
      res.status(500).json({ message: "Failed to update password" });
    }
  });

  app.put("/api/profile/notifications", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      // Define Zod schema for notification settings
      const notificationSettingsSchema = z.object({
        emailNotifications: z.boolean().optional(),
        smsNotifications: z.boolean().optional(),
        callNotifications: z.boolean().optional(),
        voicemailNotifications: z.boolean().optional(),
        marketingEmails: z.boolean().optional(),
        weeklyReports: z.boolean().optional()
      }).strict();

      // Validate input
      const notificationSettings = notificationSettingsSchema.parse(req.body);

      // Store notification preferences in user's customFields
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Update user with notification preferences
      const currentCustomFields = (user.customFields as any) || {};
      const updatedCustomFields = {
        ...currentCustomFields,
        notificationSettings
      };

      await storage.updateUser(userId, {
        customFields: updatedCustomFields
      });

      res.json({ 
        message: "Notification preferences updated successfully",
        settings: notificationSettings
      });
    } catch (error: any) {
      console.error('Error updating notifications:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid notification settings", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update notification preferences" });
    }
  });

  app.post("/api/profile/avatar", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const { avatar } = req.body;

      if (!avatar) {
        return res.status(400).json({ message: "Avatar URL is required" });
      }

      const user = await storage.updateUser(userId, { avatar });

      res.json({
        message: "Avatar updated successfully",
        avatar: user.avatar
      });
    } catch (error: any) {
      console.error('Error updating avatar:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Users
  app.get("/api/users", requireAuth, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(sanitizeUsers(users));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/users", requireAuth, async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const user = await storage.createUser(userData);
      res.json(sanitizeUser(user));
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/users/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userData = insertUserSchema.partial().parse(req.body);
      const user = await storage.updateUser(id, userData);
      res.json(sanitizeUser(user));
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/users/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteUser(id);
      res.json({ message: "User deleted successfully" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Enhanced user management routes
  app.get("/api/users/search", requireAuth, async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ message: "Search query is required" });
      }
      const users = await storage.searchUsers(query);
      res.json(sanitizeUsers(users));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/users/bulk-update", requireAuth, async (req, res) => {
    try {
      const { userIds, updates } = req.body;
      if (!userIds || !Array.isArray(userIds)) {
        return res.status(400).json({ message: "User IDs array is required" });
      }
      const validatedUpdates = insertUserSchema.partial().parse(updates);
      const updatedUsers = await storage.bulkUpdateUsers(userIds, validatedUpdates);
      res.json({ 
        message: `${updatedUsers.length} users updated successfully`,
        users: sanitizeUsers(updatedUsers) 
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/users/:id/activity", requireAuth, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const limit = parseInt(req.query.limit as string) || 50;
      const activity = await storage.getUserActivity(userId, limit);
      res.json(activity);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/users/:id/login-history", requireAuth, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const limit = parseInt(req.query.limit as string) || 50;
      const loginHistory = await storage.getLoginHistory(userId, limit);
      res.json(loginHistory);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/users/:id/invoices", requireAuth, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const invoices = await storage.getInvoicesByUser(userId);
      res.json(invoices);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Roles management
  app.get("/api/roles", requireAuth, async (req, res) => {
    try {
      const roles = await storage.getAllRoles();
      res.json(roles);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/roles", requireAuth, async (req, res) => {
    try {
      const roleData = insertRoleSchema.parse(req.body);
      const role = await storage.createRole(roleData);
      res.json(role);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/roles/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const roleData = insertRoleSchema.partial().parse(req.body);
      const role = await storage.updateRole(id, roleData);
      res.json(role);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/roles/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteRole(id);
      res.json({ message: "Role deleted successfully" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Subscription plans
  app.get("/api/subscription-plans", requireAuth, async (req, res) => {
    try {
      const plans = await storage.getAllSubscriptionPlans();
      res.json(plans);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/subscription-plans", requireAuth, async (req, res) => {
    try {
      const planData = insertSubscriptionPlanSchema.parse(req.body);
      const plan = await storage.createSubscriptionPlan(planData);
      res.json(plan);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/subscription-plans/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const planData = insertSubscriptionPlanSchema.partial().parse(req.body);
      const plan = await storage.updateSubscriptionPlan(id, planData);
      res.json(plan);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Invoices
  app.get("/api/invoices", requireAuth, async (req, res) => {
    try {
      const invoices = await storage.getAllInvoices();
      res.json(invoices);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/invoices", requireAuth, async (req, res) => {
    try {
      const invoiceData = insertInvoiceSchema.parse(req.body);
      const invoice = await storage.createInvoice(invoiceData);
      res.json(invoice);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Login history tracking
  app.post("/api/login-history", requireAuth, async (req, res) => {
    try {
      const entryData = insertLoginHistorySchema.parse(req.body);
      const entry = await storage.createLoginHistoryEntry(entryData);
      res.json(entry);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // User activity tracking
  app.post("/api/user-activity", requireAuth, async (req, res) => {
    try {
      const activityData = insertUserActivitySchema.parse(req.body);
      const activity = await storage.createUserActivityEntry(activityData);
      res.json(activity);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Global Search across all entities
  app.get("/api/search", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const membership = await storage.ensureDefaultTenant(userId);
      const tenantId = membership.tenantId;
      const query = (req.query.q as string || '').trim();
      
      if (!query || query.length < 2) {
        return res.json({ contacts: [], calls: [], messages: [], leads: [], voicemails: [], recordings: [] });
      }

      const queryLower = query.toLowerCase();

      const [contacts, calls, messages, leads, voicemails, recordings] = await Promise.all([
        storage.searchContacts(tenantId, userId, query).then(results => results.slice(0, 5)),
        storage.getAllCalls(tenantId, userId).then(results => 
          results.filter(call => 
            call.phone?.toLowerCase().includes(queryLower) ||
            call.status?.toLowerCase().includes(queryLower) ||
            call.type?.toLowerCase().includes(queryLower)
          ).slice(0, 5)
        ),
        storage.getAllMessages(tenantId, userId).then(results =>
          results.filter(msg =>
            msg.phone?.toLowerCase().includes(queryLower) ||
            msg.content?.toLowerCase().includes(queryLower)
          ).slice(0, 5)
        ),
        storage.getAllLeads(tenantId, userId).then(results =>
          results.filter(lead =>
            lead.firstName?.toLowerCase().includes(queryLower) ||
            lead.lastName?.toLowerCase().includes(queryLower) ||
            lead.email?.toLowerCase().includes(queryLower) ||
            lead.company?.toLowerCase().includes(queryLower) ||
            lead.phone?.toLowerCase().includes(queryLower)
          ).slice(0, 5)
        ),
        storage.getAllVoicemails(tenantId, userId).then(results =>
          results.filter(vm =>
            vm.phone?.toLowerCase().includes(queryLower)
          ).slice(0, 5)
        ),
        storage.getAllRecordings(tenantId, userId).then(results =>
          results.filter(rec =>
            rec.phone?.toLowerCase().includes(queryLower) ||
            rec.transcript?.toLowerCase().includes(queryLower) ||
            rec.summary?.toLowerCase().includes(queryLower) ||
            rec.callerName?.toLowerCase().includes(queryLower)
          ).slice(0, 5)
        )
      ]);

      res.json({ contacts, calls, messages, leads, voicemails, recordings });
    } catch (error: any) {
      console.error('Global search error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Contacts
  app.get("/api/contacts", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const membership = await storage.ensureDefaultTenant(userId);
      const tenantId = membership.tenantId;
      const contacts = await storage.getAllContacts(tenantId, userId);
      res.json(contacts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/contacts/search", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const membership = await storage.ensureDefaultTenant(userId);
      const tenantId = membership.tenantId;
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ message: "Query parameter 'q' is required" });
      }
      const contacts = await storage.searchContacts(tenantId, userId, query);
      res.json(contacts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/contacts", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const membership = await storage.ensureDefaultTenant(userId);
      const tenantId = membership.tenantId;
      const contactData = insertContactSchema.parse(req.body);
      
      // Check if contact with this phone number already exists
      const existingContact = await storage.findContactByAnyPhoneFormat(tenantId, userId, contactData.phone);
      if (existingContact) {
        return res.status(409).json({ 
          message: `A contact with phone number ${contactData.phone} already exists. Contact name: ${existingContact.name}` 
        });
      }
      
      const contact = await storage.createContact(tenantId, userId, contactData);
      res.status(201).json(contact);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Validation error: " + error.errors.map((e: any) => e.message).join(', ') 
        });
      }
      res.status(400).json({ message: error.message || "Failed to create contact" });
    }
  });

  app.post("/api/contacts/upsert", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const membership = await storage.ensureDefaultTenant(userId);
      const tenantId = membership.tenantId;
      const contactData = insertContactSchema.parse(req.body);
      const contact = await storage.upsertContact(tenantId, userId, contactData);
      res.json(contact);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/contacts/:id", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const tenantId = req.tenantId!;
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid contact ID" });
      }
      
      const existingContact = await storage.getContact(tenantId, userId, id);
      if (!existingContact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      
      const contactData = insertContactSchema.partial().parse(req.body);
      
      // If phone is being updated, check for duplicates
      if (contactData.phone && contactData.phone !== existingContact.phone) {
        const duplicateContact = await storage.findContactByAnyPhoneFormat(tenantId, userId, contactData.phone);
        if (duplicateContact && duplicateContact.id !== id) {
          return res.status(409).json({ 
            message: `Phone number ${contactData.phone} is already used by contact: ${duplicateContact.name}` 
          });
        }
      }
      
      const contact = await storage.updateContact(tenantId, userId, id, contactData);
      res.json(contact);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Validation error: " + error.errors.map((e: any) => e.message).join(', ') 
        });
      }
      if (error.message === "Contact not found") {
        return res.status(404).json({ message: error.message });
      }
      res.status(400).json({ message: error.message || "Failed to update contact" });
    }
  });

  app.patch("/api/contacts/:id", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const tenantId = req.tenantId!;
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid contact ID" });
      }
      
      const existingContact = await storage.getContact(tenantId, userId, id);
      if (!existingContact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      
      const contactData = insertContactSchema.partial().parse(req.body);
      
      // If phone is being updated, check for duplicates
      if (contactData.phone && contactData.phone !== existingContact.phone) {
        const duplicateContact = await storage.findContactByAnyPhoneFormat(tenantId, userId, contactData.phone);
        if (duplicateContact && duplicateContact.id !== id) {
          return res.status(409).json({ 
            message: `Phone number ${contactData.phone} is already used by contact: ${duplicateContact.name}` 
          });
        }
      }
      
      const contact = await storage.updateContact(tenantId, userId, id, contactData);
      res.json(contact);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Validation error: " + error.errors.map((e: any) => e.message).join(', ') 
        });
      }
      if (error.message === "Contact not found") {
        return res.status(404).json({ message: error.message });
      }
      res.status(400).json({ message: error.message || "Failed to update contact" });
    }
  });

  app.delete("/api/contacts/:id", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const tenantId = req.tenantId!;
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid contact ID" });
      }
      
      const contact = await storage.getContact(tenantId, userId, id);
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      
      await storage.deleteContact(tenantId, userId, id);
      res.json({ message: "Contact deleted successfully", deletedContact: contact });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to delete contact" });
    }
  });

  // Contact specific actions
  app.post("/api/contacts/:id/favorite", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const tenantId = req.tenantId!;
      const id = parseInt(req.params.id);
      const { isFavorite } = req.body;
      
      // Add favorite to tags array
      const contact = await storage.getContact(tenantId, userId, id);
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }

      const currentTags = contact.tags || [];
      let updatedTags;
      
      if (isFavorite) {
        updatedTags = currentTags.includes('favorite') ? currentTags : [...currentTags, 'favorite'];
      } else {
        updatedTags = currentTags.filter(tag => tag !== 'favorite');
      }

      const updatedContact = await storage.updateContact(tenantId, userId, id, { tags: updatedTags });
      res.json(updatedContact);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/contacts/:id/disposition", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const tenantId = req.tenantId!;
      const id = parseInt(req.params.id);
      const { disposition } = req.body;
      
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid contact ID" });
      }
      
      if (!disposition) {
        return res.status(400).json({ message: "Disposition is required" });
      }
      
      // Validate disposition is one of the allowed values
      const validDispositions = [
        'answered', 'human', 'voicemail', 'machine', 'busy', 'no-answer', 'failed', 
        'callback-requested', 'interested', 'not-interested', 'qualified', 
        'wrong-number', 'disconnected', 'dnc-requested', 'dnc-skipped'
      ];
      
      if (!validDispositions.includes(disposition)) {
        return res.status(400).json({ 
          message: `Invalid disposition. Must be one of: ${validDispositions.join(', ')}` 
        });
      }
      
      const contact = await storage.getContact(tenantId, userId, id);
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }

      const updatedContact = await storage.updateContact(tenantId, userId, id, { 
        disposition,
        lastContactedAt: new Date()
      });
      res.json(updatedContact);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/contacts/:id/call", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const tenantId = req.tenantId!;
      const id = parseInt(req.params.id);
      const contact = await storage.getContact(tenantId, userId, id);
      
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }

      if (contact.doNotCall) {
        return res.status(400).json({ message: "This contact has opted out of calls" });
      }

      // Update last contacted timestamp
      await storage.updateContact(tenantId, userId, id, {
        lastContactedAt: new Date()
      });

      res.json({ 
        message: "Call initiated",
        contact: contact,
        phone: contact.phone
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Bulk contact operations
  app.post("/api/contacts/bulk/export", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const { contactIds } = req.body;
      let contacts;
      
      if (contactIds && contactIds.length > 0) {
        contacts = await Promise.all(contactIds.map((id: number) => storage.getContact(userId, id)));
        contacts = contacts.filter(Boolean); // Remove null results
      } else {
        contacts = await storage.getAllContacts(userId);
      }

      // Convert to CSV format
      const csvHeaders = ['Name', 'Phone', 'Email', 'Company', 'Job Title', 'Lead Status', 'Priority', 'Tags'];
      const csvRows = contacts.map(contact => [
        contact.name,
        contact.phone,
        contact.email || '',
        contact.company || '',
        contact.jobTitle || '',
        contact.leadStatus || 'new',
        contact.priority || 'medium',
        contact.tags?.join(';') || ''
      ]);

      const csvContent = [csvHeaders, ...csvRows]
        .map(row => row.map(field => `"${field}"`).join(','))
        .join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="contacts.csv"');
      res.send(csvContent);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/contacts/bulk/call", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const { contactIds } = req.body;
      
      if (!contactIds || contactIds.length === 0) {
        return res.status(400).json({ message: "Contact IDs are required" });
      }

      const results = [];
      for (const id of contactIds) {
        const contact = await storage.getContact(userId, id);
        if (contact && !contact.doNotCall) {
          await storage.updateContact(userId, id, {
            lastContactedAt: new Date()
          });
          results.push({ id, phone: contact.phone, status: 'queued' });
        } else {
          results.push({ id, status: 'skipped', reason: contact?.doNotCall ? 'Do not call' : 'Contact not found' });
        }
      }

      res.json({ 
        message: "Bulk call operation processed",
        results
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/contacts/bulk/sms", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const { contactIds, message } = req.body;
      
      if (!contactIds || contactIds.length === 0) {
        return res.status(400).json({ message: "Contact IDs are required" });
      }

      if (!message) {
        return res.status(400).json({ message: "Message content is required" });
      }

      const results = [];
      for (const id of contactIds) {
        const contact = await storage.getContact(userId, id);
        if (contact && !contact.doNotSms) {
          results.push({ id, phone: contact.phone, status: 'queued' });
        } else {
          results.push({ id, status: 'skipped', reason: contact?.doNotSms ? 'Do not SMS' : 'Contact not found' });
        }
      }

      res.json({ 
        message: "Bulk SMS operation processed",
        results
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/contacts/bulk/email", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const { contactIds, subject, message } = req.body;
      
      if (!contactIds || contactIds.length === 0) {
        return res.status(400).json({ message: "Contact IDs are required" });
      }

      if (!subject || !message) {
        return res.status(400).json({ message: "Subject and message are required" });
      }

      const results = [];
      for (const id of contactIds) {
        const contact = await storage.getContact(userId, id);
        if (contact && contact.email && !contact.doNotEmail) {
          results.push({ id, email: contact.email, status: 'queued' });
        } else {
          results.push({ id, status: 'skipped', reason: contact?.doNotEmail ? 'Do not email' : 'No email or contact not found' });
        }
      }

      res.json({ 
        message: "Bulk email operation processed",
        results
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Calls
  app.get("/api/calls", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const membership = await storage.ensureDefaultTenant(userId);
      const tenantId = membership.tenantId;
      
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      
      const result = await storage.getAllCalls(tenantId, userId, { page, limit });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/calls/recent", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const membership = await storage.ensureDefaultTenant(userId);
      const tenantId = membership.tenantId;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const calls = await storage.getRecentCalls(tenantId, userId, limit);
      res.json(calls);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/calls/stats", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const membership = await storage.ensureDefaultTenant(userId);
      const tenantId = membership.tenantId;
      const stats = await storage.getCallStats(tenantId, userId);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/calls/active", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const membership = await storage.ensureDefaultTenant(userId);
      const tenantId = membership.tenantId;
      const activeCalls = await storage.getActiveCalls(tenantId, userId);
      res.json(activeCalls);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/calls/by-status", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const membership = await storage.ensureDefaultTenant(userId);
      const tenantId = membership.tenantId;
      const allCalls = await storage.getAllCalls(tenantId, userId);
      
      const enrichedCalls = await Promise.all(allCalls.map(async (call) => {
        let contactName = null;
        let agentName = null;
        
        if (call.contactId) {
          const contact = await storage.getContact(tenantId, userId, call.contactId);
          if (contact) {
            contactName = contact.name;
          }
        }
        
        const user = await storage.getUser(call.userId);
        if (user) {
          agentName = user.username || user.firstName || user.email;
        }
        
        return {
          ...call,
          contactName,
          agentName
        };
      }));
      
      const grouped = {
        queued: enrichedCalls.filter(call => call.status === 'queued'),
        initiated: enrichedCalls.filter(call => call.status === 'initiated'),
        ringing: enrichedCalls.filter(call => call.status === 'ringing'),
        inProgress: enrichedCalls.filter(call => call.status === 'in-progress'),
        completed: enrichedCalls.filter(call => call.status === 'completed'),
        busy: enrichedCalls.filter(call => call.status === 'busy'),
        failed: enrichedCalls.filter(call => call.status === 'failed'),
        noAnswer: enrichedCalls.filter(call => call.status === 'no-answer'),
        voicemail: enrichedCalls.filter(call => call.outcome === 'voicemail' || call.status === 'voicemail'),
        dropped: enrichedCalls.filter(call => call.status === 'call-dropped'),
        canceled: enrichedCalls.filter(call => call.status === 'canceled')
      };
      
      const summary = {
        totalCalls: enrichedCalls.length,
        active: grouped.queued.length + grouped.initiated.length + grouped.ringing.length + grouped.inProgress.length,
        connected: grouped.inProgress.length,
        completed: grouped.completed.length,
        failed: grouped.failed.length + grouped.busy.length + grouped.noAnswer.length,
        voicemail: grouped.voicemail.length,
        dropped: grouped.dropped.length
      };
      
      res.json({ grouped, summary });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Create test call data
  app.post("/api/calls/test", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const testCalls = [
        {
          userId,
          phone: '+1234567890',
          status: 'completed',
          type: 'outbound',
          duration: 300,
          cost: '0.0250',
          callQuality: 4,
          contactId: 1,
          tags: ['sales', 'follow-up'],
          priority: 'high',
          sentiment: 'positive',
          callPurpose: 'sales',
          outcome: 'successful',
          transcript: 'Customer showed interest in premium package.',
          summary: 'Sales call with positive outcome',
          actionItems: ['Schedule follow-up call', 'Send premium package details'],
          followUpRequired: true,
          keywords: ['premium', 'package', 'sales'],
          followUpDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          followUpNotes: 'Schedule demo for premium package',
          codec: 'G.711',
          bitrate: 64000,
          jitter: 12,
          packetLoss: '0.1',
          location: 'New York, NY',
          carrier: 'Verizon',
          deviceType: 'mobile',
          userAgent: 'SIPClient/3.0',
          transferredFrom: null,
          transferredTo: null,
          customFields: {},
          metadata: {}
        },
        {
          userId,
          phone: '+1987654321',
          status: 'missed',
          type: 'inbound',
          duration: 0,
          cost: '0.0000',
          callQuality: null,
          contactId: 2,
          tags: ['urgent'],
          priority: 'high',
          sentiment: 'neutral',
          callPurpose: 'support',
          outcome: 'missed',
          transcript: null,
          summary: 'Missed call from customer',
          actionItems: ['Call back customer'],
          followUpRequired: true,
          keywords: [],
          followUpDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
          followUpNotes: 'Return call as soon as possible',
          codec: null,
          bitrate: null,
          jitter: null,
          packetLoss: null,
          location: 'Los Angeles, CA',
          carrier: 'AT&T',
          deviceType: 'mobile',
          userAgent: null,
          transferredFrom: null,
          transferredTo: null,
          customFields: {},
          metadata: {}
        }
      ];

      const createdCalls = [];
      for (const call of testCalls) {
        const created = await storage.createCall(userId, call);
        createdCalls.push(created);
      }

      res.json({ message: 'Test calls created successfully', calls: createdCalls });
    } catch (error: any) {
      console.error('Error creating test calls:', error);
      res.status(500).json({ message: 'Failed to create test calls', error: error.message });
    }
  });

  app.post("/api/calls", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const callData = insertCallSchema.parse(req.body);
      const call = await storage.createCall(userId, callData);
      wsService.broadcastNewCall(userId, call);
      res.json(call);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/calls/:id", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      const callData = insertCallSchema.partial().parse(req.body);
      const call = await storage.updateCall(userId, id, callData);
      wsService.broadcastCallUpdate(userId, call);
      res.json(call);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/calls/:id", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      await storage.deleteCall(userId, id);
      res.json({ message: "Call deleted successfully" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Call Notes
  app.get("/api/call-notes", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const notes = await storage.getAllCallNotes(userId);
      res.json(notes);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/call-notes/call/:callId", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const callId = parseInt(req.params.callId);
      const notes = await storage.getCallNotesByCall(userId, callId);
      res.json(notes);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/call-notes/contact/:contactId", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const contactId = parseInt(req.params.contactId);
      const notes = await storage.getCallNotesByContact(userId, contactId);
      res.json(notes);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/call-notes/phone/:phone", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const phone = req.params.phone;
      const notes = await storage.getCallNotesByPhone(userId, phone);
      res.json(notes);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/call-notes", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const noteData = insertCallNoteSchema.parse(req.body);
      const note = await storage.createCallNote(userId, noteData);
      res.json(note);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/call-notes/:id", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      const noteData = insertCallNoteSchema.partial().parse(req.body);
      const note = await storage.updateCallNote(userId, id, noteData);
      res.json(note);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/call-notes/:id", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      await storage.deleteCallNote(userId, id);
      res.json({ message: "Call note deleted successfully" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Messages
  app.get("/api/messages", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const membership = await storage.ensureDefaultTenant(userId);
      const tenantId = membership.tenantId;
      const messages = await storage.getAllMessages(tenantId, userId);
      res.json(messages);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/recordings", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const membership = await storage.ensureDefaultTenant(userId);
      const tenantId = membership.tenantId;
      const recordings = await storage.getAllRecordings(tenantId, userId);
      res.json(recordings);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/voicemails", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const membership = await storage.ensureDefaultTenant(userId);
      const tenantId = membership.tenantId;
      const voicemails = await storage.getAllVoicemails(tenantId, userId);
      res.json(voicemails);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/messages/contact/:contactId", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const membership = await storage.ensureDefaultTenant(userId);
      const tenantId = membership.tenantId;
      const contactId = parseInt(req.params.contactId);
      const messages = await storage.getMessagesByContact(tenantId, userId, contactId);
      res.json(messages);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/messages/phone/:phone", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const membership = await storage.ensureDefaultTenant(userId);
      const tenantId = membership.tenantId;
      const phone = req.params.phone;
      const messages = await storage.getMessagesByPhone(tenantId, userId, phone);
      res.json(messages);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/messages/search", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const membership = await storage.ensureDefaultTenant(userId);
      const tenantId = membership.tenantId;
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ message: "Query parameter 'q' is required" });
      }
      const contacts = await storage.searchContacts(tenantId, userId, query);
      res.json(contacts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/messages/unread/count", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const membership = await storage.ensureDefaultTenant(userId);
      const tenantId = membership.tenantId;
      const count = await storage.getUnreadMessageCount(tenantId, userId);
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/messages/:id/read", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const membership = await storage.ensureDefaultTenant(userId);
      const tenantId = membership.tenantId;
      const id = parseInt(req.params.id);
      const message = await storage.markMessageAsRead(tenantId, userId, id);
      res.json(message);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // SMS Templates
  app.get("/api/sms/templates", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const templates = await storage.getAllSmsTemplates(userId);
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/sms/templates/category/:category", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const category = req.params.category;
      const templates = await storage.getSmsTemplatesByCategory(userId, category);
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/sms/templates", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const templateData = insertSmsTemplateSchema.parse(req.body);
      const template = await storage.createSmsTemplate(userId, templateData);
      res.json(template);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/sms/templates/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      const templateData = insertSmsTemplateSchema.partial().parse(req.body);
      const template = await storage.updateSmsTemplate(userId, id, templateData);
      res.json(template);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/sms/templates/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      await storage.deleteSmsTemplate(userId, id);
      res.json({ message: "Template deleted successfully" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // SMS Campaigns
  app.get("/api/sms/campaigns", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const campaigns = await storage.getAllSmsCampaigns(userId);
      res.json(campaigns);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/sms/campaigns", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const campaignData = insertSmsCampaignSchema.parse(req.body);
      const campaign = await storage.createSmsCampaign(userId, campaignData);
      res.json(campaign);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/sms/campaigns/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      const campaignData = insertSmsCampaignSchema.partial().parse(req.body);
      const campaign = await storage.updateSmsCampaign(userId, id, campaignData);
      res.json(campaign);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/sms/campaigns/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      await storage.deleteSmsCampaign(userId, id);
      res.json({ message: "Campaign deleted successfully" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // SMS Analytics
  app.get("/api/sms/analytics", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const analytics = await storage.getMessageAnalytics(userId);
      res.json(analytics);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/messages", smsLimiter, checkJwt, async (req, res) => {
    try {
      // Get authenticated user
      const auth = (req as any).auth;
      if (!auth || !auth.sub) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const auth0UserId = auth.sub;
      const user = await storage.getUserByAuth0Id(auth0UserId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { contactId, phone, content, type = "sent" } = req.body;
      
      if (!phone || !content) {
        return res.status(400).json({ message: "Phone number and message content are required" });
      }

      // Send SMS via Twilio using user's credentials
      let twilioMessageSid: string | null = null;
      let twilioStatus = 'sent';
      
      try {
        const twilioResponse = await userTwilioCache.sendSms(user.id, phone, content);
        twilioMessageSid = twilioResponse.sid;
        twilioStatus = twilioResponse.status;
        console.log(`📨 SMS sent by user ${user.id} to ${phone}: ${twilioMessageSid}`);
      } catch (twilioError: any) {
        console.error('Twilio SMS error:', twilioError);
        return res.status(500).json({ 
          message: "Failed to send SMS via Twilio",
          error: twilioError.message 
        });
      }

      // Save message to database
      const messageData = {
        userId: user.id,
        contactId,
        phone,
        content,
        type,
        status: twilioStatus,
        metadata: { 
          twilioMessageSid,
          userId: user.id,
          sentBy: user.username
        }
      };
      
      const message = await storage.createMessage(user.id, messageData);
      
      res.json({
        ...message,
        twilioSid: twilioMessageSid,
        twilioStatus
      });
    } catch (error: any) {
      console.error('Message send error:', error);
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/messages/:id", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      await storage.deleteMessage(userId, id);
      res.json({ message: "Message deleted successfully" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Advanced Recording Management System
  
  // Get recordings with advanced filtering and pagination
  app.get("/api/recordings", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const membership = await storage.ensureDefaultTenant(userId);
      const tenantId = membership.tenantId;
      const {
        page = 1,
        limit = 50,
        search,
        status,
        category,
        direction,
        startDate,
        endDate,
        hasTranscript,
        sentiment,
        starred,
        archived,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      console.log(`📼 Fetching recordings for user ${userId}: page=${page}, limit=${limit}, filters=${JSON.stringify({ search, status, direction })}`);

      const filters = {
        search: search as string,
        status: status as string,
        category: category as string,
        direction: direction as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        hasTranscript: hasTranscript === 'true',
        sentiment: sentiment as string,
        starred: starred === 'true',
        archived: archived === 'true'
      };

      const recordings = await storage.getRecordings(tenantId, userId, {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        filters,
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc'
      });
      
      console.log(`✅ Successfully fetched ${recordings.recordings.length} recordings for user ${userId} (total: ${recordings.total})`);
      res.json(recordings);
    } catch (error: any) {
      console.error(`❌ Failed to fetch recordings for user ${getUserIdFromRequest(req)}:`, error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get recording statistics and analytics
  app.get("/api/recordings/stats", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const membership = await storage.ensureDefaultTenant(userId);
      const tenantId = membership.tenantId;
      console.log(`📊 Fetching recording stats for user ${userId}`);
      const stats = await storage.getRecordingStats(tenantId, userId);
      res.json(stats);
    } catch (error: any) {
      console.error(`❌ Failed to fetch recording stats:`, error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get BunnyCDN configuration status
  app.get("/api/bunnycdn/config-status", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      console.log(`🔧 Checking BunnyCDN configuration for user ${userId}`);
      
      // Dynamic import to avoid circular dependencies
      const { bunnycdnService } = await import('./services/bunnycdnService');
      
      const configStatus = bunnycdnService.getConfigurationStatus();
      
      // Add helpful setup instructions
      const setupInstructions = {
        required: [
          {
            key: 'BUNNYCDN_API_KEY',
            name: 'API Key',
            configured: configStatus.details.apiKey,
            description: 'Your BunnyCDN API key from Account Settings'
          },
          {
            key: 'BUNNYCDN_STORAGE_ZONE',
            name: 'Storage Zone Name',
            configured: configStatus.details.storageZone,
            description: 'The name of your BunnyCDN storage zone'
          },
          {
            key: 'BUNNYCDN_STORAGE_PASSWORD',
            name: 'Storage Password',
            configured: configStatus.details.storagePassword,
            description: 'Password/Access Key for your storage zone'
          }
        ],
        optional: [
          {
            key: 'BUNNYCDN_PULL_ZONE_URL',
            name: 'Pull Zone URL',
            configured: configStatus.details.pullZoneUrl,
            description: 'Your CDN pull zone URL (e.g., https://yourzone.b-cdn.net) for faster delivery',
            recommended: true
          },
          {
            key: 'BUNNYCDN_TOKEN_AUTH_KEY',
            name: 'Token Authentication Key',
            configured: configStatus.details.tokenAuthKey,
            description: 'Token key for signed URLs (enables secure, time-limited access)',
            recommended: true
          },
          {
            key: 'BUNNYCDN_REGION',
            name: 'Storage Region',
            configured: !!process.env.BUNNYCDN_REGION,
            description: 'Storage region (e.g., "ny", "la", "sg"). Leave empty for default region.'
          }
        ]
      };

      res.json({
        isConfigured: configStatus.isConfigured,
        hasTokenAuth: configStatus.hasTokenAuth,
        hasPullZone: configStatus.hasPullZone,
        secureAccessEnabled: configStatus.hasTokenAuth && configStatus.hasPullZone,
        setupInstructions,
        message: configStatus.isConfigured 
          ? 'BunnyCDN is configured and ready to use' 
          : 'BunnyCDN is not fully configured. Please set the required environment variables.'
      });
    } catch (error: any) {
      console.error(`❌ Failed to check BunnyCDN configuration:`, error);
      res.status(500).json({ message: error.message });
    }
  });

  // Sync recordings from Twilio
  app.post("/api/recordings/sync", checkJwt, requireAuth, async (req, res) => {
    try {
      const auth = (req as any).auth;
      if (!auth || !auth.sub) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const auth0UserId = auth.sub;
      const user = await storage.getUserByAuth0Id(auth0UserId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { 
        forceRefresh = false, 
        downloadToLocal = false,
        generateTranscription = false,
        syncAll = false,
        dateRange
      } = req.body;

      const options = {
        forceRefresh,
        downloadToLocal,
        generateTranscription,
        syncAll,
        dateRange: dateRange ? {
          startDate: new Date(dateRange.startDate),
          endDate: new Date(dateRange.endDate)
        } : undefined
      };

      const result = await recordingService.syncRecordingsFromTwilio(user.id, options);
      res.json({
        message: "Recording sync completed",
        ...result
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Recording settings endpoints (must be before :id route)
  app.get("/api/recordings/settings", requireSessionAuth, async (req, res) => {
    try {
      const userId = (req as any).session?.userId;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Get all recording-related settings for this user
      const autoSync = await storage.getSetting(`recording_auto_sync_user_${user.id}`);
      const downloadLocal = await storage.getSetting(`recording_download_local_user_${user.id}`);
      const autoTranscript = await storage.getSetting(`recording_auto_transcript_user_${user.id}`);
      const sentimentAnalysis = await storage.getSetting(`recording_sentiment_analysis_user_${user.id}`);
      const retentionPeriod = await storage.getSetting(`recording_retention_period_user_${user.id}`);

      res.json({
        autoSync: autoSync?.value === true || autoSync?.value === "true" || false,
        downloadLocal: downloadLocal?.value === true || downloadLocal?.value === "true" || false,
        autoTranscript: autoTranscript?.value === true || autoTranscript?.value === "true" || false,
        sentimentAnalysis: sentimentAnalysis?.value === true || sentimentAnalysis?.value === "true" || false,
        retentionPeriod: retentionPeriod?.value || "1year"
      });
    } catch (error: any) {
      console.error("Error getting recording settings:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/recordings/settings", requireSessionAuth, async (req, res) => {
    try {
      const userId = (req as any).session?.userId;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { setting, value } = req.body;
      
      // Validate setting name
      const validSettings = ['autoSync', 'downloadLocal', 'autoTranscript', 'sentimentAnalysis', 'retentionPeriod'];
      if (!validSettings.includes(setting)) {
        return res.status(400).json({ error: "Invalid setting name" });
      }

      // Map frontend setting names to backend keys
      const settingKey = `recording_${setting.replace(/([A-Z])/g, '_$1').toLowerCase()}_user_${user.id}`;
      
      // Save the setting
      await storage.setSetting(settingKey, value);
      
      console.log(`✅ Recording setting ${setting} updated to ${value} for user ${user.id}`);
      
      res.json({
        success: true,
        message: `${setting} setting updated successfully`,
        setting,
        value
      });
    } catch (error: any) {
      console.error("Error updating recording setting:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get individual recording details
  app.get("/api/recordings/:id", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      console.log(`📼 Fetching recording ${id} for user ${userId}`);
      
      const recording = await storage.getRecording(userId, id);
      
      if (!recording) {
        console.warn(`⚠️ Recording ${id} not found for user ${userId}`);
        return res.status(404).json({ message: "Recording not found" });
      }

      // Increment play count
      await storage.updateRecording(userId, id, {
        playCount: (recording.playCount || 0) + 1,
        lastPlayedAt: new Date()
      });

      console.log(`✅ Recording ${id} fetched successfully for user ${userId}`);
      res.json(recording);
    } catch (error: any) {
      console.error(`❌ Failed to fetch recording ${req.params.id} for user ${getUserIdFromRequest(req)}:`, error);
      res.status(500).json({ message: error.message });
    }
  });

  // Stream/play recording audio
  app.get("/api/recordings/:id/play", downloadLimiter, checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      console.log(`▶️ Playing recording ${id} for user ${userId}`);
      
      const recording = await storage.getRecording(userId, id);
      
      if (!recording) {
        console.warn(`⚠️ Recording ${id} not found for user ${userId}`);
        return res.status(404).json({ message: "Recording not found" });
      }

      if (recording.bunnycdnUrl) {
        // Stream from BunnyCDN with range support (secure proxy - no URL exposure)
        console.log(`🐰 Streaming from BunnyCDN for recording ${id} (proxied)`);
        try {
          const axios = (await import('axios')).default;
          const { bunnycdnService } = await import('./services/bunnycdnService');
          const range = req.headers.range;
          
          // Generate signed URL if token auth is configured (1 hour expiry for playback)
          // NOTE: Don't use IP restriction for server-proxied requests - only for direct client access
          const playbackUrl = bunnycdnService.isSecureAccessConfigured()
            ? bunnycdnService.generateSignedUrl(recording.bunnycdnUrl, { 
                expiresIn: 3600 // 1 hour
              })
            : recording.bunnycdnUrl;
          
          console.log(`🔒 Using ${bunnycdnService.isSecureAccessConfigured() ? 'signed' : 'public'} URL for server-proxied playback`);
          
          const axiosConfig: any = {
            responseType: 'stream',
            timeout: 60000
          };
          
          // Forward Range header for seeking/progressive playback
          if (range) {
            axiosConfig.headers = { Range: range };
          }
          
          const response = await axios.get(playbackUrl, axiosConfig);
          
          // Security headers
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('X-Frame-Options', 'DENY');
          
          // Forward CDN response headers to client
          if (response.status === 206) {
            res.status(206);
            if (response.headers['content-range']) {
              res.setHeader('Content-Range', response.headers['content-range']);
            }
            if (response.headers['accept-ranges']) {
              res.setHeader('Accept-Ranges', response.headers['accept-ranges']);
            }
          }
          
          if (response.headers['content-length']) {
            res.setHeader('Content-Length', response.headers['content-length']);
          }
          res.setHeader('Content-Type', 'audio/mpeg');
          
          response.data.pipe(res);
        } catch (error: any) {
          console.error(`❌ Failed to stream from storage for recording ${id}:`, error.message);
          // Don't expose any URLs in error messages - generic error only
          res.status(500).json({ message: "Failed to stream recording" });
        }
      } else if (recording.twilioUrl) {
        // Redirect to Twilio URL with authentication (legacy recordings)
        console.log(`🔗 Redirecting to Twilio URL for recording ${id}`);
        res.redirect(recording.twilioUrl);
      } else {
        console.error(`❌ Recording ${id} has no available file or URL`);
        res.status(404).json({ message: "Recording file not found" });
      }
    } catch (error: any) {
      console.error(`❌ Failed to play recording ${req.params.id} for user ${getUserIdFromRequest(req)}:`, error);
      res.status(500).json({ message: error.message });
    }
  });

  // REMOVED: signed-url endpoint for security reasons
  // All recording access should go through secure proxy endpoints (/play or /download)
  // This prevents CDN URL structure exposure to the frontend

  // Download recording
  app.get("/api/recordings/:id/download", downloadLimiter, checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      console.log(`📥 Downloading recording ${id} for user ${userId}`);
      
      const recording = await storage.getRecording(userId, id);
      
      if (!recording) {
        console.warn(`⚠️ Recording ${id} not found for user ${userId}`);
        return res.status(404).json({ message: "Recording not found" });
      }

      // Update download count
      await storage.updateRecording(userId, id, {
        downloadCount: (recording.downloadCount || 0) + 1,
        lastDownloadedAt: new Date()
      });

      const fileName = `recording_${recording.twilioRecordingSid}_${recording.phone}.mp3`;

      if (recording.bunnycdnUrl) {
        // Download from BunnyCDN and stream to client (secure proxy - no URL exposure)
        console.log(`🐰 Downloading from BunnyCDN for recording ${id} (proxied)`);
        try {
          const axios = (await import('axios')).default;
          const { bunnycdnService } = await import('./services/bunnycdnService');
          
          // Generate signed URL if token auth is configured (30 min expiry for downloads)
          // NOTE: Don't use IP restriction for server-proxied requests - only for direct client access
          const downloadUrl = bunnycdnService.isSecureAccessConfigured()
            ? bunnycdnService.generateSignedUrl(recording.bunnycdnUrl, { 
                expiresIn: 1800 // 30 minutes
              })
            : recording.bunnycdnUrl;
          
          console.log(`🔒 Using ${bunnycdnService.isSecureAccessConfigured() ? 'signed' : 'public'} URL for server-proxied download`);
          
          const response = await axios.get(downloadUrl, {
            responseType: 'stream',
            timeout: 60000
          });
          
          // Security headers
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('X-Frame-Options', 'DENY');
          res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
          res.setHeader('Content-Type', 'audio/mpeg');
          
          response.data.pipe(res);
        } catch (error: any) {
          console.error(`❌ Failed to download from storage for recording ${id}:`, error.message);
          // Don't expose any URLs in error messages - generic error only
          res.status(500).json({ message: "Failed to download recording" });
        }
      } else if (recording.twilioUrl) {
        // Download from Twilio (legacy recordings)
        console.log(`🔗 Downloading from Twilio URL for recording ${id}`);
        res.redirect(recording.twilioUrl);
      } else {
        console.error(`❌ Recording ${id} has no available file or URL`);
        res.status(404).json({ message: "Recording file not found" });
      }
    } catch (error: any) {
      console.error(`❌ Failed to download recording ${req.params.id} for user ${getUserIdFromRequest(req)}:`, error);
      res.status(500).json({ message: error.message });
    }
  });

  // Generate transcript for recording
  app.post("/api/recordings/:id/transcript", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      console.log(`🎤 Generating transcript for recording ${id}, user ${userId}`);
      
      const transcript = await recordingService.generateTranscript(userId, id);
      console.log(`✅ Transcript generated for recording ${id}`);
      res.json({ transcript });
    } catch (error: any) {
      console.error(`❌ Failed to generate transcript for recording ${req.params.id}:`, error);
      res.status(500).json({ message: error.message });
    }
  });

  // Analyze recording with AI
  app.post("/api/recordings/:id/analyze", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      console.log(`🧠 Analyzing recording ${id} for user ${userId}`);
      
      await recordingService.analyzeRecording(userId, id);
      
      const updatedRecording = await storage.getRecording(userId, id);
      console.log(`✅ Recording ${id} analyzed successfully`);
      res.json({ 
        message: "Recording analyzed successfully",
        analysis: {
          summary: updatedRecording?.summary,
          sentiment: updatedRecording?.sentiment,
          keywords: updatedRecording?.keywords,
          topics: updatedRecording?.topics,
          actionItems: updatedRecording?.actionItems
        }
      });
    } catch (error: any) {
      console.error(`❌ Failed to analyze recording ${req.params.id}:`, error);
      res.status(500).json({ message: error.message });
    }
  });

  // Update recording metadata
  app.put("/api/recordings/:id", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      const updateData = req.body;
      
      // Validate allowed fields for user updates
      const allowedFields = ['tags', 'category', 'priority', 'isStarred', 'isArchived', 'customFields'];
      const filteredData = Object.keys(updateData)
        .filter(key => allowedFields.includes(key))
        .reduce((obj, key) => {
          obj[key] = updateData[key];
          return obj;
        }, {} as any);

      const recording = await storage.updateRecording(userId, id, {
        ...filteredData,
        updatedAt: new Date()
      });
      
      res.json(recording);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Bulk operations on recordings
  app.post("/api/recordings/bulk/:action", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const { action } = req.params;
      const { recordingIds, data } = req.body;

      if (!recordingIds || !Array.isArray(recordingIds)) {
        return res.status(400).json({ message: "Recording IDs are required" });
      }

      const results = [];

      switch (action) {
        case 'delete':
          for (const id of recordingIds) {
            try {
              await storage.deleteRecording(userId, id);
              results.push({ id, status: 'deleted' });
            } catch (error: any) {
              results.push({ id, status: 'error', error: error.message });
            }
          }
          break;

        case 'archive':
          for (const id of recordingIds) {
            try {
              await storage.updateRecording(userId, id, { isArchived: true });
              results.push({ id, status: 'archived' });
            } catch (error: any) {
              results.push({ id, status: 'error', error: error.message });
            }
          }
          break;

        case 'star':
          for (const id of recordingIds) {
            try {
              await storage.updateRecording(userId, id, { isStarred: true });
              results.push({ id, status: 'starred' });
            } catch (error: any) {
              results.push({ id, status: 'error', error: error.message });
            }
          }
          break;

        case 'tag':
          if (!data.tags) {
            return res.status(400).json({ message: "Tags are required for tag action" });
          }
          for (const id of recordingIds) {
            try {
              const recording = await storage.getRecording(userId, id);
              if (recording) {
                const existingTags = recording.tags || [];
                const combinedTags = [...existingTags, ...data.tags];
                const uniqueTagsSet = new Set(combinedTags);
                const newTags = Array.from(uniqueTagsSet);
                await storage.updateRecording(userId, id, { tags: newTags });
                results.push({ id, status: 'tagged' });
              }
            } catch (error: any) {
              results.push({ id, status: 'error', error: error.message });
            }
          }
          break;

        case 'categorize':
          if (!data.category) {
            return res.status(400).json({ message: "Category is required for categorize action" });
          }
          for (const id of recordingIds) {
            try {
              await storage.updateRecording(userId, id, { category: data.category });
              results.push({ id, status: 'categorized' });
            } catch (error: any) {
              results.push({ id, status: 'error', error: error.message });
            }
          }
          break;

        default:
          return res.status(400).json({ message: "Invalid bulk action" });
      }

      res.json({
        message: `Bulk ${action} completed`,
        results
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Download from Twilio and store locally
  app.post("/api/recordings/:id/download-local", checkJwt, requireAuth, async (req, res) => {
    try {
      const auth = (req as any).auth;
      if (!auth || !auth.sub) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const auth0UserId = auth.sub;
      const user = await storage.getUserByAuth0Id(auth0UserId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const id = parseInt(req.params.id);
      const recording = await storage.getRecording(user.id, id);
      
      if (!recording) {
        return res.status(404).json({ message: "Recording not found" });
      }

      if (!recording.twilioRecordingSid) {
        return res.status(400).json({ message: "No Twilio recording SID found" });
      }

      const filePath = await recordingService.downloadRecording(user.id, recording.twilioRecordingSid);
      res.json({ 
        message: "Recording downloaded successfully",
        localPath: filePath
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Migrate recording to BunnyCDN
  app.post("/api/recordings/:id/migrate-bunnycdn", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      
      console.log(`📤 Manual BunnyCDN migration requested for recording ${id} by user ${userId}`);
      
      // Dynamic import to avoid circular dependencies
      const { bunnycdnService } = await import('./services/bunnycdnService');
      
      // Check if BunnyCDN is configured
      if (!bunnycdnService.isConfigured()) {
        return res.status(400).json({ 
          message: "BunnyCDN is not configured. Please set BUNNYCDN_API_KEY, BUNNYCDN_STORAGE_ZONE, and BUNNYCDN_STORAGE_PASSWORD." 
        });
      }

      // Get recording
      const recording = await storage.getRecording(userId, id);
      if (!recording) {
        return res.status(404).json({ message: "Recording not found" });
      }

      // Get Twilio client for this user
      const { client: twilioClient, credentials } = await userTwilioCache.getTwilioClient(userId);
      
      if (!twilioClient || !credentials) {
        return res.status(400).json({ 
          message: "Twilio credentials not configured for your account" 
        });
      }

      // Migrate to BunnyCDN
      const result = await bunnycdnService.migrateRecordingToBunnyCDN(
        userId,
        id,
        twilioClient,
        credentials
      );

      res.json({
        message: "Migration completed",
        uploaded: result.uploaded,
        deleted: result.deleted,
        cdnUrl: result.cdnUrl,
        recordingId: id
      });
    } catch (error: any) {
      console.error(`❌ BunnyCDN migration failed:`, error);
      res.status(500).json({ message: error.message });
    }
  });

  // BunnyCDN Integration Diagnostic Endpoint
  app.get("/api/bunnycdn/diagnostic", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      console.log(`🔍 BunnyCDN diagnostic check requested by user ${userId}`);

      const { bunnycdnService } = await import('./services/bunnycdnService');
      
      // Get configuration status
      const configStatus = bunnycdnService.getConfigurationStatus();
      
      // Check for recordings in database
      const allRecordings = await storage.getAllRecordings(userId);
      const recordingsWithBunny = allRecordings.filter((r: any) => r.bunnycdnUrl);
      const recordingsWithTwilioOnly = allRecordings.filter((r: any) => r.twilioUrl && !r.bunnycdnUrl);
      const recordingsWithLocalFiles = allRecordings.filter((r: any) => r.localFilePath);
      
      // Check if there are any recordings that failed to upload
      const failedRecordings = allRecordings.filter((r: any) => 
        r.status === 'error' && 
        r.metadata && 
        (r.metadata as any).bunnycdnUploadError
      );

      // Sample BunnyCDN URL (if any recordings exist)
      const sampleRecording = recordingsWithBunny[0];
      let cdnUrlSample = null;
      let signedUrlSample = null;

      if (sampleRecording && sampleRecording.bunnycdnUrl) {
        cdnUrlSample = sampleRecording.bunnycdnUrl;
        if (bunnycdnService.isSecureAccessConfigured()) {
          signedUrlSample = bunnycdnService.generateSignedUrl(sampleRecording.bunnycdnUrl, {
            expiresIn: 300 // 5 minutes for testing
          });
        }
      }

      // Check for local files on disk (should be none)
      const fs = await import('fs');
      const path = await import('path');
      const recordingsDir = path.join(process.cwd(), 'recordings');
      let localFileCount = 0;
      let localFiles: string[] = [];

      try {
        if (fs.existsSync(recordingsDir)) {
          localFiles = fs.readdirSync(recordingsDir);
          localFileCount = localFiles.length;
        }
      } catch (error) {
        // Directory doesn't exist or can't read - that's fine
      }

      const report = {
        timestamp: new Date().toISOString(),
        bunnycdnConfiguration: {
          isConfigured: configStatus.isConfigured,
          hasTokenAuth: configStatus.hasTokenAuth,
          hasPullZone: configStatus.hasPullZone,
          details: configStatus.details,
          securityStatus: configStatus.hasTokenAuth ? 'SECURE (Signed URLs)' : '⚠️ INSECURE (Public URLs)',
          cdnStatus: configStatus.hasPullZone ? 'OPTIMIZED (Custom Pull Zone)' : 'DEFAULT (Storage Zone URL)'
        },
        recordingStatistics: {
          total: allRecordings.length,
          onBunnyCDN: recordingsWithBunny.length,
          onTwilioOnly: recordingsWithTwilioOnly.length,
          withLocalFiles: recordingsWithLocalFiles.length,
          failed: failedRecordings.length,
          migrationProgress: allRecordings.length > 0 
            ? `${Math.round((recordingsWithBunny.length / allRecordings.length) * 100)}%`
            : 'N/A'
        },
        localStorageCheck: {
          recordingsDirectoryExists: fs.existsSync(recordingsDir),
          localFileCount,
          localFiles: localFiles.slice(0, 10), // Show first 10 files only
          status: localFileCount === 0 ? '✅ CLEAN (No local files)' : `⚠️ ${localFileCount} local files found`
        },
        urlSamples: {
          cdnUrl: cdnUrlSample,
          signedUrl: signedUrlSample,
          urlType: signedUrlSample ? 'SIGNED (Secure)' : cdnUrlSample ? 'PUBLIC (Insecure)' : 'N/A'
        },
        webhookFlow: {
          endpoint: '/api/twilio/recording-status',
          process: [
            '1. Twilio sends webhook when recording completes',
            '2. Webhook saves recording metadata to database',
            '3. Background job downloads recording to memory (Buffer)',
            '4. Recording uploaded to BunnyCDN from Buffer',
            '5. Recording deleted from Twilio storage (cost savings)',
            '6. Database updated with BunnyCDN URL'
          ],
          webhookImplementation: '✅ Uses memory buffers only (no local file storage)',
          actualLocalStorageStatus: localFileCount === 0 
            ? '✅ CLEAN - No local files on disk' 
            : `⚠️ WARNING - ${localFileCount} legacy files found (need cleanup)`,
          legacyFiles: localFileCount > 0 ? {
            count: localFileCount,
            directory: recordingsDir,
            totalSize: 'Unknown (check manually)',
            samples: localFiles.slice(0, 5),
            action: 'Verify files are on BunnyCDN, then delete local copies'
          } : null
        },
        recommendations: [] as Array<{
          priority: string;
          issue: string;
          solution: string;
          impact: string;
        }>
      };

      // Add recommendations based on findings
      if (!configStatus.hasTokenAuth) {
        report.recommendations.push({
          priority: 'HIGH',
          issue: 'Token Authentication not configured',
          solution: 'Set BUNNYCDN_TOKEN_AUTH_KEY environment variable to enable signed URLs for secure access',
          impact: 'Recordings are currently publicly accessible without authentication'
        });
      }

      if (!configStatus.hasPullZone) {
        report.recommendations.push({
          priority: 'MEDIUM',
          issue: 'Custom Pull Zone URL not configured',
          solution: 'Set BUNNYCDN_PULL_ZONE_URL to use optimized CDN URLs instead of storage zone URLs',
          impact: 'CDN caching may not be fully optimized'
        });
      }

      if (localFileCount > 0) {
        report.recommendations.push({
          priority: 'MEDIUM',
          issue: `${localFileCount} local recording files found`,
          solution: 'Delete local files after confirming they are uploaded to BunnyCDN',
          impact: 'Wasting server disk space'
        });
      }

      if (recordingsWithTwilioOnly.length > 0) {
        report.recommendations.push({
          priority: 'LOW',
          issue: `${recordingsWithTwilioOnly.length} recordings still on Twilio only`,
          solution: 'Use POST /api/recordings/bulk-migrate-bunnycdn to migrate remaining recordings',
          impact: 'Paying Twilio storage costs for these recordings'
        });
      }

      if (failedRecordings.length > 0) {
        report.recommendations.push({
          priority: 'HIGH',
          issue: `${failedRecordings.length} recordings failed to upload`,
          solution: 'Check error logs and retry migration for failed recordings',
          impact: 'Some recordings may be inaccessible'
        });
      }

      console.log(`✅ Diagnostic complete - Status: ${configStatus.isConfigured ? 'CONFIGURED' : 'NOT CONFIGURED'}`);

      res.json(report);
    } catch (error: any) {
      console.error('❌ Diagnostic check failed:', error);
      res.status(500).json({ 
        message: 'Diagnostic check failed', 
        error: error.message 
      });
    }
  });

  // Get BunnyCDN storage zone information
  app.get("/api/bunnycdn/storage-info", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      console.log(`📊 Storage zone info requested by user ${userId}`);

      const { bunnycdnService } = await import('./services/bunnycdnService');
      
      const zoneInfo = await bunnycdnService.getStorageZoneInfo();
      
      if (!zoneInfo) {
        return res.status(404).json({ 
          message: 'Storage zone not found or API key not configured' 
        });
      }

      res.json(zoneInfo);
    } catch (error: any) {
      console.error('❌ Failed to get storage zone info:', error);
      res.status(500).json({ 
        message: 'Failed to get storage zone info', 
        error: error.message 
      });
    }
  });

  // Get BunnyCDN storage statistics
  app.get("/api/bunnycdn/storage-stats", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      console.log(`📊 Storage statistics requested by user ${userId}`);

      const { bunnycdnService } = await import('./services/bunnycdnService');
      
      const stats = await bunnycdnService.getStorageStatistics();
      
      if (!stats) {
        return res.status(404).json({ 
          message: 'Storage statistics not available' 
        });
      }

      res.json(stats);
    } catch (error: any) {
      console.error('❌ Failed to get storage statistics:', error);
      res.status(500).json({ 
        message: 'Failed to get storage statistics', 
        error: error.message 
      });
    }
  });

  // List all recordings in BunnyCDN storage
  app.get("/api/bunnycdn/recordings/list", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      console.log(`📂 BunnyCDN recordings list requested by user ${userId}`);

      const { bunnycdnService } = await import('./services/bunnycdnService');
      
      const storageInfo = await bunnycdnService.getRecordingStorageInfo();
      
      res.json(storageInfo);
    } catch (error: any) {
      console.error('❌ Failed to list BunnyCDN recordings:', error);
      res.status(500).json({ 
        message: 'Failed to list BunnyCDN recordings', 
        error: error.message 
      });
    }
  });

  // Delete recording from BunnyCDN
  app.delete("/api/bunnycdn/recordings/:recordingId", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const recordingId = parseInt(req.params.recordingId);
      
      console.log(`🗑️ BunnyCDN recording deletion requested by user ${userId} for recording ${recordingId}`);

      const { bunnycdnService } = await import('./services/bunnycdnService');
      
      const deleted = await bunnycdnService.deleteRecordingFile(userId, recordingId);
      
      if (!deleted) {
        return res.status(400).json({ 
          message: 'Failed to delete recording from BunnyCDN' 
        });
      }

      res.json({ 
        success: true, 
        message: 'Recording deleted from BunnyCDN successfully' 
      });
    } catch (error: any) {
      console.error('❌ Failed to delete recording from BunnyCDN:', error);
      res.status(500).json({ 
        message: 'Failed to delete recording from BunnyCDN', 
        error: error.message 
      });
    }
  });

  // Purge CDN cache
  app.post("/api/bunnycdn/cache/purge", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const { url } = req.body; // Optional: specific URL to purge
      
      console.log(`🔄 CDN cache purge requested by user ${userId}${url ? ` for URL: ${url}` : ' (entire cache)'}`);

      const { bunnycdnService } = await import('./services/bunnycdnService');
      
      const purged = await bunnycdnService.purgeCDNCache(url);
      
      if (!purged) {
        return res.status(400).json({ 
          message: 'Failed to purge CDN cache' 
        });
      }

      res.json({ 
        success: true, 
        message: url 
          ? `CDN cache purged for ${url}` 
          : 'Entire CDN cache purged successfully' 
      });
    } catch (error: any) {
      console.error('❌ Failed to purge CDN cache:', error);
      res.status(500).json({ 
        message: 'Failed to purge CDN cache', 
        error: error.message 
      });
    }
  });

  // List files in BunnyCDN storage directory
  app.get("/api/bunnycdn/files", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const { path = 'recordings/' } = req.query;
      
      console.log(`📂 File listing requested by user ${userId} for path: ${path}`);

      const { bunnycdnService } = await import('./services/bunnycdnService');
      
      const files = await bunnycdnService.listFiles(path as string);
      
      res.json({ 
        path, 
        files 
      });
    } catch (error: any) {
      console.error('❌ Failed to list files:', error);
      res.status(500).json({ 
        message: 'Failed to list files', 
        error: error.message 
      });
    }
  });

  // Recording migration status and monitoring
  app.get("/api/recordings/migration-status", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      console.log(`📊 Recording migration status requested by user ${userId}`);

      const { bunnycdnService } = await import('./services/bunnycdnService');
      
      // Get all recordings for this user
      const allRecordings = await storage.getAllRecordings(userId);
      
      // Categorize recordings
      const fullyMigrated = allRecordings.filter((r: any) => 
        r.bunnycdnUrl && r.bunnycdnUploadedAt && r.twilioDeletedAt
      );
      
      const uploadedNotDeleted = allRecordings.filter((r: any) => 
        r.bunnycdnUrl && r.bunnycdnUploadedAt && !r.twilioDeletedAt && r.twilioUrl
      );
      
      const failedUploads = allRecordings.filter((r: any) => {
        const metadata = r.metadata as any || {};
        return metadata.bunnycdnWorkflowError || metadata.bunnycdnUploadError || r.status === 'error';
      });
      
      const notMigrated = allRecordings.filter((r: any) => 
        !r.bunnycdnUrl && r.twilioUrl
      );
      
      const inProgress = allRecordings.filter((r: any) => 
        r.status === 'processing'
      );

      // Check BunnyCDN configuration
      const bunnyConfigured = bunnycdnService.isConfigured();
      
      // Get storage stats if configured
      let storageStats = null;
      if (bunnyConfigured) {
        try {
          storageStats = await bunnycdnService.getStorageStatistics();
        } catch (error: any) {
          console.warn('Could not fetch storage stats:', error.message);
        }
      }

      const status = {
        bunnycdn: {
          configured: bunnyConfigured,
          storageStats: storageStats
        },
        recordings: {
          total: allRecordings.length,
          fullyMigrated: fullyMigrated.length,
          uploadedNotDeleted: uploadedNotDeleted.length,
          failedUploads: failedUploads.length,
          notMigrated: notMigrated.length,
          inProgress: inProgress.length
        },
        details: {
          fullyMigrated: fullyMigrated.map((r: any) => ({
            id: r.id,
            twilioSid: r.twilioRecordingSid,
            cdnUrl: r.bunnycdnUrl,
            uploadedAt: r.bunnycdnUploadedAt,
            deletedAt: r.twilioDeletedAt
          })),
          uploadedNotDeleted: uploadedNotDeleted.map((r: any) => ({
            id: r.id,
            twilioSid: r.twilioRecordingSid,
            cdnUrl: r.bunnycdnUrl,
            twilioUrl: r.twilioUrl,
            issue: 'Uploaded to BunnyCDN but still on Twilio',
            metadata: (r.metadata as any)?.twilioDeleteError ? {
              deleteError: (r.metadata as any).twilioDeleteError
            } : null
          })),
          failedUploads: failedUploads.map((r: any) => {
            const metadata = r.metadata as any || {};
            return {
              id: r.id,
              twilioSid: r.twilioRecordingSid,
              twilioUrl: r.twilioUrl,
              error: metadata.bunnycdnWorkflowError || metadata.bunnycdnUploadError || 'Unknown error',
              errorAt: metadata.bunnycdnWorkflowErrorAt || metadata.bunnycdnUploadFailedAt
            };
          }),
          notMigrated: notMigrated.map((r: any) => ({
            id: r.id,
            twilioSid: r.twilioRecordingSid,
            twilioUrl: r.twilioUrl,
            status: r.status,
            reason: (r.metadata as any)?.bunnycdnSkipReason || 'Not yet migrated'
          }))
        },
        health: {
          migrationRate: allRecordings.length > 0 
            ? ((fullyMigrated.length / allRecordings.length) * 100).toFixed(1) + '%'
            : 'N/A',
          failureRate: allRecordings.length > 0
            ? ((failedUploads.length / allRecordings.length) * 100).toFixed(1) + '%'
            : 'N/A',
          status: failedUploads.length > allRecordings.length * 0.1 
            ? 'degraded'
            : fullyMigrated.length === allRecordings.length && allRecordings.length > 0
            ? 'healthy'
            : 'normal'
        }
      };

      res.json(status);
    } catch (error: any) {
      console.error('❌ Failed to get migration status:', error);
      res.status(500).json({ 
        message: 'Failed to get migration status', 
        error: error.message 
      });
    }
  });

  // Bulk migrate all recordings to BunnyCDN
  app.post("/api/recordings/bulk-migrate-bunnycdn", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const { limit = 100 } = req.body; // Optional limit for batch processing
      
      console.log(`📤 Bulk BunnyCDN migration requested for user ${userId} (limit: ${limit})`);
      
      // Dynamic import to avoid circular dependencies
      const { bunnycdnService } = await import('./services/bunnycdnService');
      
      // Check if BunnyCDN is configured
      if (!bunnycdnService.isConfigured()) {
        return res.status(400).json({ 
          message: "BunnyCDN is not configured. Please set BUNNYCDN_API_KEY, BUNNYCDN_STORAGE_ZONE, and BUNNYCDN_STORAGE_PASSWORD." 
        });
      }

      // Get Twilio client for this user
      const { client: twilioClient, credentials } = await userTwilioCache.getTwilioClient(userId);
      
      if (!twilioClient || !credentials) {
        return res.status(400).json({ 
          message: "Twilio credentials not configured for your account" 
        });
      }

      // Get all recordings that haven't been uploaded to BunnyCDN yet
      const allRecordings = await storage.getAllRecordings(userId);
      const recordingsToMigrate = allRecordings
        .filter((r: any) => !r.bunnycdnUrl && r.twilioUrl) // Only recordings without BunnyCDN URL but with Twilio URL
        .slice(0, limit); // Apply limit

      console.log(`📊 Found ${recordingsToMigrate.length} recordings to migrate (out of ${allRecordings.length} total)`);

      if (recordingsToMigrate.length === 0) {
        return res.json({
          message: "No recordings to migrate",
          total: 0,
          uploaded: 0,
          failed: 0,
          results: []
        });
      }

      // Migrate recordings in parallel batches of 3 to avoid overwhelming the server
      const batchSize = 3;
      const results: any[] = [];
      let uploaded = 0;
      let failed = 0;

      for (let i = 0; i < recordingsToMigrate.length; i += batchSize) {
        const batch = recordingsToMigrate.slice(i, i + batchSize);
        
        const batchResults = await Promise.allSettled(
          batch.map(async (recording: any) => {
            try {
              const result = await bunnycdnService.migrateRecordingToBunnyCDN(
                userId,
                recording.id,
                twilioClient,
                credentials
              );
              
              if (result.uploaded) {
                uploaded++;
              } else {
                failed++;
              }
              
              return {
                recordingId: recording.id,
                twilioRecordingSid: recording.twilioRecordingSid,
                success: result.uploaded,
                deleted: result.deleted,
                cdnUrl: result.cdnUrl
              };
            } catch (error: any) {
              failed++;
              return {
                recordingId: recording.id,
                twilioRecordingSid: recording.twilioRecordingSid,
                success: false,
                error: error.message
              };
            }
          })
        );

        // Add results from this batch
        batchResults.forEach((result: any) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            results.push({
              success: false,
              error: result.reason?.message || 'Unknown error'
            });
          }
        });

        // Small delay between batches to prevent rate limiting
        if (i + batchSize < recordingsToMigrate.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      console.log(`✅ Bulk migration completed: ${uploaded} uploaded, ${failed} failed`);

      res.json({
        message: "Bulk migration completed",
        total: recordingsToMigrate.length,
        uploaded,
        failed,
        results
      });
    } catch (error: any) {
      console.error(`❌ Bulk BunnyCDN migration failed:`, error);
      res.status(500).json({ message: error.message });
    }
  });

  // Cleanup old recordings
  app.post("/api/recordings/cleanup", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      console.log(`🧹 Starting recording cleanup for user ${userId}`);
      const deletedCount = await recordingService.cleanupOldRecordings(userId);
      console.log(`✅ Cleanup completed for user ${userId}: ${deletedCount} recordings deleted`);
      res.json({
        message: "Cleanup completed",
        deletedCount
      });
    } catch (error: any) {
      console.error(`❌ Cleanup failed:`, error);
      res.status(500).json({ message: error.message });
    }
  });

  // Delete recording (with file cleanup)
  app.delete("/api/recordings/:id", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      console.log(`🗑️ Deleting recording ${id} for user ${userId}`);
      
      const recording = await storage.getRecording(userId, id);
      
      if (!recording) {
        console.warn(`⚠️ Recording ${id} not found for user ${userId}`);
        return res.status(404).json({ message: "Recording not found" });
      }

      // Delete local file if exists
      if (recording.localFilePath && fs.existsSync(recording.localFilePath)) {
        console.log(`🗑️ Deleting local file: ${recording.localFilePath}`);
        fs.unlinkSync(recording.localFilePath);
      }

      await storage.deleteRecording(userId, id);
      console.log(`✅ Recording ${id} deleted successfully for user ${userId}`);
      res.json({ message: "Recording deleted successfully" });
    } catch (error: any) {
      console.error(`❌ Failed to delete recording ${req.params.id} for user ${getUserIdFromRequest(req)}:`, error);
      res.status(400).json({ message: error.message });
    }
  });

  // Voicemails
  app.get("/api/voicemails", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const voicemails = await storage.getAllVoicemails(userId);
      res.json(voicemails);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/voicemails/unread", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const voicemails = await storage.getUnreadVoicemails(userId);
      res.json(voicemails);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/voicemails", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const voicemailData = insertVoicemailSchema.parse(req.body);
      const voicemail = await storage.createVoicemail(userId, voicemailData);
      res.json(voicemail);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/voicemails/:id", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      const voicemailData = insertVoicemailSchema.partial().parse(req.body);
      const voicemail = await storage.updateVoicemail(userId, id, voicemailData);
      res.json(voicemail);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/voicemails/:id", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      await storage.deleteVoicemail(userId, id);
      res.json({ message: "Voicemail deleted successfully" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Settings - User-specific settings with authentication
  app.get("/api/settings", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const settings = await storage.getAllSettings();
      const userSettings = settings.filter(s => s.key.includes(`_user_${userId}`));
      res.json(userSettings);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/settings/:key", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const key = req.params.key;
      
      // First try user-specific setting
      const userSpecificKey = `${key}_user_${userId}`;
      let setting = await storage.getSetting(userSpecificKey);
      
      // If not found, try global setting (for keys like 'system', 'parallel_dialer_greeting', etc)
      if (!setting) {
        setting = await storage.getSetting(key);
      }
      
      if (!setting) {
        return res.status(404).json({ message: "Setting not found" });
      }
      res.json(setting);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/settings", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const { key, value, global } = req.body;
      if (!key || value === undefined) {
        return res.status(400).json({ message: "Key and value are required" });
      }
      
      // Support global settings (like parallel_dialer_greeting) if global=true
      const settingKey = global ? key : `${key}_user_${userId}`;
      const setting = await storage.setSetting(settingKey, value);
      
      res.json(setting);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // User-specific Twilio credential management
  app.post("/api/user/twilio/credentials", checkJwt, requireAuth, async (req, res) => {
    try {
      const auth = (req as any).auth;
      if (!auth || !auth.sub) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const auth0UserId = auth.sub;
      const user = await storage.getUserByAuth0Id(auth0UserId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { accountSid, authToken, apiKeySid, apiKeySecret, phoneNumber, twimlAppSid } = req.body;

      if (!accountSid || !authToken || !phoneNumber) {
        return res.status(400).json({ message: "Account SID, Auth Token, and Phone Number are required" });
      }

      // Validate credentials before saving by testing authentication
      console.log(`🔐 Validating Twilio credentials for user ${user.id}...`);
      try {
        const testClient = twilio(accountSid, authToken);
        await testClient.api.v2010.accounts(accountSid).fetch();
        console.log(`✅ Twilio credentials validated successfully for user ${user.id}`);
      } catch (validationError: any) {
        console.error('❌ Twilio credential validation failed:', validationError.message);
        return res.status(401).json({ 
          message: "Invalid Twilio credentials. Please check your Account SID and Auth Token.",
          error: validationError.message,
          code: 'AUTHENTICATION_ERROR'
        });
      }

      // Update user's Twilio credentials (encrypted in storage)
      await storage.updateUserTwilioCredentials(user.id, {
        twilioAccountSid: accountSid,
        twilioAuthToken: authToken,
        twilioApiKeySid: apiKeySid,
        twilioApiKeySecret: apiKeySecret,
        twilioPhoneNumber: phoneNumber,
        twilioTwimlAppSid: twimlAppSid,
        twilioConfigured: true
      });

      clearTwilioCacheOnLogout(user.id);

      console.log(`✅ Twilio credentials saved for user ${user.id}`);

      // Auto-create TwiML Application if not provided
      let finalTwimlAppSid = twimlAppSid;
      if (!twimlAppSid) {
        try {
          console.log(`📱 Auto-creating TwiML Application for user ${user.id}...`);
          const baseUrl = process.env.REPLIT_DOMAINS 
            ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
            : `${req.protocol}://${req.get('host')}`;
          
          const application = await userTwilioCache.createTwiMLApplication(user.id, baseUrl);
          finalTwimlAppSid = application.sid;
          console.log(`✅ TwiML Application auto-created: ${finalTwimlAppSid}`);
        } catch (twimlError: any) {
          console.error('TwiML Application creation failed:', twimlError);
          // Don't fail the whole request if TwiML creation fails
        }
      }

      // CRITICAL: Configure phone number's voiceUrl for incoming calls
      try {
        console.log(`📞 Configuring incoming call webhook for phone number ${phoneNumber}...`);
        const baseUrl = process.env.REPLIT_DOMAINS 
          ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
          : `${req.protocol}://${req.get('host')}`;
        
        const twilioClient = twilio(accountSid, authToken);
        
        // Find the phone number in Twilio account
        const phoneNumbers = await twilioClient.incomingPhoneNumbers.list({
          phoneNumber: phoneNumber
        });
        
        if (phoneNumbers.length === 0) {
          console.warn(`⚠️ Phone number ${phoneNumber} not found in Twilio account`);
        } else {
          // Configure the phone number's webhook for incoming calls
          await twilioClient.incomingPhoneNumbers(phoneNumbers[0].sid).update({
            voiceUrl: `${baseUrl}/api/twilio/voice`,
            voiceMethod: 'POST',
            statusCallback: `${baseUrl}/api/twilio/status`,
            statusCallbackMethod: 'POST'
          });
          
          console.log(`✅ Phone number ${phoneNumber} configured for incoming calls`);
          console.log(`   Voice URL: ${baseUrl}/api/twilio/voice`);
        }
      } catch (phoneConfigError: any) {
        console.error('⚠️ Phone number webhook configuration failed:', phoneConfigError.message);
        // Don't fail the whole request if phone config fails
      }

      res.json({
        message: "Twilio credentials saved successfully",
        configured: true,
        twimlAppSid: finalTwimlAppSid
      });
    } catch (error: any) {
      console.error('Error saving Twilio credentials:', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/user/twilio/credentials", checkJwt, requireAuth, async (req, res) => {
    try {
      const auth = (req as any).auth;
      if (!auth || !auth.sub) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const auth0UserId = auth.sub;
      const user = await storage.getUserByAuth0Id(auth0UserId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Get user's Twilio credentials via cache (ensures proper isolation)
      try {
        const { client, credentials } = await userTwilioCache.getTwilioClient(user.id);
        
        // Get webhook URLs from TwiML App if it exists
        let webhookUrls = null;
        if (credentials.twimlAppSid) {
          try {
            const twimlApp = await client.applications(credentials.twimlAppSid).fetch();
            webhookUrls = {
              voiceUrl: twimlApp.voiceUrl,
              voiceMethod: twimlApp.voiceMethod,
              statusCallback: twimlApp.statusCallback,
              statusCallbackMethod: twimlApp.statusCallbackMethod
            };
          } catch (error) {
            console.error(`Failed to fetch TwiML App details for user ${user.id}:`, error);
          }
        }
        
        // Return credentials (but mask sensitive parts for security)
        res.json({
          configured: true,
          credentials: {
            accountSid: credentials.accountSid ? `${credentials.accountSid.slice(0, 10)}...` : null,
            phoneNumber: credentials.phoneNumber,
            hasApiKey: !!credentials.apiKeySid,
            twimlAppSid: credentials.twimlAppSid,
            webhookUrls
          }
        });
      } catch (error: any) {
        // User hasn't configured Twilio yet
        return res.json({
          configured: false,
          credentials: null
        });
      }
    } catch (error: any) {
      console.error('Error fetching Twilio credentials:', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/user/twilio/credentials", checkJwt, requireAuth, async (req, res) => {
    try {
      const auth = (req as any).auth;
      if (!auth || !auth.sub) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const auth0UserId = auth.sub;
      const user = await storage.getUserByAuth0Id(auth0UserId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Clear user's Twilio credentials
      await storage.updateUserTwilioCredentials(user.id, {
        twilioAccountSid: undefined,
        twilioAuthToken: undefined,
        twilioApiKeySid: undefined,
        twilioApiKeySecret: undefined,
        twilioPhoneNumber: undefined,
        twilioTwimlAppSid: undefined,
        twilioConfigured: false
      });

      clearTwilioCacheOnLogout(user.id);

      console.log(`✅ Twilio credentials removed for user ${user.id}`);

      res.json({
        message: "Twilio credentials removed successfully",
        configured: false
      });
    } catch (error: any) {
      console.error('Error removing Twilio credentials:', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/user/twilio/status", checkJwt, requireAuth, async (req, res) => {
    try {
      const auth = (req as any).auth;
      if (!auth || !auth.sub) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const auth0UserId = auth.sub;
      const user = await storage.getUserByAuth0Id(auth0UserId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Get user's Twilio credentials via cache (ensures proper isolation)
      try {
        const { credentials } = await userTwilioCache.getTwilioClient(user.id);
        const connectionStatus = await userTwilioCache.getConnectionStatus(user.id);

        res.json({
          userId: user.id,
          isConfigured: true,
          hasCredentials: true,
          phoneNumber: credentials.phoneNumber,
          hasTwimlApp: !!credentials.twimlAppSid,
          hasApiKey: !!credentials.apiKeySid,
          status: connectionStatus.isConnected ? 'ready' : 'error',
          isValid: connectionStatus.isConnected,
          lastCheck: connectionStatus.lastCheck.toISOString()
        });
      } catch (error: any) {
        // User hasn't configured Twilio yet
        return res.json({
          userId: user.id,
          isConfigured: false,
          hasCredentials: false,
          phoneNumber: null,
          status: 'not_configured',
          message: 'Twilio credentials not configured for this user'
        });
      }
    } catch (error: any) {
      console.error('Error checking Twilio status:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Twilio routes - using user-specific credentials
  app.get("/api/twilio/access-token", checkJwt, async (req, res) => {
    try {
      const auth = (req as any).auth;
      if (!auth || !auth.sub) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const auth0UserId = auth.sub;
      const user = await storage.getUserByAuth0Id(auth0UserId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Get base URL from REPLIT_DOMAINS or request host (never use localhost for production)
      const baseUrl = process.env.REPLIT_DOMAINS 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : (req.get('host') && !req.get('host')?.includes('localhost')) 
          ? `https://${req.get('host')}`
          : undefined;

      const accessToken = await userTwilioCache.generateAccessToken(user.id, user.username, baseUrl);
      
      console.log(`✅ Generated access token for user ${user.id}`);
      res.json({ 
        accessToken,
        expiresIn: 3600,
        identity: user.username 
      });
    } catch (error: any) {
      console.error('Token generation error:', error);
      res.status(500).json({ 
        message: error.message,
        code: error.code || 'TOKEN_GENERATION_FAILED'
      });
    }
  });

  app.get("/api/twilio/status", checkJwt, async (req, res) => {
    try {
      const auth = (req as any).auth;
      if (!auth || !auth.sub) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const auth0UserId = auth.sub;
      const user = await storage.getUserByAuth0Id(auth0UserId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const connectionStatus = await userTwilioCache.getConnectionStatus(user.id);
      const { credentials } = await userTwilioCache.getTwilioClient(user.id);
      
      res.json({
        isConfigured: connectionStatus.diagnostics.hasCredentials,
        hasCredentials: connectionStatus.diagnostics.hasCredentials,
        phoneNumber: credentials?.phoneNumber || null,
        connection: connectionStatus,
        lastHealthCheck: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('Status check error:', error);
      res.status(500).json({ 
        message: error.message,
        code: error.code || 'STATUS_CHECK_FAILED'
      });
    }
  });

  app.post("/api/twilio/test-connection", checkJwt, async (req, res) => {
    try {
      const auth = (req as any).auth;
      if (!auth || !auth.sub) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const auth0UserId = auth.sub;
      const user = await storage.getUserByAuth0Id(auth0UserId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const connectionStatus = await userTwilioCache.getConnectionStatus(user.id);
      const { credentials } = await userTwilioCache.getTwilioClient(user.id);
      
      res.json({
        connected: connectionStatus.isConnected,
        status: connectionStatus.accountStatus,
        diagnostics: connectionStatus.diagnostics,
        lastCheck: connectionStatus.lastCheck,
        phoneNumber: credentials?.phoneNumber || null,
        twimlAppSid: credentials?.twimlAppSid || null
      });
    } catch (error: any) {
      console.error('Connection test error:', error);
      res.status(500).json({ 
        message: error.message,
        code: error.code || 'CONNECTION_TEST_FAILED'
      });
    }
  });

  // Create TwiML Application endpoint - using user-specific credentials
  app.post("/api/twilio/create-twiml-app", checkJwt, async (req, res) => {
    try {
      const auth = (req as any).auth;
      if (!auth || !auth.sub) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const auth0UserId = auth.sub;
      const user = await storage.getUserByAuth0Id(auth0UserId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Use https on Replit/behind proxies
      const protocol = process.env.REPLIT_DOMAINS ? 'https' : req.protocol;
      const baseUrl = `${protocol}://${req.get('host')}`;
      console.log(`Creating TwiML Application for user ${user.id} with base URL:`, baseUrl);
      
      const application = await userTwilioCache.createTwiMLApplication(user.id, baseUrl);

      res.json({
        success: true,
        application: {
          sid: application.sid,
          friendlyName: application.friendlyName,
          voiceUrl: application.voiceUrl,
          statusCallback: application.statusCallback
        }
      });
    } catch (error: any) {
      console.error('Create TwiML application error:', error);
      res.status(500).json({ 
        message: error.message,
        code: error.code || 'TWIML_APP_CREATION_FAILED'
      });
    }
  });

  // Update TwiML Application webhooks endpoint - ensures correct URLs for all users
  app.post("/api/twilio/update-twiml-app-webhooks", checkJwt, async (req, res) => {
    try {
      const auth = (req as any).auth;
      if (!auth || !auth.sub) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const auth0UserId = auth.sub;
      const user = await storage.getUserByAuth0Id(auth0UserId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const baseUrl = process.env.REPLIT_DOMAINS 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : `https://${req.get('host')}`;
      
      console.log(`🔄 Updating TwiML App webhooks for user ${user.id} with base URL:`, baseUrl);
      
      const { client, credentials } = await userTwilioCache.getTwilioClient(user.id);
      
      if (!credentials.twimlAppSid) {
        return res.status(400).json({ 
          message: "No TwiML Application found. Please create one first.",
          code: 'NO_TWIML_APP'
        });
      }
      
      const updatedApp = await client.applications(credentials.twimlAppSid).update({
        voiceUrl: `${baseUrl}/api/twilio/voice`,
        voiceMethod: 'POST',
        smsUrl: `${baseUrl}/api/twilio/sms`,
        smsMethod: 'POST',
        statusCallback: `${baseUrl}/api/twilio/status`,
        statusCallbackMethod: 'POST'
      });
      
      console.log(`✅ Updated TwiML App ${credentials.twimlAppSid} for user ${user.id}`);
      
      res.json({
        success: true,
        message: "TwiML Application webhooks updated successfully",
        application: {
          sid: updatedApp.sid,
          friendlyName: updatedApp.friendlyName,
          voiceUrl: updatedApp.voiceUrl,
          smsUrl: updatedApp.smsUrl,
          statusCallback: updatedApp.statusCallback
        }
      });
    } catch (error: any) {
      console.error('Update TwiML application webhooks error:', error);
      res.status(500).json({ 
        message: error.message,
        code: error.code || 'TWIML_APP_UPDATE_FAILED'
      });
    }
  });

  // Configure phone number webhook for incoming calls - CRITICAL for receiving calls
  app.post("/api/twilio/configure-phone-webhook", checkJwt, async (req, res) => {
    try {
      const auth = (req as any).auth;
      if (!auth || !auth.sub) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const auth0UserId = auth.sub;
      const user = await storage.getUserByAuth0Id(auth0UserId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const baseUrl = process.env.REPLIT_DOMAINS 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : `https://${req.get('host')}`;
      
      console.log(`📞 Configuring phone number webhook for user ${user.id}...`);
      
      const { client, credentials } = await userTwilioCache.getTwilioClient(user.id);
      
      if (!credentials.phoneNumber) {
        return res.status(400).json({ 
          message: "No phone number configured. Please save your Twilio credentials first.",
          code: 'NO_PHONE_NUMBER'
        });
      }
      
      // Find the phone number in Twilio account
      const phoneNumbers = await client.incomingPhoneNumbers.list({
        phoneNumber: credentials.phoneNumber
      });
      
      if (phoneNumbers.length === 0) {
        return res.status(404).json({ 
          message: `Phone number ${credentials.phoneNumber} not found in your Twilio account`,
          code: 'PHONE_NUMBER_NOT_FOUND'
        });
      }
      
      // Configure the phone number's webhook for incoming calls
      const updatedNumber = await client.incomingPhoneNumbers(phoneNumbers[0].sid).update({
        voiceUrl: `${baseUrl}/api/twilio/voice`,
        voiceMethod: 'POST',
        statusCallback: `${baseUrl}/api/twilio/status`,
        statusCallbackMethod: 'POST'
      });
      
      console.log(`✅ Phone number ${credentials.phoneNumber} configured for incoming calls`);
      
      res.json({
        success: true,
        message: "Phone number webhook configured successfully for incoming calls",
        phoneNumber: {
          sid: updatedNumber.sid,
          phoneNumber: updatedNumber.phoneNumber,
          voiceUrl: updatedNumber.voiceUrl,
          voiceMethod: updatedNumber.voiceMethod,
          statusCallback: updatedNumber.statusCallback
        }
      });
    } catch (error: any) {
      console.error('Configure phone webhook error:', error);
      res.status(500).json({ 
        message: error.message,
        code: error.code || 'PHONE_WEBHOOK_CONFIG_FAILED'
      });
    }
  });

  // Admin endpoint to verify and update all users' TwiML Apps
  app.post("/api/admin/verify-all-twiml-apps", checkJwt, async (req, res) => {
    try {
      const auth = (req as any).auth;
      if (!auth || !auth.sub) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const auth0UserId = auth.sub;
      const adminUser = await storage.getUserByAuth0Id(auth0UserId);
      
      if (!adminUser || adminUser.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      console.log(`🔍 Admin ${adminUser.id} (${adminUser.username}) initiating comprehensive TwiML App audit...`);
      
      // Use the comprehensive auditor utility
      const { twimlAuditor } = await import('./utils/twimlAuditor');
      const summary = await twimlAuditor.auditAllUsers();
      
      res.json({
        success: true,
        message: "TwiML App audit completed",
        summary: {
          totalUsers: summary.totalUsers,
          usersChecked: summary.usersChecked,
          usersOk: summary.usersOk,
          usersFixed: summary.usersFixed,
          usersWithErrors: summary.usersWithErrors,
          usersWithoutTwiML: summary.usersWithoutTwiML
        },
        results: summary.results
      });
    } catch (error: any) {
      console.error('Admin TwiML verification error:', error);
      res.status(500).json({ 
        message: error.message,
        code: 'ADMIN_TWIML_VERIFICATION_FAILED'
      });
    }
  });

  // Token refresh endpoint - using user-specific credentials
  app.post("/api/twilio/refresh-token", checkJwt, async (req, res) => {
    try {
      const auth = (req as any).auth;
      if (!auth || !auth.sub) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const auth0UserId = auth.sub;
      const user = await storage.getUserByAuth0Id(auth0UserId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Get base URL from REPLIT_DOMAINS or request host (never use localhost for production)
      const baseUrl = process.env.REPLIT_DOMAINS 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : (req.get('host') && !req.get('host')?.includes('localhost')) 
          ? `https://${req.get('host')}`
          : undefined;

      const accessToken = await userTwilioCache.generateAccessToken(user.id, user.username, baseUrl);
      
      console.log(`✅ Refreshed access token for user ${user.id} (${user.username})`);
      res.json({ 
        accessToken,
        expiresIn: 3600,
        identity: user.username 
      });
    } catch (error: any) {
      console.error('Token refresh error:', error);
      res.status(500).json({ 
        message: error.message,
        code: error.code || 'TOKEN_REFRESH_FAILED'
      });
    }
  });

  // Main Voice webhook endpoint - handles both inbound and outbound calls
  app.post("/api/twilio/voice", webhookLimiter, validateTwilioWebhook, async (req, res) => {
    try {
      const { From, To, CallSid, Direction, Caller } = req.body;
      
      console.log('🎯 Voice webhook called:', {
        From, To, CallSid, Direction, Caller
      });
      
      // Determine call type
      const isOutbound = From && From.startsWith('client:');
      
      if (isOutbound) {
        // Handle outbound call from WebRTC client
        const userId = From.replace('client:', '');
        
        // Get user's phone number for caller ID
        const user = await storage.getUserByUsername(userId);
        if (!user) {
          throw new Error(`User not found: ${userId}`);
        }
        
        // Get user's Twilio credentials via cache (ensures proper isolation)
        const { credentials } = await userTwilioCache.getTwilioClient(user.id);
        const callerIdNumber = credentials.phoneNumber;
        
        // Format destination number
        const formattedTo = To.startsWith('+') ? To : `+${To}`;
        
        // Create call record in database
        const callRecord = await storage.createCall(user.id, {
          userId: user.id,
          phone: formattedTo,
          type: 'outgoing',
          status: 'initiated',
          duration: 0,
          cost: '0.00',
          callQuality: null,
          contactId: null,
          tags: [],
          priority: 'normal',
          sentiment: 'neutral',
          callPurpose: 'outbound',
          outcome: 'in-progress',
          transcript: null,
          summary: null,
          actionItems: [],
          followUpRequired: false,
          keywords: [],
          followUpDate: null,
          followUpNotes: null,
          codec: null,
          bitrate: null,
          jitter: null,
          packetLoss: null,
          location: null,
          carrier: null,
          deviceType: null,
          userAgent: null,
          transferredFrom: null,
          transferredTo: null,
          dialAttempts: 1,
          hangupReason: null,
          sipCallId: CallSid,
          conferenceId: null,
          recordingUrl: null,
          customFields: {},
          metadata: { twilioCallSid: CallSid }
        });
        
        wsService.broadcastNewCall(user.id, callRecord);
        
        // Generate TwiML for outbound call
        const baseUrl = process.env.REPLIT_DOMAINS 
          ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
          : `https://${req.get('host')}`;
        
        // Check if auto-recording is enabled for this user
        let autoRecordEnabled = false; // Default to false (opt-in)
        if (user) {
          const setting = await storage.getSetting(`auto_record_calls_user_${user.id}`);
          autoRecordEnabled = setting?.value === true || setting?.value === "true";
          console.log(`📊 Outbound call - Auto-recording for user ${user.id}: ${autoRecordEnabled} (setting: ${JSON.stringify(setting?.value)})`);
        }
        
        // Use Twilio SDK's VoiceResponse for proper XML escaping
        const VoiceResponse = twilio.twiml.VoiceResponse;
        const twimlResponse = new VoiceResponse();
        
        const dialOptions: any = {
          callerId: callerIdNumber,
          timeout: 120,
          hangupOnStar: false,
          timeLimit: 14400,
          action: `${baseUrl}/api/twilio/dial-status`,
          method: 'POST',
          statusCallback: `${baseUrl}/api/twilio/status`,
          statusCallbackEvent: 'initiated ringing in-progress answered completed',
          statusCallbackMethod: 'POST'
        };
        
        // Only add recording attributes if auto-recording is enabled
        if (autoRecordEnabled) {
          dialOptions.record = 'record-from-answer-dual';
          dialOptions.recordingStatusCallback = `${baseUrl}/api/twilio/recording-status`;
        }
        
        const dial = twimlResponse.dial(dialOptions);
        dial.number(formattedTo);
        
        console.log('📞 Outbound call TwiML generated:', twimlResponse.toString());
        res.set('Content-Type', 'text/xml');
        res.send(twimlResponse.toString());
      } else {
        // Handle incoming call to Twilio number - find which user owns this number
        const incomingUser = await storage.getUserByTwilioPhoneNumber(To);
        
        if (!incomingUser) {
          console.error(`❌ No user found with Twilio number: ${To}`);
          throw new Error(`No user configured for phone number ${To}`);
        }
        
        console.log(`📞 Incoming call to ${To} belongs to user ${incomingUser.id} (${incomingUser.username})`);
        
        // Create call record in database for this user
        const callRecord = await storage.createCall(incomingUser.id, {
          userId: incomingUser.id,
          phone: From,
          type: 'incoming',
          status: 'initiated',
          duration: 0,
          cost: '0.00',
          callQuality: null,
          contactId: null,
          tags: [],
          priority: 'normal',
          sentiment: 'neutral',
          callPurpose: 'incoming',
          outcome: 'in-progress',
          transcript: null,
          summary: null,
          actionItems: [],
          followUpRequired: false,
          keywords: [],
          followUpDate: null,
          followUpNotes: null,
          codec: null,
          bitrate: null,
          jitter: null,
          packetLoss: null,
          location: null,
          carrier: null,
          deviceType: null,
          userAgent: null,
          transferredFrom: null,
          transferredTo: null,
          dialAttempts: 1,
          hangupReason: null,
          sipCallId: CallSid,
          conferenceId: null,
          recordingUrl: null,
          customFields: {},
          metadata: { twilioCallSid: CallSid }
        });
        
        wsService.broadcastNewCall(incomingUser.id, callRecord);
        
        // Route incoming call to the correct user's WebRTC client
        // Check if auto-recording is enabled for this user
        let autoRecordEnabled = false; // Default to false (opt-in)
        const setting = await storage.getSetting(`auto_record_calls_user_${incomingUser.id}`);
        autoRecordEnabled = setting?.value === true || setting?.value === "true";
        console.log(`📊 Incoming call - Auto-recording for user ${incomingUser.id}: ${autoRecordEnabled} (setting: ${JSON.stringify(setting?.value)})`);
        
        const baseUrl = process.env.REPLIT_DOMAINS 
          ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
          : `https://${req.get('host')}`;
        
        // Use Twilio SDK's VoiceResponse for proper XML escaping
        const VoiceResponse = twilio.twiml.VoiceResponse;
        const twimlResponse = new VoiceResponse();
        
        const dialOptions: any = {
          timeout: 30,
          action: `${baseUrl}/api/twilio/dial-status`,
          method: 'POST',
          statusCallback: `${baseUrl}/api/twilio/status`,
          statusCallbackEvent: 'initiated ringing in-progress answered completed',
          statusCallbackMethod: 'POST'
        };
        
        if (autoRecordEnabled) {
          dialOptions.record = 'record-from-answer-dual';
          dialOptions.recordingStatusCallback = `${baseUrl}/api/twilio/recording-status`;
        }
        
        // Route to the user's WebRTC client identity (their username)
        const dial = twimlResponse.dial(dialOptions);
        dial.client(incomingUser.username);
        
        console.log(`📞 Incoming call routed to WebRTC client: ${incomingUser.username}`);
        res.set('Content-Type', 'text/xml');
        res.send(twimlResponse.toString());
      }
    } catch (error: any) {
      console.error('Voice webhook error:', error);
      console.error('Voice webhook error details:', {
        message: error.message,
        stack: error.stack,
        From: req.body.From,
        To: req.body.To,
        CallSid: req.body.CallSid
      });
      
      // Determine error message based on error type
      let errorMessage = "There was an error processing your call.";
      
      if (error.message?.includes('No user found') || error.message?.includes('No user configured')) {
        errorMessage = "This phone number is not configured. Please contact your administrator.";
      } else if (error.message?.includes('Twilio credentials')) {
        errorMessage = "Twilio credentials are not properly configured. Please contact your administrator.";
      } else if (error.message?.includes('User not found')) {
        errorMessage = "User account not found. Please contact your administrator.";
      }
      
      // Return descriptive TwiML error response using SDK for proper XML escaping
      const VoiceResponse = twilio.twiml.VoiceResponse;
      const twimlResponse = new VoiceResponse();
      twimlResponse.say({ voice: 'alice' }, errorMessage);
      twimlResponse.hangup();
      
      res.set('Content-Type', 'text/xml');
      res.send(twimlResponse.toString());
    }
  });

  // Parallel Dialer Voice webhook - connects answered calls to agent's browser via conference
  app.post("/api/twilio/voice/parallel-dialer", validateTwilioWebhook, async (req, res) => {
    try {
      const { CallSid, From, To, AnsweredBy } = req.body;
      const token = req.query.token as string;
      const lineId = req.query.lineId as string;
      const name = req.query.name as string;
      const userId = req.query.userId ? parseInt(req.query.userId as string) : null;
      
      // Validate userId if provided
      if (userId !== null && isNaN(userId)) {
        throw new Error('Invalid userId in query parameters');
      }
      
      console.log('🎯 Parallel Dialer Voice webhook called:', {
        CallSid, From, To, AnsweredBy, lineId, name, userId, hasToken: !!token
      });
      
      if (!token) {
        throw new Error('Missing webhook token');
      }
      
      // Verify and decode the webhook token to get userId (fallback if not in query)
      const verifiedUserId = userId || verifyWebhookToken(token);
      
      // Get user details
      const user = await storage.getUser(verifiedUserId);
      if (!user) {
        throw new Error(`User not found: ${verifiedUserId}`);
      }
      
      // Get user's Twilio credentials
      const { credentials } = await userTwilioCache.getTwilioClient(verifiedUserId);
      
      // Check if AMD detected a machine (blocks machine/fax, allows human/unknown/blank)
      // machine* values: machine, machine_start, machine_end_beep, machine_end_silence, machine_end_other, machine_end_detected, etc.
      // Allow 'unknown' (AMD timeout/disabled) and blank (no AMD) to pass through
      const normalized = (AnsweredBy || '').toLowerCase();
      const isMachine = normalized.startsWith('machine') || normalized === 'fax';
      const isHuman = normalized === 'human';
      
      if (isMachine) {
        console.log(`🤖 Answering machine detected for call ${CallSid}, hanging up`);
        
        // Hang up on answering machines using SDK for proper XML generation
        const VoiceResponse = twilio.twiml.VoiceResponse;
        const twimlResponse = new VoiceResponse();
        twimlResponse.hangup();
        
        res.set('Content-Type', 'text/xml');
        res.send(twimlResponse.toString());
        return;
      }
      
      // CALL QUEUE MANAGEMENT: Track primary call and queue secondary human answers
      let isPrimaryCall = false;
      if (isHuman && lineId) {
        console.log(`🎯 Human detected on line ${lineId}`);
        
        try {
          // Check if this is the first human-answered call for this session
          const primaryCallSetting = await storage.getSetting(`parallel_dialer_primary_call_${verifiedUserId}`);
          
          // Check if no primary call OR setting value is null (from cleanup)
          if (!primaryCallSetting || !primaryCallSetting.value) {
            // This is the FIRST human-answered call - mark it as primary
            await storage.setSetting(`parallel_dialer_primary_call_${verifiedUserId}`, {
              lineId,
              callSid: CallSid,
              timestamp: Date.now(),
              inConference: false  // Will be set to true when bridged
            });
            
            isPrimaryCall = true;
            console.log(`✅ Marked line ${lineId} as primary call - will bridge to conference`);
            
            // Broadcast that primary call is connected
            wsService.broadcastToUser(verifiedUserId, 'parallel_dialer_primary_connected', {
              lineId,
              callSid: CallSid
            });
          } else {
            // This is a SECOND or later human-answered call - queue it on HOLD
            console.log(`🔄 Secondary human-answered call detected on line ${lineId} - queueing on HOLD`);
            
            // Mark this call as secondary (to be held)
            await storage.setSetting(`parallel_dialer_secondary_call_${verifiedUserId}_${lineId}`, {
              lineId,
              callSid: CallSid,
              timestamp: Date.now(),
              onHold: true,
              name: name || 'Unknown',
              phone: To
            });
          }
        } catch (error: any) {
          console.error('Error in call queue management:', error);
          // Default to primary if error
          isPrimaryCall = true;
        }
      }
      
      // Check if there's an active conference for this user
      const conferenceSetting = await storage.getSetting(`parallel_dialer_conference_${verifiedUserId}`);
      let conferenceData: any = conferenceSetting?.value || null;
      
      // Validate conference is still active and not expired
      if (conferenceData && conferenceData.status === 'active') {
        const conferenceCreatedAt = conferenceData.startTime ? conferenceData.startTime : 0;
        const conferenceAge = Date.now() - conferenceCreatedAt;
        // Conference expires after 10 minutes of inactivity
        if (conferenceAge > 10 * 60 * 1000) {
          console.warn(`⚠️ Conference ${conferenceData.conferenceName} expired (${Math.floor(conferenceAge / 1000)}s old), cleaning up`);
          
          // Completely remove expired conference setting
          await storage.setSetting(`parallel_dialer_conference_${verifiedUserId}`, null);
          
          // Clear primary call setting as well since session is expired
          await storage.setSetting(`parallel_dialer_primary_call_${verifiedUserId}`, null);
          
          // Clear secondary call settings (they follow pattern: parallel_dialer_secondary_call_{userId}_{lineId})
          // We'll attempt to clear for common line IDs (line-0 through line-9)
          for (let i = 0; i < 10; i++) {
            await storage.setSetting(`parallel_dialer_secondary_call_${verifiedUserId}_line-${i}`, null);
          }
          
          conferenceData = null; // Signal that conference doesn't exist
          console.log('✅ Cleaned up expired conference and all related settings');
        }
      }
      
      // Log conference state for debugging
      console.log(`🔍 Conference check for user ${verifiedUserId}:`, {
        hasConference: !!conferenceData,
        status: conferenceData?.status,
        conferenceStarted: conferenceData?.conferenceStarted,
        conferenceName: conferenceData?.conferenceName,
        age: conferenceData?.startTime ? Math.floor((Date.now() - conferenceData.startTime) / 1000) + 's' : 'N/A'
      });
      
      const baseUrl = process.env.REPLIT_DOMAINS 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : `https://${req.get('host')}`;
      
      const webhookToken = generateWebhookToken(verifiedUserId);
      
      // Check if auto-recording is enabled for this user
      let autoRecordEnabled = true;
      const setting = await storage.getSetting(`auto_record_calls_user_${user.id}`);
      autoRecordEnabled = setting?.value === true || setting?.value === "true" || setting?.value === undefined;
      
      // Check if pre-recorded greeting is enabled for parallel dialer
      // Use global setting (not user-specific) to match frontend implementation
      const greetingSetting = await storage.getSetting(`parallel_dialer_greeting`);
      const greetingUrl = greetingSetting?.value as string | undefined;
      
      // Use Twilio SDK's VoiceResponse for proper XML generation
      const VoiceResponse = twilio.twiml.VoiceResponse;
      const twimlResponse = new VoiceResponse();
      
      // Add optional greeting before connecting to agent
      if (greetingUrl && greetingUrl.trim().length > 0) {
        twimlResponse.play(greetingUrl);
        console.log(`🎵 Playing pre-recorded greeting for call ${CallSid}: ${greetingUrl}`);
      }
      
      // OPTIMIZATION: No on-demand conference creation - conference must be created upfront
      // This eliminates customer wait time and ensures instant bridging
      
      // Check if this is a secondary call that should be put on HOLD
      const secondaryCallSetting = await storage.getSetting(`parallel_dialer_secondary_call_${verifiedUserId}_${lineId}`);
      const isSecondaryCall = secondaryCallSetting && secondaryCallSetting.value && (secondaryCallSetting.value as any).onHold;
      
      if (isSecondaryCall) {
        // This is a SECONDARY call - put it on HOLD (play hold music, don't conference)
        console.log(`🔇 Secondary call ${CallSid} on line ${lineId} - putting on HOLD (not conferencing)`);
        
        // Play hold music indefinitely
        twimlResponse.say({ voice: 'alice' }, 'Please hold while we connect you.');
        twimlResponse.play({ loop: 0 }, 'http://com.twilio.sounds.music.s3.amazonaws.com/MARKOVICHAMP-Borghestral.mp3');
        
        // Broadcast that this call is on hold
        wsService.broadcastToUser(verifiedUserId, 'parallel_dialer_call_on_hold', {
          lineId,
          callSid: CallSid,
          timestamp: Date.now()
        });
      } else if (conferenceData && conferenceData.status === 'active' && conferenceData.conferenceName) {
        // This is the PRIMARY call or conference mode is active - bridge to conference
        const waitForAgent = !conferenceData.conferenceStarted;
        console.log(`🎯 Bridging call ${CallSid} to conference: ${conferenceData.conferenceName} ${waitForAgent ? '(waiting for agent to join)' : '(agent confirmed joined)'}`);
        
        const dialOptions: any = {
          action: `${baseUrl}/api/twilio/dial-status?token=${encodeURIComponent(webhookToken)}`,
          method: 'POST'
        };
        
        if (autoRecordEnabled) {
          dialOptions.record = 'record-from-answer-dual';
          dialOptions.recordingStatusCallback = `${baseUrl}/api/twilio/recording-status?token=${encodeURIComponent(webhookToken)}`;
        }
        
        const dial = twimlResponse.dial(dialOptions);
        dial.conference({
          startConferenceOnEnter: waitForAgent, // Customer starts conference if agent not joined yet
          endConferenceOnExit: false,
          beep: 'false' as any,
          waitUrl: waitForAgent ? '' : undefined, // Silent wait if agent not joined
          statusCallback: `${baseUrl}/api/twilio/conference-status?token=${encodeURIComponent(webhookToken)}`,
          statusCallbackEvent: ['join', 'leave'] as any
        }, conferenceData.conferenceName);
      } else {
        // Fallback to direct client connection if no conference active or agent hasn't joined yet
        const reason = !conferenceData ? 'no conference created' :
                      conferenceData.status !== 'active' ? 'conference not active' :
                      !conferenceData.conferenceStarted ? 'agent not joined yet' :
                      !conferenceData.conferenceName ? 'no conference name' :
                      'unknown';
        console.log(`⚠️ Using direct client connection for call ${CallSid} - Reason: ${reason}`);
        
        const dialOptions: any = {
          answerOnBridge: true,
          timeout: 30,
          action: `${baseUrl}/api/twilio/dial-status?token=${encodeURIComponent(webhookToken)}`,
          method: 'POST',
          statusCallback: `${baseUrl}/api/twilio/status?token=${encodeURIComponent(webhookToken)}`,
          statusCallbackEvent: 'initiated ringing in-progress answered completed',
          statusCallbackMethod: 'POST'
        };
        
        if (autoRecordEnabled) {
          dialOptions.record = 'record-from-answer-dual';
          dialOptions.recordingStatusCallback = `${baseUrl}/api/twilio/recording-status?token=${encodeURIComponent(webhookToken)}`;
        }
        
        if (credentials.phoneNumber) {
          dialOptions.callerId = credentials.phoneNumber;
        }
        
        const dial = twimlResponse.dial(dialOptions);
        const client = dial.client(user.username);
        client.parameter({ name: 'isParallelDialer', value: 'true' });
        client.parameter({ name: 'contactName', value: name || 'Unknown' });
        client.parameter({ name: 'contactPhone', value: To });
        client.parameter({ name: 'lineId', value: lineId || '' });
        client.parameter({ name: 'greetingPlayed', value: greetingUrl ? 'true' : 'false' });
      }
      
      const useConference = conferenceData?.status === 'active' && conferenceData?.conferenceStarted === true && conferenceData?.conferenceName;
      console.log(`📞 Parallel dialer call ${CallSid} connecting to agent: ${user.username} (line: ${lineId}, conference: ${useConference ? 'yes' : 'no'})`);
      res.set('Content-Type', 'text/xml');
      res.send(twimlResponse.toString());
      
    } catch (error: any) {
      console.error('Parallel dialer voice webhook error:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        CallSid: req.body.CallSid
      });
      
      // Return error TwiML using SDK for proper XML generation
      const VoiceResponse = twilio.twiml.VoiceResponse;
      const twimlResponse = new VoiceResponse();
      twimlResponse.say({ voice: 'alice' }, 'There was an error connecting your call.');
      twimlResponse.hangup();
      
      res.set('Content-Type', 'text/xml');
      res.send(twimlResponse.toString());
    }
  });

  // Async AMD status callback - handles answering machine detection results
  app.post("/api/twilio/amd-status", validateTwilioWebhook, async (req, res) => {
    try {
      const { CallSid, AnsweredBy, MachineDetectionDuration } = req.body;
      
      console.log('🤖 Async AMD callback:', {
        CallSid,
        AnsweredBy,
        MachineDetectionDuration
      });
      
      // Find the call record
      const callRecord = await storage.getCallByTwilioSid(CallSid);
      
      if (callRecord && callRecord.metadata) {
        const metadata = callRecord.metadata as any;
        const isHuman = AnsweredBy === 'human';
        const isMachine = AnsweredBy?.startsWith('machine') || AnsweredBy === 'fax';
        
        // Update call metadata with AMD results
        await storage.updateCall(callRecord.userId, callRecord.id, {
          metadata: {
            ...metadata,
            answeredBy: AnsweredBy,
            isAnsweringMachine: isMachine,
            isHuman: isHuman,
            machineDetectionDuration: MachineDetectionDuration ? parseInt(MachineDetectionDuration) : 0
          }
        });
        
        console.log(`📊 AMD result for ${CallSid}: ${AnsweredBy} (human: ${isHuman}, machine: ${isMachine})`);
        
        // CRITICAL: If human answered, cancel other parallel calls to save costs
        if (isHuman && metadata.lineId) {
          console.log(`🎯 Human detected on line ${metadata.lineId}, canceling other parallel calls`);
          
          // Get all active calls for this user that are in parallel dialer mode
          const activeCalls = await storage.getActiveCalls(callRecord.userId);
          const parallelCalls = activeCalls.filter(call => {
            const callMeta = call.metadata as any;
            // Use metadata.twilioCallSid for reliable comparison (sipCallId might not be set yet due to race condition)
            const callTwilioSid = callMeta?.twilioCallSid || call.sipCallId;
            return callMeta?.lineId && 
                   callTwilioSid !== CallSid && 
                   ['initiated', 'queued', 'ringing'].includes(call.status);
          });
          
          if (parallelCalls.length > 0) {
            console.log(`🚫 Canceling ${parallelCalls.length} other parallel calls`);
            
            // Get Twilio client for this user
            const { client } = await userTwilioCache.getTwilioClient(callRecord.userId);
            
            // Cancel each parallel call
            for (const call of parallelCalls) {
              const callMeta = call.metadata as any;
              const twilioCallSid = callMeta?.twilioCallSid || call.sipCallId;
              
              if (!twilioCallSid) {
                console.warn(`⚠️ Skipping call ${call.id} - no Twilio CallSid found`);
                continue;
              }
              
              try {
                await client.calls(twilioCallSid).update({ status: 'canceled' });
                await storage.updateCall(callRecord.userId, call.id, {
                  status: 'canceled',
                  metadata: {
                    ...callMeta,
                    cancelReason: 'human_answered_on_another_line',
                    canceledAt: new Date().toISOString()
                  }
                });
                console.log(`✅ Canceled call ${twilioCallSid} on line ${callMeta?.lineId}`);
              } catch (error: any) {
                console.error(`Failed to cancel call ${twilioCallSid}:`, error.message);
              }
            }
          }
        }
      }
      
      res.sendStatus(200);
    } catch (error: any) {
      console.error('AMD callback error:', error);
      res.sendStatus(200); // Always return 200 to prevent retries
    }
  });

  // Dial status callback endpoint (called when dial completes)
  app.post("/api/twilio/dial-status", validateTwilioWebhook, async (req, res) => {
    try {
      const { CallSid, DialCallStatus, DialCallDuration } = req.body;
      
      console.log('📞 Dial status callback:', {
        CallSid,
        DialCallStatus,
        DialCallDuration
      });
      
      // Auto-assign disposition based on call outcome (async, non-blocking)
      setImmediate(async () => {
        try {
          const callRecord = await storage.getCallByTwilioSid(CallSid);
          if (!callRecord) {
            console.warn(`⚠️ Call record not found for CallSid: ${CallSid}`);
            return;
          }
          
          const metadata = (callRecord.metadata as any) || {};
          const answeredBy = metadata.answeredBy || '';
          const contactId = metadata.contactId;
          
          // Auto-assign disposition based on call outcome
          let autoDisposition = '';
          
          if (DialCallStatus === 'completed' || DialCallStatus === 'answered') {
            // Call was answered - check AMD result
            if (answeredBy === 'human') {
              autoDisposition = 'answered';
            } else if (answeredBy === 'machine_start' || answeredBy === 'machine_end_beep' || answeredBy === 'machine_end_silence') {
              autoDisposition = 'voicemail';
            } else if (answeredBy === 'fax') {
              autoDisposition = 'disconnected';
            } else {
              // No AMD or unknown - default to answered
              autoDisposition = 'answered';
            }
          } else if (DialCallStatus === 'busy') {
            autoDisposition = 'busy';
          } else if (DialCallStatus === 'no-answer') {
            autoDisposition = 'no-answer';
          } else if (DialCallStatus === 'canceled') {
            autoDisposition = 'failed';
          } else if (DialCallStatus === 'failed') {
            autoDisposition = 'failed';
          } else {
            autoDisposition = 'no-answer';
          }
          
          console.log(`🎯 Auto-assigning disposition: ${autoDisposition} (status: ${DialCallStatus}, AMD: ${answeredBy})`);
          
          // Update call record with auto-disposition
          await storage.updateCall(callRecord.userId, callRecord.id, {
            disposition: autoDisposition,
            metadata: {
              ...metadata,
              autoDisposition: autoDisposition,
              dialCallStatus: DialCallStatus,
              dialCallDuration: DialCallDuration ? parseInt(DialCallDuration) : 0
            }
          });
          
          // Update contact disposition if contact is linked
          if (contactId) {
            await storage.updateContact(callRecord.userId, contactId, {
              disposition: autoDisposition
            });
            console.log(`✅ Updated contact ${contactId} disposition to: ${autoDisposition}`);
          }
          
        } catch (error: any) {
          console.error('Auto-disposition error:', error);
        }
      });
      
      // Return empty TwiML response to properly end the call
      const VoiceResponse = twilio.twiml.VoiceResponse;
      const twimlResponse = new VoiceResponse();
      twimlResponse.hangup();
      
      res.set('Content-Type', 'text/xml');
      res.send(twimlResponse.toString());
    } catch (error: any) {
      console.error('Dial status callback error:', error);
      
      // Return TwiML hangup even on error to properly end the call
      const VoiceResponse = twilio.twiml.VoiceResponse;
      const twimlResponse = new VoiceResponse();
      twimlResponse.hangup();
      
      res.set('Content-Type', 'text/xml');
      res.send(twimlResponse.toString());
    }
  });

  // Dedicated recording status callback endpoint for automatic BunnyCDN upload
  app.post("/api/twilio/recording-status", webhookLimiter, validateTwilioWebhook, async (req, res) => {
    try {
      const { 
        CallSid,
        RecordingSid, 
        RecordingUrl, 
        RecordingStatus, 
        RecordingDuration,
        RecordingChannels, 
        RecordingSource, 
        RecordingStartTime,
        AccountSid
      } = req.body;
      
      console.log('📼 Recording status webhook received:', {
        RecordingSid,
        RecordingStatus,
        RecordingDuration,
        CallSid,
        RecordingUrl
      });
      
      // Return 200 immediately to acknowledge receipt
      res.sendStatus(200);
      
      // Process recording in background
      if (!RecordingSid || !CallSid) {
        console.error('❌ Missing required recording data (RecordingSid or CallSid)');
        return;
      }
      
      // Find the call record to get userId and other details
      const callRecord = await storage.getCallByTwilioSid(CallSid);
      
      if (!callRecord || !callRecord.userId) {
        console.error(`❌ Call record not found for CallSid: ${CallSid}`);
        return;
      }
      
      const userId = callRecord.userId;
      
      // Check if recording already exists
      const existingRecording = await storage.getRecordingByTwilioSid(userId, RecordingSid);
      
      const recordingData = {
        twilioRecordingSid: RecordingSid,
        twilioCallSid: CallSid,
        twilioAccountSid: AccountSid,
        callId: callRecord.id,
        contactId: callRecord.contactId,
        userId: userId,
        phone: callRecord.phone,
        direction: callRecord.type === 'outgoing' ? 'outbound' : 'inbound',
        duration: RecordingDuration ? parseInt(RecordingDuration) : 0,
        twilioUrl: RecordingUrl,
        audioCodec: 'mp3',
        channels: RecordingChannels ? parseInt(RecordingChannels) : 1,
        status: RecordingStatus === 'completed' ? 'ready' : RecordingStatus || 'processing',
        recordingSource: RecordingSource || 'DialVerb',
        recordingStartTime: RecordingStartTime ? new Date(RecordingStartTime) : new Date(),
        metadata: {
          originalWebhookData: req.body,
          receivedAt: new Date().toISOString()
        }
      };
      
      let recordingId: number;
      
      if (existingRecording) {
        const updated = await storage.updateRecording(userId, existingRecording.id, recordingData);
        wsService.broadcastRecordingUpdate(userId, updated);
        console.log(`✅ Updated recording: ${RecordingSid} (ID: ${existingRecording.id})`);
        recordingId = existingRecording.id;
      } else {
        const created = await storage.createRecording(userId, recordingData);
        wsService.broadcastNewRecording(userId, created);
        console.log(`✅ Created new recording: ${RecordingSid} (ID: ${created.id})`);
        recordingId = created.id;
      }

      // Automatic BunnyCDN upload and Twilio deletion workflow
      if (RecordingStatus === 'completed' && RecordingUrl) {
        console.log(`📤 Recording ${RecordingSid} completed - initiating automatic BunnyCDN upload workflow...`);
        
        // Run upload workflow in background (non-blocking)
        setImmediate(async () => {
          try {
            // Check if already migrated to prevent duplicate processing
            const currentRecording = await storage.getRecording(userId, recordingId);
            if (currentRecording?.bunnycdnUrl && currentRecording?.bunnycdnUploadedAt) {
              console.log(`⏭️ Recording ${RecordingSid} already migrated to BunnyCDN - skipping duplicate webhook`);
              return;
            }
            
            const { bunnycdnService } = await import('./services/bunnycdnService');
            
            // Check if BunnyCDN is configured
            if (!bunnycdnService.isConfigured()) {
              console.log(`⏭️ BunnyCDN not configured for recording ${RecordingSid} - skipping automatic upload`);
              await storage.updateRecording(userId, recordingId, {
                metadata: {
                  ...recordingData.metadata,
                  bunnycdnSkipReason: 'not_configured',
                  bunnycdnSkippedAt: new Date().toISOString()
                }
              });
              return;
            }

            console.log(`🔄 Starting BunnyCDN migration for recording ${RecordingSid}...`);
            
            // Get Twilio client for this user
            const { client: twilioClient, credentials } = await userTwilioCache.getTwilioClient(userId);
            
            if (!twilioClient || !credentials) {
              console.error(`❌ Could not get Twilio client for user ${userId} - aborting BunnyCDN upload`);
              await storage.updateRecording(userId, recordingId, {
                status: 'error',
                metadata: {
                  ...recordingData.metadata,
                  bunnycdnError: 'twilio_client_unavailable',
                  bunnycdnErrorAt: new Date().toISOString()
                }
              });
              return;
            }

            // Migrate recording to BunnyCDN (download → upload → delete from Twilio)
            const result = await bunnycdnService.migrateRecordingToBunnyCDN(
              userId,
              recordingId,
              twilioClient,
              credentials
            );

            // Log detailed results
            if (result.uploaded && result.cdnUrl) {
              console.log(`✅ [SUCCESS] Recording ${RecordingSid} uploaded to BunnyCDN: ${result.cdnUrl}`);
              
              if (result.deleted) {
                console.log(`✅ [SUCCESS] Recording ${RecordingSid} deleted from Twilio storage - cost savings applied`);
              } else {
                console.warn(`⚠️ [WARNING] Recording ${RecordingSid} uploaded to BunnyCDN but failed to delete from Twilio`);
                await storage.updateRecording(userId, recordingId, {
                  metadata: {
                    ...recordingData.metadata,
                    bunnycdnUploadSuccess: true,
                    twilioDeleteFailed: true,
                    twilioDeleteFailedAt: new Date().toISOString()
                  }
                });
              }
            } else {
              console.error(`❌ [ERROR] Failed to upload recording ${RecordingSid} to BunnyCDN`);
            }
          } catch (error: any) {
            console.error(`❌ [ERROR] BunnyCDN upload workflow failed for recording ${RecordingSid}:`, error.message);
            console.error('Error stack:', error.stack);
            
            // Update recording with error details
            try {
              await storage.updateRecording(userId, recordingId, {
                status: 'error',
                metadata: {
                  ...recordingData.metadata,
                  bunnycdnWorkflowError: error.message,
                  bunnycdnWorkflowErrorStack: error.stack,
                  bunnycdnWorkflowErrorAt: new Date().toISOString()
                }
              });
            } catch (updateError: any) {
              console.error('Failed to update recording with error:', updateError.message);
            }
          }
        });
      } else if (RecordingStatus !== 'completed') {
        console.log(`⏳ Recording ${RecordingSid} status is '${RecordingStatus}' - waiting for completion`);
      } else if (!RecordingUrl) {
        console.warn(`⚠️ Recording ${RecordingSid} completed but missing RecordingUrl`);
      }
    } catch (error: any) {
      console.error('❌ Recording status webhook error:', error.message);
      console.error('Error stack:', error.stack);
      // Don't throw - already sent 200 response
    }
  });

  // Call status callback endpoint
  app.post("/api/twilio/status", webhookLimiter, validateTwilioWebhook, async (req, res) => {
    try {
      const { 
        CallSid, CallStatus, CallDuration, RecordingUrl,
        StatusCallbackEvent, AnsweredBy, CallbackSource, Timestamp
      } = req.body;
      
      console.log('🔔 Status callback received:', {
        CallSid,
        CallStatus,
        StatusCallbackEvent,
        CallDuration,
        AnsweredBy,
        CallbackSource,
        timestamp: Timestamp || new Date().toISOString()
      });
      
      // Handle call status updates with comprehensive event tracking
      if (CallSid && (CallStatus || StatusCallbackEvent)) {
        const callRecord = await storage.getCallByTwilioSid(CallSid);
        
        if (callRecord && callRecord.userId) {
          // Map Twilio status to our internal status
          let mappedStatus = CallStatus;
          let outcome = callRecord.outcome;
          
          // Handle StatusCallbackEvent for more granular tracking
          if (StatusCallbackEvent) {
            switch (StatusCallbackEvent) {
              case 'initiated':
                mappedStatus = 'initiated';
                break;
              case 'ringing':
                mappedStatus = 'ringing';
                break;
              case 'answered':
                mappedStatus = 'in-progress';
                outcome = 'connected';
                break;
              case 'completed':
                mappedStatus = 'completed';
                outcome = outcome || 'successful';
                break;
            }
          }
          
          // Map CallStatus values to comprehensive statuses
          switch (CallStatus) {
            case 'queued':
              mappedStatus = 'queued';
              break;
            case 'initiated':
              mappedStatus = 'initiated';
              break;
            case 'ringing':
              mappedStatus = 'ringing';
              break;
            case 'in-progress':
              mappedStatus = 'in-progress';
              outcome = 'connected';
              break;
            case 'completed':
              mappedStatus = 'completed';
              outcome = outcome || 'successful';
              break;
            case 'busy':
              mappedStatus = 'busy';
              outcome = 'busy';
              break;
            case 'failed':
              mappedStatus = 'failed';
              outcome = 'failed';
              break;
            case 'no-answer':
              mappedStatus = 'no-answer';
              outcome = 'no-answer';
              break;
            case 'canceled':
              mappedStatus = 'canceled';
              outcome = 'canceled';
              break;
          }
          
          // Detect voicemail via Answering Machine Detection (AMD)
          if (AnsweredBy) {
            const isVoicemail = AnsweredBy === 'machine_start' || 
                               AnsweredBy === 'machine_end_beep' || 
                               AnsweredBy === 'machine_end_silence' ||
                               AnsweredBy === 'machine_end_other';
            const isHuman = AnsweredBy === 'human';
            
            if (isVoicemail) {
              outcome = 'voicemail';
              console.log(`📧 Voicemail detected for call ${CallSid} (AnsweredBy: ${AnsweredBy})`);
            } else if (isHuman) {
              outcome = 'human';
              console.log(`👤 Human answered for call ${CallSid}`);
            }
          }
          
          // Detect call-dropped scenarios
          // If call was in-progress but ended with failed status, or duration is very short
          if (callRecord.status === 'in-progress' && CallStatus === 'failed') {
            mappedStatus = 'call-dropped';
            outcome = 'dropped';
            console.log(`📞 Call dropped unexpectedly for ${CallSid}`);
          }
          
          // If call was ringing/initiated and ended with failed/canceled
          if (['ringing', 'initiated'].includes(callRecord.status) && 
              ['failed', 'canceled'].includes(CallStatus)) {
            mappedStatus = 'call-dropped';
            outcome = 'dropped';
            console.log(`📞 Call dropped before connection for ${CallSid}`);
          }
          
          // ENHANCED: Calculate ring duration and connection time for parallel dialer
          const metadata = callRecord.metadata as any;
          const isParallelDialer = metadata && metadata.lineId;
          
          // Calculate ring duration (time from creation to first answer/connection)
          let ringDuration = callRecord.ringDuration;
          let connectionTime = callRecord.connectionTime;
          
          if (isParallelDialer && !callRecord.connectionTime && mappedStatus === 'in-progress') {
            // First time call connects - calculate ring duration
            const callCreatedTime = callRecord.createdAt ? new Date(callRecord.createdAt).getTime() : Date.now();
            ringDuration = Math.floor((Date.now() - callCreatedTime) / 1000);
            connectionTime = new Date();
            console.log(`📊 Call ${CallSid} connected - Ring duration: ${ringDuration}s`);
          }
          
          // Auto-assign disposition based on call outcome for parallel dialer
          let disposition = callRecord.disposition;
          if (isParallelDialer && !disposition) {
            // Set disposition based on status and outcome
            // Use only valid dispositions from expanded list
            if (mappedStatus === 'in-progress' || outcome === 'human') {
              disposition = 'human-answered';  // Human answered - agent connected
            } else if (outcome === 'voicemail' || AnsweredBy?.toLowerCase().includes('machine')) {
              disposition = 'voicemail';
            } else if (mappedStatus === 'no-answer') {
              disposition = 'no-answer';
            } else if (mappedStatus === 'busy') {
              disposition = 'busy';
            } else if (mappedStatus === 'failed') {
              disposition = 'failed';
            } else if (mappedStatus === 'canceled') {
              disposition = 'dnc-skipped';  // Canceled/skipped call
            } else if (mappedStatus === 'completed') {
              disposition = outcome === 'voicemail' ? 'voicemail' : 'answered';
            }
          }
          
          // Update call status
          const updates: any = {
            status: mappedStatus,
            duration: CallDuration ? parseInt(CallDuration) : callRecord.duration || 0,
            recordingUrl: RecordingUrl || callRecord.recordingUrl || null,
            outcome,
            updatedAt: new Date()
          };
          
          // Add enhanced metrics for parallel dialer
          if (isParallelDialer) {
            if (ringDuration !== undefined) updates.ringDuration = ringDuration;
            if (connectionTime) updates.connectionTime = connectionTime;
            if (disposition) updates.disposition = disposition;
            if (AnsweredBy) updates.answeredBy = AnsweredBy;
            if (AnsweredBy) {
              const amdComment = `AMD Result: ${AnsweredBy}. Call ${mappedStatus === 'in-progress' ? 'connected' : 'ended'} with status: ${mappedStatus}`;
              updates.amdComment = amdComment;
            }
            updates.isParallelDialer = true;
            updates.lineId = metadata.lineId;
            
            console.log(`📊 Enhanced metrics - Disposition: ${disposition}, Ring: ${ringDuration}s, AMD: ${AnsweredBy || 'N/A'}`);
          }
          
          // Update metadata with detailed status information
          updates.metadata = {
            ...(callRecord.metadata && typeof callRecord.metadata === 'object' ? callRecord.metadata : {}),
            twilioCallSid: CallSid,
            lastStatusEvent: StatusCallbackEvent || CallStatus,
            lastStatusTimestamp: Timestamp || new Date().toISOString(),
            callbackSource: CallbackSource,
            answeredBy: AnsweredBy,
            isAnsweringMachine: AnsweredBy ? (
              AnsweredBy.toLowerCase().includes('machine') || AnsweredBy === 'fax'
            ) : false,
            isHuman: AnsweredBy === 'human',
            statusHistory: [
              ...((callRecord.metadata && typeof callRecord.metadata === 'object' && 'statusHistory' in callRecord.metadata && Array.isArray(callRecord.metadata.statusHistory)) ? callRecord.metadata.statusHistory : []),
              {
                status: mappedStatus,
                event: StatusCallbackEvent,
                timestamp: Timestamp || new Date().toISOString()
              }
            ].slice(-20) // Keep last 20 status changes
          };
          
          await storage.updateCall(callRecord.userId, callRecord.id, updates);
          console.log('✅ Updated call record:', { 
            callId: callRecord.id, 
            status: mappedStatus, 
            outcome,
            event: StatusCallbackEvent 
          });
          
          // ENHANCED: Auto-update contact disposition based on call outcome
          if (isParallelDialer && callRecord.contactId && disposition) {
            const terminalStatuses = ['completed', 'failed', 'canceled', 'no-answer', 'busy', 'call-dropped'];
            if (terminalStatuses.includes(mappedStatus)) {
              try {
                // Map call disposition to contact disposition
                let contactDisposition = 'answered';
                if (disposition === 'connected') {
                  contactDisposition = 'interested'; // Connected calls default to interested
                } else if (disposition === 'voicemail') {
                  contactDisposition = 'voicemail';
                } else if (disposition === 'no-answer') {
                  contactDisposition = 'callback-requested'; // No answer gets callback disposition
                } else if (disposition === 'busy') {
                  contactDisposition = 'callback-requested';
                } else if (disposition === 'failed' || disposition.includes('dropped')) {
                  contactDisposition = 'not-interested';
                }
                
                await storage.updateContact(callRecord.userId, callRecord.contactId, {
                  disposition: contactDisposition,
                  lastContactedAt: new Date()
                });
                
                console.log(`📋 Updated contact ${callRecord.contactId} disposition: ${contactDisposition} (from call disposition: ${disposition})`);
              } catch (error: any) {
                console.error(`Failed to update contact disposition:`, error.message);
              }
            }
          }
          
          // Check if this is a parallel dialer call (metadata already defined above)
          if (metadata && metadata.lineId) {
            // Fetch contact details for parallel dialer broadcast
            let contact = null;
            if (callRecord.contactId) {
              contact = await storage.getContact(callRecord.userId, callRecord.contactId);
            }
            
            const contactData = {
              id: contact?.id || 0,
              name: contact?.name || 'Unknown',
              phone: callRecord.phone,
              company: contact?.company || undefined,
              jobTitle: contact?.jobTitle || undefined,
              email: contact?.email || undefined
            };
            
            const eventData = {
              lineId: metadata.lineId,
              callSid: CallSid,
              callId: callRecord.id,
              contact: contactData,
              status: mappedStatus,
              statusEvent: StatusCallbackEvent,
              callStatus: CallStatus,
              duration: CallDuration ? parseInt(CallDuration) : callRecord.duration || 0,
              isAnsweringMachine: updates.metadata.isAnsweringMachine,
              isHuman: updates.metadata.isHuman,
              answeredBy: AnsweredBy || undefined,
              disposition: disposition,
              outcome,
              timestamp: Date.now()
            };
            
            console.log(`📞 Parallel dialer status update: ${mappedStatus} (${StatusCallbackEvent || CallStatus}) for line ${metadata.lineId}`);
            
            // Broadcast real-time status update with comprehensive data
            wsService.broadcastParallelCallStatus(callRecord.userId, eventData);
            
            // in-progress means call was answered (connected/bridged)
            if (mappedStatus === 'in-progress') {
              console.log(`✅ Parallel dialer call CONNECTED on line ${metadata.lineId}`);
              wsService.broadcastParallelCallConnected(callRecord.userId, {
                ...eventData,
                contact: contactData
              });
            } 
            
            // Final statuses - call ended
            // Define all known terminal statuses plus a fallback for any non-active status
            const terminalStatuses = ['completed', 'failed', 'canceled', 'no-answer', 'busy', 'call-dropped'];
            const activeStatuses = ['initiated', 'queued', 'ringing', 'in-progress'];
            const isTerminalStatus = terminalStatuses.includes(mappedStatus) || !activeStatuses.includes(mappedStatus);
            
            if (isTerminalStatus && mappedStatus !== 'in-progress') {
              console.log(`❌ Parallel dialer call ended: ${mappedStatus} on line ${metadata.lineId}`);
              wsService.broadcastParallelCallEnded(callRecord.userId, {
                ...eventData,
                contact: contactData
              });
            }
          } else {
            // Regular call (not parallel dialer) - still broadcast for dashboard updates
            wsService.broadcastCallUpdate(callRecord.userId, {
              ...callRecord,
              ...updates,
              id: callRecord.id,
              userId: callRecord.userId
            });
          }
        }
      }
      
      res.sendStatus(200);
    } catch (error: any) {
      console.error('Status/Recording callback error:', error);
      res.sendStatus(200); // Always return 200 to prevent retries
    }
  });


  app.post("/api/twilio/make-call", requireSessionAuth, async (req, res) => {
    try {
      const { to, from } = req.body;
      console.log('=== MAKE CALL BACKEND ===');
      console.log('Request body:', { to, from });
      
      if (!to) {
        return res.status(400).json({ message: "Destination number is required" });
      }

      // Validate phone number format
      const phoneRegex = /^\+?[1-9]\d{1,14}$/;
      if (!phoneRegex.test(to.replace(/[^\d+]/g, ''))) {
        return res.status(400).json({ 
          message: "Invalid phone number format",
          code: 'INVALID_PHONE_NUMBER'
        });
      }

      // Get the user identity for client routing
      const userId = (req as any).session?.userId;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const clientName = user.username;
      
      // Create TwiML URL for the call using the public Replit URL with signed token for security
      const baseUrl = process.env.REPLIT_DOMAINS 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : `https://${req.get('host')}`;
      
      const token = generateWebhookToken(user.id);
      const twimlUrl = `${baseUrl}/api/twilio/twiml/dial-client?token=${encodeURIComponent(token)}&number=${encodeURIComponent(to)}`;
      console.log('TwiML URL:', twimlUrl);
      
      // Use user-specific Twilio client
      const call = await userTwilioCache.makeCall(user.id, from, to, twimlUrl);
      console.log('Call created:', {
        sid: call.sid,
        status: call.status,
        to: call.to,
        from: call.from
      });
      
      res.json({ 
        callSid: call.sid, 
        status: call.status,
        to: call.to,
        from: call.from,
        direction: call.direction,
        dateCreated: call.dateCreated
      });
    } catch (error: any) {
      console.error('Make call error:', error);
      res.status(500).json({ 
        message: error.message,
        code: error.code || 'CALL_FAILED',
        details: error.moreInfo || null
      });
    }
  });

  // Device registration and management
  // Note: Device registration is now handled per-user through the cache
  app.post("/api/twilio/device/register", requireSessionAuth, async (req, res) => {
    try {
      const userId = (req as any).session?.userId;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Device is implicitly "registered" when user gets a Twilio client from cache
      res.json({ 
        message: "Device registered successfully",
        identity: user.username 
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/twilio/device/unregister", requireSessionAuth, async (req, res) => {
    try {
      const userId = (req as any).session?.userId;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Clear user's Twilio cache
      clearTwilioCacheOnLogout(user.id);
      res.json({ 
        message: "Device unregistered successfully",
        identity: user.username 
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Token refresh endpoint
  app.post("/api/twilio/refresh-token", requireSessionAuth, async (req, res) => {
    try {
      const userId = (req as any).session?.userId;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Generate new token for the user
      const accessToken = await userTwilioCache.generateAccessToken(user.id, user.username);
      
      res.json({ 
        accessToken,
        expiresIn: 3600,
        identity: user.username 
      });
    } catch (error: any) {
      res.status(500).json({ 
        message: error.message,
        code: error.code || 'TOKEN_REFRESH_FAILED'
      });
    }
  });

  // Call quality reporting
  app.post("/api/twilio/call-quality", requireSessionAuth, async (req, res) => {
    try {
      const { callSid, quality } = req.body;
      if (!callSid) {
        return res.status(400).json({ message: "Call SID is required" });
      }

      // Log call quality to database (no longer using global service)
      console.log(`Call quality logged: ${callSid} - ${quality}`);
      res.json({ message: "Call quality logged successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Auto-recording toggle endpoints
  app.post("/api/twilio/auto-recording/toggle", requireSessionAuth, async (req, res) => {
    try {
      const userId = (req as any).session?.userId;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { enabled } = req.body;
      
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: "enabled field must be a boolean" });
      }

      // Store auto-recording preference per user as boolean
      await storage.setSetting(`auto_record_calls_user_${user.id}`, enabled);
      
      console.log(`✅ Auto-recording ${enabled ? 'enabled' : 'disabled'} for user ${user.id}`);
      
      res.json({
        success: true,
        message: `Auto-recording ${enabled ? 'enabled' : 'disabled'} successfully`,
        autoRecordingEnabled: enabled
      });
    } catch (error: any) {
      console.error("Error toggling auto-recording:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/twilio/auto-recording/status", requireSessionAuth, async (req, res) => {
    try {
      const userId = (req as any).session?.userId;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const setting = await storage.getSetting(`auto_record_calls_user_${user.id}`);
      // Default to false (opt-in model) if not set
      const isEnabled = setting?.value === true || setting?.value === "true" || false;
      
      console.log(`📊 Auto-recording status for user ${user.id}: ${isEnabled} (setting value: ${JSON.stringify(setting?.value)})`);
      
      res.json({ 
        autoRecordingEnabled: isEnabled,
        message: `Auto-recording is currently ${isEnabled ? 'enabled' : 'disabled'}`
      });
    } catch (error: any) {
      console.error("Error getting auto-recording status:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Health check endpoint for connection monitoring
  app.get("/api/twilio/health", requireSessionAuth, async (req, res) => {
    try {
      const userId = (req as any).session?.userId;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const status = await userTwilioCache.getConnectionStatus(user.id);
      
      res.json({
        healthy: status.isConnected,
        status: status.accountStatus,
        lastCheck: status.lastCheck,
        diagnostics: status.diagnostics
      });
    } catch (error: any) {
      res.status(500).json({ 
        message: error.message,
        healthy: false 
      });
    }
  });

  // Parallel Dialer routes
  app.post("/api/dialer/parallel-call", callLimiter, checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const { contactId, phone, name, lineId, amdEnabled, amdTimeout = 30, amdSensitivity = 'standard' } = req.body;

      if (!phone) {
        return res.status(400).json({ message: "Phone number is required" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Fetch full contact details if contactId is provided
      let contact = null;
      if (contactId) {
        contact = await storage.getContact(userId, contactId);
      }

      // Get user's Twilio client
      const { client, credentials } = await userTwilioCache.getTwilioClient(userId);
      
      if (!credentials.phoneNumber) {
        return res.status(400).json({ message: "Twilio phone number not configured" });
      }

      // Create call record with correct signature INCLUDING metadata with lineId
      // This prevents race condition where status callbacks arrive before metadata is set
      const callRecord = await storage.createCall(userId, {
        userId,
        contactId: contactId || undefined,
        phone,
        type: 'outgoing',
        status: 'initiated',
        duration: 0,
        metadata: {
          lineId,
          amdEnabled,
          amdTimeout,
          amdSensitivity
        }
      });

      // Generate base URL and webhook token for callbacks
      const baseUrl = process.env.REPLIT_DOMAINS 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : `https://${req.get('host')}`;
      
      const webhookToken = generateWebhookToken(userId);
      
      // CRITICAL FIX: Use voiceUrl webhook instead of inline TwiML
      // This ensures AMD runs AFTER customer answers and BEFORE connecting to agent
      // The webhook will check AMD result and only connect to agent if human answered
      const voiceUrl = `${baseUrl}/api/twilio/voice/parallel-dialer?token=${encodeURIComponent(webhookToken)}&lineId=${encodeURIComponent(String(lineId))}&name=${encodeURIComponent(name || 'Unknown')}&userId=${userId}`;
      
      console.log(`📞 Creating parallel dialer call to ${phone} with voiceUrl webhook for user: ${user.username}`);
      
      // Configure AMD based on sensitivity level
      // Low: Conservative (fewer false positives), Standard: Balanced, High: Aggressive (catch more VMs)
      const amdConfig = amdEnabled ? {
        machineDetection: 'Enable' as const,
        machineDetectionTimeout: amdTimeout,
        // Use synchronous AMD so AnsweredBy is available in voiceUrl webhook
        // Async AMD doesn't work with voiceUrl - webhook needs immediate AnsweredBy result
        asyncAmd: false,
        // Sensitivity affects speech and silence thresholds
        ...(amdSensitivity === 'low' ? {
          machineDetectionSilenceTimeout: 3000,  // 3s silence = human (conservative)
          machineDetectionSpeechThreshold: 3000,  // 3s speech min (conservative)
          machineDetectionSpeechEndThreshold: 2000  // 2s silence after speech
        } : amdSensitivity === 'high' ? {
          machineDetectionSilenceTimeout: 1500,  // 1.5s silence = human (aggressive)
          machineDetectionSpeechThreshold: 1500,  // 1.5s speech min (aggressive)
          machineDetectionSpeechEndThreshold: 1000  // 1s silence after speech
        } : {
          // Standard - use Twilio defaults by not specifying
        })
      } : {};

      const call = await client.calls.create({
        to: phone,
        from: credentials.phoneNumber,
        url: voiceUrl,  // Use webhook URL instead of inline TwiML
        method: 'POST',
        statusCallback: `${baseUrl}/api/twilio/status?token=${encodeURIComponent(webhookToken)}`,
        statusCallbackEvent: ['initiated', 'ringing', 'in-progress', 'answered', 'completed'],
        ...amdConfig
      });

      // Update call record with Twilio SID (merge with existing metadata)
      // Also set sipCallId for immediate webhook lookup (prevents race condition)
      await storage.updateCall(userId, callRecord.id, {
        sipCallId: call.sid,
        metadata: {
          ...(callRecord.metadata && typeof callRecord.metadata === 'object' ? callRecord.metadata : {}),
          twilioCallSid: call.sid,
          lineId,
          amdEnabled,
          amdTimeout,
          amdSensitivity,
          contactId: contact?.id
        }
      });

      // Track call attempt: increment contact's call attempts counter
      if (contact) {
        const currentAttempts = contact.callAttempts || 0;
        await storage.updateContact(userId, contact.id, {
          callAttempts: currentAttempts + 1,
          lastCallAttempt: new Date()
        });
        console.log(`📊 Updated call attempts for ${contact.name}: ${currentAttempts} → ${currentAttempts + 1}`);
      }

      // Broadcast WebSocket event with full contact details
      const contactData = {
        id: contact?.id || 0,
        name: contact?.name || name || 'Unknown',
        phone: phone,
        company: contact?.company || undefined,
        jobTitle: contact?.jobTitle || undefined,
        email: contact?.email || undefined
      };

      wsService.broadcastParallelCallStarted(userId, {
        lineId,
        callSid: call.sid,
        callId: callRecord.id,
        contact: contactData,
        status: 'initiated',
        startTime: Date.now(),
        timestamp: Date.now()
      });

      res.json({
        callSid: call.sid,
        callId: callRecord.id,
        status: call.status,
        lineId
      });

    } catch (error: any) {
      console.error('Parallel call error:', error);
      
      // Provide specific error messages based on Twilio error codes
      let errorMessage = error.message;
      let errorCode = 'UNKNOWN';
      
      if (error.code === 21219) {
        errorMessage = "Trial account can only call verified numbers. Please verify this number in your Twilio console or upgrade your account.";
        errorCode = 'TRIAL_ACCOUNT_RESTRICTION';
      } else if (error.code === 20429 || error.status === 429) {
        errorMessage = "Rate limit exceeded. Please reduce the number of parallel lines or slow down call initiation rate.";
        errorCode = 'RATE_LIMIT_EXCEEDED';
      } else if (error.code === 21217) {
        errorMessage = "Phone number is not formatted correctly. Please use E.164 format (+1234567890).";
        errorCode = 'INVALID_PHONE_NUMBER';
      } else if (error.code === 21614) {
        errorMessage = "'To' number is not a valid phone number.";
        errorCode = 'INVALID_TO_NUMBER';
      }
      
      res.status(error.status || 500).json({ 
        message: errorMessage,
        code: errorCode,
        twilioCode: error.code,
        lineId: req.body.lineId
      });
    }
  });

  app.post("/api/dialer/call-connected", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const { callSid, lineId, phone } = req.body;

      if (!callSid || !lineId) {
        return res.status(400).json({ message: "callSid and lineId are required" });
      }

      console.log(`📞 Client reported call connected: CallSid=${callSid}, lineId=${lineId}`);

      // Find the call record
      const callRecord = await storage.getCallByTwilioSid(callSid);

      if (callRecord) {
        // Get contact details
        let contact = null;
        if (callRecord.contactId) {
          contact = await storage.getContact(userId, callRecord.contactId);
        }

        const contactData = {
          id: contact?.id || 0,
          name: contact?.name || 'Unknown',
          phone: phone || callRecord.phone,
          company: contact?.company || undefined,
          jobTitle: contact?.jobTitle || undefined,
          email: contact?.email || undefined
        };

        // Broadcast parallel_call_connected event
        const eventData = {
          lineId,
          callSid,
          callId: callRecord.id,
          contact: contactData,
          status: 'in-progress',
          duration: 0,
          isAnsweringMachine: false,
          timestamp: Date.now()
        };

        console.log(`✅ Broadcasting parallel_call_connected for line ${lineId}`);
        wsService.broadcastParallelCallConnected(userId, eventData);

        res.json({ success: true, message: 'Call connected event broadcasted' });
      } else {
        console.warn(`⚠️ Call record not found for CallSid: ${callSid}`);
        res.status(404).json({ message: 'Call record not found' });
      }
    } catch (error: any) {
      console.error('Error handling call connected notification:', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/dialer/call-rejected", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const { callSid, lineId, phone, reason } = req.body;

      if (!lineId) {
        return res.status(400).json({ message: "lineId is required" });
      }

      console.log(`⚠️ Client rejected parallel dialer call: CallSid=${callSid}, lineId=${lineId}, reason=${reason}`);

      // Broadcast parallel_call_ended event so the line can dial the next contact
      const eventData = {
        lineId,
        callSid,
        phone,
        status: 'busy',
        reason: reason || 'agent_busy',
        timestamp: Date.now()
      };

      console.log(`📤 Broadcasting parallel_call_ended for rejected call on line ${lineId}`);
      wsService.broadcastParallelCallEnded(userId, eventData);

      res.json({ success: true, message: 'Call rejection handled, line will dial next contact' });
    } catch (error: any) {
      console.error('Error handling call rejection:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Clear primary call setting to allow new dialing session
  app.post("/api/dialer/clear-primary-call", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      // Clear the primary call setting by setting it to null
      await storage.setSetting(`parallel_dialer_primary_call_${userId}`, null);
      
      console.log(`✅ Cleared primary call setting for user ${userId}`);
      res.json({ message: 'Primary call setting cleared' });
    } catch (error: any) {
      console.error('Clear primary call error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/dialer/hangup", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const { callSid } = req.body;

      if (!callSid) {
        return res.status(400).json({ message: "Call SID is required" });
      }

      // CRITICAL: Check if this is the agent's conference join call - NEVER disconnect it
      const conferenceSetting = await storage.getSetting(`parallel_dialer_conference_${userId}`);
      if (conferenceSetting && conferenceSetting.value) {
        const conferenceData = conferenceSetting.value as any;
        if (conferenceData.agentCallSid === callSid) {
          console.warn(`⚠️ Attempted to disconnect conference join call ${callSid} - rejected`);
          return res.status(400).json({ 
            message: "Cannot disconnect the conference connection. Use 'Stop Dialing' to end the session." 
          });
        }
      }

      // Security: Verify the call belongs to this user before hanging up
      const allCalls = await storage.getAllCalls(userId);
      const call = allCalls.find(c => 
        c.metadata && 
        typeof c.metadata === 'object' && 
        'twilioCallSid' in c.metadata && 
        c.metadata.twilioCallSid === callSid
      );

      if (!call) {
        return res.status(403).json({ message: "Unauthorized: Call not found or does not belong to this user" });
      }

      const { client } = await userTwilioCache.getTwilioClient(userId);
      
      console.log(`📞 Disconnecting customer call ${callSid} for user ${userId}`);
      await client.calls(callSid).update({ status: 'completed' });

      // CALL QUEUE MANAGEMENT: If this was the primary call, promote a queued call
      try {
        const primaryCallSetting = await storage.getSetting(`parallel_dialer_primary_call_${userId}`);
        if (primaryCallSetting && primaryCallSetting.value) {
          const primaryData = primaryCallSetting.value as any;
          
          // Check if the ended call was the primary
          if (primaryData.callSid === callSid) {
            console.log(`🔄 Primary call ended - checking for queued calls`);
            
            // Clear primary call setting
            await storage.setSetting(`parallel_dialer_primary_call_${userId}`, null);
            
            // Look for queued secondary calls (line-0 through line-9)
            for (let i = 0; i < 10; i++) {
              const secondaryKey = `parallel_dialer_secondary_call_${userId}_line-${i}`;
              const secondarySetting = await storage.getSetting(secondaryKey);
              
              if (secondarySetting && secondarySetting.value) {
                const secondaryData = secondarySetting.value as any;
                
                if (secondaryData.onHold && secondaryData.callSid) {
                  console.log(`✅ Found queued call on line-${i} (${secondaryData.callSid}) - promoting to primary`);
                  
                  // Promote this call to primary
                  await storage.setSetting(`parallel_dialer_primary_call_${userId}`, {
                    lineId: `line-${i}`,
                    callSid: secondaryData.callSid,
                    timestamp: Date.now(),
                    inConference: false
                  });
                  
                  // Remove from secondary queue
                  await storage.setSetting(secondaryKey, null);
                  
                  // Redirect the call from hold to conference
                  const baseUrl = process.env.REPLIT_DOMAINS 
                    ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
                    : `https://${process.env.VITE_AUTH0_DOMAIN?.replace('auth.', 'app.') || 'fallowl.com'}`;
                  const webhookToken = generateWebhookToken(userId);
                  const conferenceSetting = await storage.getSetting(`parallel_dialer_conference_${userId}`);
                  
                  if (conferenceSetting && conferenceSetting.value) {
                    const conferenceData = conferenceSetting.value as any;
                    const redirectUrl = `${baseUrl}/api/dialer/queue/join-conference?token=${encodeURIComponent(webhookToken)}&conference=${encodeURIComponent(conferenceData.conferenceName)}&lineId=line-${i}`;
                    
                    // Redirect the held call to join conference
                    await client.calls(secondaryData.callSid).update({
                      url: redirectUrl,
                      method: 'POST'
                    });
                    
                    console.log(`🎯 Redirected queued call ${secondaryData.callSid} to conference`);
                    
                    // Broadcast update to frontend
                    wsService.broadcastToUser(userId, 'parallel_dialer_queue_promoted', {
                      lineId: `line-${i}`,
                      callSid: secondaryData.callSid,
                      name: secondaryData.name,
                      phone: secondaryData.phone
                    });
                  }
                  
                  break; // Only promote one call at a time
                }
              }
            }
          }
        }
      } catch (queueError: any) {
        console.error('Error managing call queue:', queueError);
        // Don't fail the hangup if queue management fails
      }

      res.json({ message: "Call ended successfully" });
    } catch (error: any) {
      console.error('Hangup error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Conference Management for Parallel Dialer
  app.post("/api/dialer/conference/start", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { client, credentials } = await userTwilioCache.getTwilioClient(userId);
      
      if (!credentials.phoneNumber) {
        return res.status(400).json({ message: "Twilio phone number not configured" });
      }

      const baseUrl = process.env.REPLIT_DOMAINS 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : `https://${req.get('host')}`;
      
      const webhookToken = generateWebhookToken(userId);
      const conferenceName = `parallel-dialer-${userId}-${Date.now()}`;
      
      const conferenceUrl = `${baseUrl}/api/dialer/conference/join-agent?token=${encodeURIComponent(webhookToken)}&conference=${encodeURIComponent(conferenceName)}`;
      
      const call = await client.calls.create({
        to: `client:${user.username}`,
        from: credentials.phoneNumber,
        url: conferenceUrl,
        method: 'POST',
        statusCallback: `${baseUrl}/api/twilio/status?token=${encodeURIComponent(webhookToken)}`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
      });

      // Store conference join call info for frontend identification
      await storage.setSetting(`parallel_dialer_conference_${userId}`, {
        conferenceName,
        agentCallSid: call.sid,
        startTime: Date.now(),
        status: 'active',
        isConferenceJoin: true  // Flag to identify this call
      });

      res.json({
        conferenceName,
        agentCallSid: call.sid,
        status: 'initiated',
        message: 'Conference session initiated. Please accept the incoming call to establish the media session.'
      });

    } catch (error: any) {
      console.error('Conference start error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/dialer/conference/status", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const setting = await storage.getSetting(`parallel_dialer_conference_${userId}`);
      
      if (!setting || !setting.value) {
        return res.json({ active: false, message: 'No active conference' });
      }

      const conferenceData = setting.value as any;
      res.json({
        active: conferenceData.status === 'active',
        conferenceName: conferenceData.conferenceName,
        agentCallSid: conferenceData.agentCallSid,
        startTime: conferenceData.startTime
      });

    } catch (error: any) {
      console.error('Conference status error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Check if a CallSid is a conference join call
  app.get("/api/dialer/conference/check-join/:callSid", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const { callSid } = req.params;
      
      const setting = await storage.getSetting(`parallel_dialer_conference_${userId}`);
      
      if (!setting || !setting.value) {
        return res.json({ isConferenceJoin: false });
      }

      const conferenceData = setting.value as any;
      const isConferenceJoin = conferenceData.agentCallSid === callSid && 
                               conferenceData.status === 'active' &&
                               conferenceData.isConferenceJoin === true;
      
      res.json({ isConferenceJoin });

    } catch (error: any) {
      console.error('Conference check error:', error);
      res.status(500).json({ isConferenceJoin: false });
    }
  });

  app.post("/api/dialer/conference/end", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const setting = await storage.getSetting(`parallel_dialer_conference_${userId}`);
      
      if (!setting || !setting.value) {
        return res.json({ message: 'No active conference to end' });
      }

      const conferenceData = setting.value as any;
      const { client } = await userTwilioCache.getTwilioClient(userId);
      
      try {
        await client.conferences(conferenceData.conferenceName).update({ status: 'completed' });
      } catch (error) {
        console.log('Conference already ended or not found');
      }

      if (conferenceData.agentCallSid) {
        try {
          await client.calls(conferenceData.agentCallSid).update({ status: 'completed' });
        } catch (error) {
          console.log('Agent call already ended');
        }
      }

      // Completely remove conference setting (don't just mark as ended)
      await storage.setSetting(`parallel_dialer_conference_${userId}`, null);
      console.log('✅ Removed conference setting');

      // Clear primary call setting (settings will be recreated on next session)
      await storage.setSetting(`parallel_dialer_primary_call_${userId}`, null);
      console.log('✅ Cleared primary call setting');
      
      // Clean up secondary call settings for all possible line IDs (line-0 through line-9)
      for (let i = 0; i < 10; i++) {
        await storage.setSetting(`parallel_dialer_secondary_call_${userId}_line-${i}`, null);
      }
      console.log('✅ Cleaned up all secondary call settings');

      res.json({ message: 'Conference ended successfully' });

    } catch (error: any) {
      console.error('Conference end error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/dialer/conference/join-agent", validateTwilioWebhook, async (req, res) => {
    try {
      const token = req.query.token as string;
      const conferenceName = req.query.conference as string;
      const CallSid = req.body.CallSid;
      
      console.log('🎯 Conference join-agent webhook called:', {
        conferenceName,
        CallSid,
        hasToken: !!token
      });
      
      if (!token || !conferenceName) {
        throw new Error('Missing token or conference name');
      }

      const userId = verifyWebhookToken(token);
      const user = await storage.getUser(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const { credentials } = await userTwilioCache.getTwilioClient(userId);
      
      // Use Twilio SDK's VoiceResponse for proper XML generation
      const VoiceResponse = twilio.twiml.VoiceResponse;
      const twimlResponse = new VoiceResponse();
      
      const baseUrl = process.env.REPLIT_DOMAINS 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : `https://${req.get('host')}`;
      
      const dial = twimlResponse.dial();
      dial.conference({
        startConferenceOnEnter: true,
        endConferenceOnExit: true,
        waitUrl: '',
        beep: 'false' as any,
        statusCallback: `${baseUrl}/api/twilio/conference-status?token=${encodeURIComponent(token)}`,
        statusCallbackEvent: ['start', 'join', 'leave', 'end'] as any
      }, conferenceName);

      console.log(`🎯 Agent joining conference: ${conferenceName} (CallSid: ${CallSid})`);
      console.log(`📋 TwiML Response:\n${twimlResponse.toString()}`);
      res.set('Content-Type', 'text/xml');
      res.send(twimlResponse.toString());

    } catch (error: any) {
      console.error('❌ Conference join agent error:', error);
      const VoiceResponse = twilio.twiml.VoiceResponse;
      const twimlResponse = new VoiceResponse();
      twimlResponse.say({ voice: 'alice' }, 'Error joining conference.');
      twimlResponse.hangup();
      res.set('Content-Type', 'text/xml');
      res.send(twimlResponse.toString());
    }
  });

  // Join queued call to conference (when promoted from hold)
  app.post("/api/dialer/queue/join-conference", validateTwilioWebhook, async (req, res) => {
    try {
      const token = req.query.token as string;
      const conferenceName = req.query.conference as string;
      const lineId = req.query.lineId as string;
      const CallSid = req.body.CallSid;
      
      console.log('🎯 Queue join-conference webhook called:', {
        conferenceName,
        CallSid,
        lineId,
        hasToken: !!token
      });
      
      if (!token || !conferenceName) {
        throw new Error('Missing token or conference name');
      }

      const userId = verifyWebhookToken(token);
      
      // Use Twilio SDK's VoiceResponse for proper XML generation
      const VoiceResponse = twilio.twiml.VoiceResponse;
      const twimlResponse = new VoiceResponse();
      
      const baseUrl = process.env.REPLIT_DOMAINS 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : `https://${req.get('host')}`;
      
      // Join the customer to the conference
      const dial = twimlResponse.dial();
      dial.conference({
        startConferenceOnEnter: false,  // Customer doesn't start conference
        endConferenceOnExit: false,     // Customer leaving doesn't end conference
        waitUrl: '',
        beep: 'false' as any,
        statusCallback: `${baseUrl}/api/twilio/conference-status?token=${encodeURIComponent(token)}`,
        statusCallbackEvent: ['join', 'leave'] as any
      }, conferenceName);

      console.log(`🎯 Queued customer joining conference: ${conferenceName} (CallSid: ${CallSid}, line: ${lineId})`);
      res.set('Content-Type', 'text/xml');
      res.send(twimlResponse.toString());

    } catch (error: any) {
      console.error('❌ Queue join conference error:', error);
      const VoiceResponse = twilio.twiml.VoiceResponse;
      const twimlResponse = new VoiceResponse();
      twimlResponse.say({ voice: 'alice' }, 'Error joining conference.');
      twimlResponse.hangup();
      res.set('Content-Type', 'text/xml');
      res.send(twimlResponse.toString());
    }
  });

  app.post("/api/twilio/conference-status", validateTwilioWebhook, async (req, res) => {
    try {
      const { ConferenceSid, FriendlyName, StatusCallbackEvent, CallSid, Timestamp, StartConferenceOnEnter } = req.body;
      
      console.log('📞 Conference status callback:', {
        ConferenceSid,
        FriendlyName,
        StatusCallbackEvent,
        CallSid,
        StartConferenceOnEnter,
        Timestamp,
        allData: req.body
      });

      const token = req.query.token as string;
      if (!token) {
        console.warn('⚠️ Conference status callback received without token');
        return res.sendStatus(200);
      }

      try {
        const userId = verifyWebhookToken(token);
        const setting = await storage.getSetting(`parallel_dialer_conference_${userId}`);
        
        if (!setting || !setting.value) {
          console.warn(`⚠️ No conference setting found for user ${userId}`);
          return res.sendStatus(200);
        }

        const conferenceData = setting.value as any;
        
        // Only process events for the correct conference
        if (conferenceData.conferenceName !== FriendlyName) {
          console.warn(`⚠️ Conference name mismatch: expected ${conferenceData.conferenceName}, got ${FriendlyName}`);
          return res.sendStatus(200);
        }

        // Handle different conference events
        switch (StatusCallbackEvent) {
          case 'participant-join':
          case 'conference-start':
            // CRITICAL: Only mark conference as started if THIS is the AGENT joining
            // Double validation: Check CallSid AND StartConferenceOnEnter flag
            // Agent has startConferenceOnEnter=true, customers have it=false
            // Note: Twilio sends 'True' (capitalized) so we need case-insensitive check
            const isAgent = conferenceData.agentCallSid === CallSid;
            const startConfValue = String(StartConferenceOnEnter).toLowerCase();
            const canStartConference = startConfValue === 'true';
            
            if (isAgent && canStartConference) {
              console.log(`✅ Conference ${FriendlyName} started - AGENT has joined (CallSid: ${CallSid}, verified by both CallSid match and StartConferenceOnEnter=${StartConferenceOnEnter})`);
              await storage.setSetting(`parallel_dialer_conference_${userId}`, {
                ...conferenceData,
                conferenceStarted: true,
                conferenceSid: ConferenceSid,
                startedAt: new Date().toISOString()
              });
              
              // Broadcast conference-ready to frontend to trigger dialing
              console.log(`📡 Broadcasting conference-ready to user ${userId}`);
              wsService.broadcastToUser(userId, 'conference-ready', {
                conferenceName: FriendlyName,
                conferenceSid: ConferenceSid,
                agentCallSid: CallSid
              });
            } else {
              console.log(`👤 Participant joined conference ${FriendlyName} (CallSid: ${CallSid}) - NOT the agent (isAgent: ${isAgent}, canStart: ${canStartConference}, StartConferenceOnEnter: ${StartConferenceOnEnter})`);
            }
            break;

          case 'participant-leave':
            console.log(`👋 Participant left conference ${FriendlyName}`);
            // Check if this is the agent leaving
            if (conferenceData.agentCallSid === CallSid) {
              console.log(`⚠️ Agent left conference ${FriendlyName} - marking as ended`);
              await storage.setSetting(`parallel_dialer_conference_${userId}`, {
                ...conferenceData,
                status: 'ended',
                conferenceStarted: false,
                endTime: Date.now()
              });
            }
            break;

          case 'conference-end':
            console.log(`🏁 Conference ${FriendlyName} has ended`);
            await storage.setSetting(`parallel_dialer_conference_${userId}`, {
              ...conferenceData,
              status: 'ended',
              conferenceStarted: false,
              endTime: Date.now()
            });
            break;

          default:
            console.log(`ℹ️ Unhandled conference event: ${StatusCallbackEvent}`);
        }
      } catch (err) {
        console.error('Error processing conference status:', err);
      }

      res.sendStatus(200);
    } catch (error: any) {
      console.error('Conference status callback error:', error);
      res.sendStatus(500);
    }
  });

  app.post("/api/twilio/twiml/dial-client", validateTwilioWebhook, async (req, res) => {
    try {
      console.log('=== TWIML DIAL CLIENT ENDPOINT ===');
      console.log('Request query:', req.query);
      console.log('Request body:', req.body);
      
      // Get parameters from both query and body
      const { client: queryClient, number: queryNumber, To, From } = { ...req.query, ...req.body };
      const targetNumber = queryNumber || To;
      
      // Security: Validate that a number is provided and is in E.164 format
      if (!targetNumber) {
        console.error('No target number provided in query or body');
        const VoiceResponse = twilio.twiml.VoiceResponse;
        const twimlResponse = new VoiceResponse();
        twimlResponse.say({ voice: 'alice' }, 'No number provided to dial.');
        twimlResponse.hangup();
        
        res.set('Content-Type', 'text/xml');
        return res.send(twimlResponse.toString());
      }
      
      // For WebRTC calls, generate TwiML to dial the external number
      console.log(`Generating TwiML to dial external number: ${targetNumber}`);
      const VoiceResponse = twilio.twiml.VoiceResponse;
      const twimlResponse = new VoiceResponse();
      const dial = twimlResponse.dial();
      dial.number(targetNumber);
      
      console.log('Generated TwiML:', twimlResponse.toString());
      
      res.set('Content-Type', 'text/xml');
      res.send(twimlResponse.toString());
    } catch (error: any) {
      console.error('TwiML dial client error:', error);
      
      // Return TwiML error response instead of JSON
      const VoiceResponse = twilio.twiml.VoiceResponse;
      const twimlResponse = new VoiceResponse();
      twimlResponse.say({ voice: 'alice' }, 'An error occurred while processing your call.');
      twimlResponse.hangup();
      
      res.set('Content-Type', 'text/xml');
      res.send(twimlResponse.toString());
    }
  });


  // Legacy webhook endpoint - redirects to main voice webhook
  app.post("/api/twilio/webhook/voice", validateTwilioWebhook, async (req, res) => {
    console.log('🔄 Legacy webhook called, redirecting to main voice webhook');
    try {
      const { From, To, CallSid, Direction, Caller } = req.body;
      
      // Determine call type
      const isOutbound = From && From.startsWith('client:');
      
      if (isOutbound) {
        const userId = From.replace('client:', '');
        const user = await storage.getUserByUsername(userId);
        if (!user) {
          throw new Error(`User not found: ${userId}`);
        }
        
        // Get user's Twilio credentials via cache (ensures proper isolation)
        const { credentials } = await userTwilioCache.getTwilioClient(user.id);
        const callerIdNumber = credentials.phoneNumber;
        
        const formattedTo = To.startsWith('+') ? To : `+${To}`;
        const baseUrl = process.env.REPLIT_DOMAINS 
          ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
          : `https://${req.get('host')}`;
        
        // Use Twilio SDK's VoiceResponse for proper XML generation
        const VoiceResponse = twilio.twiml.VoiceResponse;
        const twimlResponse = new VoiceResponse();
        const dial = twimlResponse.dial({
          callerId: callerIdNumber,
          timeout: 120
        });
        dial.number(formattedTo);
        
        res.set('Content-Type', 'text/xml');
        res.send(twimlResponse.toString());
      } else {
        // Incoming call
        const VoiceResponse = twilio.twiml.VoiceResponse;
        const twimlResponse = new VoiceResponse();
        twimlResponse.say({ voice: 'alice' }, 'This is a legacy webhook. Please update your configuration.');
        
        res.set('Content-Type', 'text/xml');
        res.send(twimlResponse.toString());
      }
    } catch (error: any) {
      console.error('Legacy webhook error:', error);
      const VoiceResponse = twilio.twiml.VoiceResponse;
      const twimlResponse = new VoiceResponse();
      twimlResponse.say({ voice: 'alice' }, 'There was an error processing your call.');
      
      res.set('Content-Type', 'text/xml');
      res.send(twimlResponse.toString());
    }
  });

  // Lead Management Routes
  
  // Lead Sources
  app.get("/api/lead-sources", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const sources = await storage.getAllLeadSources(userId);
      res.json(sources);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/lead-sources/active", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const sources = await storage.getActiveLeadSources(userId);
      res.json(sources);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/lead-sources", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const parsedData = insertLeadSourceSchema.parse(req.body);
      const source = await storage.createLeadSource(userId, parsedData);
      res.json(source);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/lead-sources/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      const parsedData = insertLeadSourceSchema.partial().parse(req.body);
      const source = await storage.updateLeadSource(userId, id, parsedData);
      res.json(source);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/lead-sources/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      await storage.deleteLeadSource(userId, id);
      res.json({ message: "Lead source deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Lead Statuses
  app.get("/api/lead-statuses", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const statuses = await storage.getAllLeadStatuses(userId);
      res.json(statuses);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/lead-statuses/active", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const statuses = await storage.getActiveLeadStatuses(userId);
      res.json(statuses);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/lead-statuses", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const parsedData = insertLeadStatusSchema.parse(req.body);
      const status = await storage.createLeadStatus(userId, parsedData);
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/lead-statuses/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      const parsedData = insertLeadStatusSchema.partial().parse(req.body);
      const status = await storage.updateLeadStatus(userId, id, parsedData);
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/lead-statuses/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      await storage.deleteLeadStatus(userId, id);
      res.json({ message: "Lead status deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Lead Campaigns
  app.get("/api/lead-campaigns", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const { status, type } = req.query;
      let campaigns;
      
      if (status) {
        campaigns = await storage.getLeadCampaignsByStatus(userId, status as string);
      } else if (type) {
        campaigns = await storage.getLeadCampaignsByType(userId, type as string);
      } else {
        campaigns = await storage.getAllLeadCampaigns(userId);
      }
      
      res.json(campaigns);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/lead-campaigns/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      const campaign = await storage.getLeadCampaign(userId, id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      res.json(campaign);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/lead-campaigns", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const parsedData = insertLeadCampaignSchema.parse(req.body);
      const campaign = await storage.createLeadCampaign(userId, parsedData);
      res.json(campaign);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/lead-campaigns/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      const parsedData = insertLeadCampaignSchema.partial().parse(req.body);
      const campaign = await storage.updateLeadCampaign(userId, id, parsedData);
      res.json(campaign);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/lead-campaigns/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      await storage.deleteLeadCampaign(userId, id);
      res.json({ message: "Lead campaign deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Leads
  app.get("/api/leads", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const { status, source, assignee, priority, temperature, search } = req.query;
      let leads;
      
      if (search) {
        leads = await storage.searchLeads(userId, search as string);
      } else if (status || source || assignee || priority || temperature) {
        const filters: any = {};
        if (status) filters.status = parseInt(status as string);
        if (source) filters.source = parseInt(source as string);
        if (assignee) filters.assignee = parseInt(assignee as string);
        if (priority) filters.priority = priority as string;
        if (temperature) filters.temperature = temperature as string;
        leads = await storage.getLeadsWithFilters(userId, filters);
      } else {
        leads = await storage.getAllLeads(userId);
      }
      
      res.json(leads);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/leads/stats", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const stats = await storage.getLeadStats(userId);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/leads/:id", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      const lead = await storage.getLead(userId, id);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }
      res.json(lead);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/leads", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const parsedData = insertLeadSchema.parse(req.body);
      const lead = await storage.createLead(userId, parsedData);
      res.json(lead);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/leads/:id", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      const parsedData = insertLeadSchema.partial().parse(req.body);
      const lead = await storage.updateLead(userId, id, parsedData);
      res.json(lead);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/leads/:id", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      await storage.deleteLead(userId, id);
      res.json({ message: "Lead deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Lead Activities
  app.get("/api/leads/:id/activities", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const leadId = parseInt(req.params.id);
      const { type } = req.query;
      
      let activities;
      if (type) {
        activities = await storage.getLeadActivitiesByType(userId, leadId, type as string);
      } else {
        activities = await storage.getLeadActivities(userId, leadId);
      }
      
      res.json(activities);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/lead-activities/recent", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const { limit } = req.query;
      const activities = await storage.getRecentLeadActivities(userId, limit ? parseInt(limit as string) : undefined);
      res.json(activities);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/lead-activities", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const parsedData = insertLeadActivitySchema.parse(req.body);
      const activity = await storage.createLeadActivity(userId, parsedData);
      res.json(activity);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/lead-activities/:id", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      const parsedData = insertLeadActivitySchema.partial().parse(req.body);
      const activity = await storage.updateLeadActivity(userId, id, parsedData);
      res.json(activity);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/lead-activities/:id", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      await storage.deleteLeadActivity(userId, id);
      res.json({ message: "Lead activity deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Lead Tasks
  app.get("/api/leads/:id/tasks", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const leadId = parseInt(req.params.id);
      const tasks = await storage.getLeadTasks(userId, leadId);
      res.json(tasks);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/lead-tasks/overdue", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const tasks = await storage.getOverdueTasks(userId);
      res.json(tasks);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/lead-tasks/upcoming", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const { days } = req.query;
      const tasks = await storage.getUpcomingTasks(userId, days ? parseInt(days as string) : undefined);
      res.json(tasks);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/lead-tasks", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const parsedData = insertLeadTaskSchema.parse(req.body);
      const task = await storage.createLeadTask(userId, parsedData);
      res.json(task);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/lead-tasks/:id", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      const parsedData = insertLeadTaskSchema.partial().parse(req.body);
      const task = await storage.updateLeadTask(userId, id, parsedData);
      res.json(task);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/lead-tasks/:id", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      await storage.deleteLeadTask(userId, id);
      res.json({ message: "Lead task deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Lead Scoring
  app.get("/api/leads/:id/scoring", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const leadId = parseInt(req.params.id);
      const scoring = await storage.getLeadScoringByLead(userId, leadId);
      res.json(scoring);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/leads/:id/scoring/history", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const leadId = parseInt(req.params.id);
      const history = await storage.getLeadScoringHistory(userId, leadId);
      res.json(history);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/lead-scoring", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const parsedData = insertLeadScoringSchema.parse(req.body);
      const scoring = await storage.createLeadScoring(userId, parsedData);
      res.json(scoring);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/lead-scoring/:id", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      const parsedData = insertLeadScoringSchema.partial().parse(req.body);
      const scoring = await storage.updateLeadScoring(userId, id, parsedData);
      res.json(scoring);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/lead-scoring/:id", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      await storage.deleteLeadScoring(userId, id);
      res.json({ message: "Lead scoring deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Lead Nurturing
  app.get("/api/leads/:id/nurturing", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const leadId = parseInt(req.params.id);
      const nurturing = await storage.getLeadNurturingByLead(userId, leadId);
      res.json(nurturing);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/lead-nurturing/active", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const sequences = await storage.getActiveNurturingSequences(userId);
      res.json(sequences);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/lead-nurturing", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const parsedData = insertLeadNurturingSchema.parse(req.body);
      const nurturing = await storage.createLeadNurturing(userId, parsedData);
      res.json(nurturing);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/lead-nurturing/:id", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      const parsedData = insertLeadNurturingSchema.partial().parse(req.body);
      const nurturing = await storage.updateLeadNurturing(userId, id, parsedData);
      res.json(nurturing);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/lead-nurturing/:id", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      await storage.deleteLeadNurturing(userId, id);
      res.json({ message: "Lead nurturing deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // CSV Import Routes
  app.post("/api/contacts/import/parse", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { csvContent } = req.body;
      
      if (!csvContent || typeof csvContent !== 'string') {
        return res.status(400).json({ message: "CSV content is required" });
      }

      const { fieldMappingService } = await import('./services/fieldMappingService');
      const { csvImportService } = await import('./services/csvImportService');
      
      // Parse CSV
      const { headers, data } = csvImportService.parseCsvContent(csvContent);
      
      // Get smart field mappings
      const fieldMappings = fieldMappingService.mapFields(headers);
      
      // Get available fields for manual mapping
      const availableFields = fieldMappingService.getAvailableFields();
      
      res.json({
        headers,
        data: data.slice(0, 5), // Return first 5 rows for preview
        totalRows: data.length,
        fieldMappings,
        availableFields
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/contacts/import/preview", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { csvContent, fieldMappings } = req.body;
      
      if (!csvContent || !fieldMappings) {
        return res.status(400).json({ message: "CSV content and field mappings are required" });
      }

      const { csvImportService } = await import('./services/csvImportService');
      
      // Parse CSV
      const { data } = csvImportService.parseCsvContent(csvContent);
      
      // Get preview
      const preview = csvImportService.getImportPreview(data, fieldMappings, 10);
      
      res.json(preview);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/contacts/import/execute", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { csvContent, fieldMappings, options } = req.body;
      
      if (!csvContent || !fieldMappings) {
        return res.status(400).json({ message: "CSV content and field mappings are required" });
      }

      const { csvImportService } = await import('./services/csvImportService');
      
      // Parse CSV
      const { data } = csvImportService.parseCsvContent(csvContent);
      
      // Execute import
      const result = await csvImportService.importContacts(userId, data, fieldMappings, options || {
        skipDuplicates: true,
        updateDuplicates: false,
        createList: false
      });
      
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Contact Lists
  app.get("/api/lists", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const { category, type } = req.query;
      let lists;

      if (category) {
        lists = await storage.getContactListsByCategory(userId, category as string);
      } else if (type) {
        lists = await storage.getContactListsByType(userId, type as string);
      } else {
        lists = await storage.getAllContactLists(userId);
      }

      res.json(lists);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/lists/:id", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      const list = await storage.getContactList(userId, id);
      if (!list) {
        return res.status(404).json({ message: "Contact list not found" });
      }
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/lists", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      // Set userId in the data before validation
      const listWithUserId = {
        ...req.body,
        userId
      };
      
      const listData = insertContactListSchema.parse(listWithUserId);
      const list = await storage.createContactList(userId, listData);
      res.json(list);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/lists/:id", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      const listData = insertContactListSchema.partial().parse(req.body);
      const list = await storage.updateContactList(userId, id, listData);
      res.json(list);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/lists/:id", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      await storage.deleteContactList(userId, id);
      res.json({ message: "Contact list deleted successfully" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Contact List Memberships
  app.get("/api/lists/:id/contacts", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const listId = parseInt(req.params.id);
      const contacts = await storage.getContactsInList(userId, listId);
      res.json(contacts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/lists/:id/memberships", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const listId = parseInt(req.params.id);
      const memberships = await storage.getContactListMemberships(userId, listId);
      res.json(memberships);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/lists/:id/contacts", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const listId = parseInt(req.params.id);
      const { contactId } = req.body;
      
      if (!contactId) {
        return res.status(400).json({ message: "Contact ID is required" });
      }

      const membership = await storage.addContactToList(userId, contactId, listId);
      res.json(membership);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/lists/:listId/contacts/:contactId", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const listId = parseInt(req.params.listId);
      const contactId = parseInt(req.params.contactId);
      
      await storage.removeContactFromList(userId, contactId, listId);
      res.json({ message: "Contact removed from list successfully" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/contacts/:id/lists", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const contactId = parseInt(req.params.id);
      const memberships = await storage.getContactMemberships(userId, contactId);
      res.json(memberships);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Parallel Dialer Verification and Monitoring Routes
  app.get("/api/parallel-dialer/verify/data-integrity", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      
      const { parallelDialerVerification } = await import('./services/parallelDialerVerification');
      const report = await parallelDialerVerification.verifyDataIntegrity(userId, startDate, endDate);
      res.json(report);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/parallel-dialer/verify/amd-performance", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      
      const { parallelDialerVerification } = await import('./services/parallelDialerVerification');
      const metrics = await parallelDialerVerification.analyzeAMDPerformance(userId, startDate, endDate);
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/parallel-dialer/verify/disposition-accuracy", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      
      const { parallelDialerVerification } = await import('./services/parallelDialerVerification');
      const report = await parallelDialerVerification.validateDispositionAccuracy(userId, startDate, endDate);
      res.json(report);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/parallel-dialer/verify/resource-leaks", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      const { parallelDialerVerification } = await import('./services/parallelDialerVerification');
      const leaks = await parallelDialerVerification.checkResourceLeaks(userId);
      res.json(leaks);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/parallel-dialer/verify/single-call-enforcement", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const timeWindow = req.query.timeWindow ? parseInt(req.query.timeWindow as string) : 300;
      
      const { parallelDialerVerification } = await import('./services/parallelDialerVerification');
      const report = await parallelDialerVerification.verifySingleCallEnforcement(userId, timeWindow);
      res.json(report);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/parallel-dialer/analytics/report", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      
      const { parallelDialerVerification } = await import('./services/parallelDialerVerification');
      const report = await parallelDialerVerification.generateAnalyticsReport(userId, startDate, endDate);
      res.json(report);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/parallel-dialer/cleanup/stale-calls", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      const { parallelDialerVerification } = await import('./services/parallelDialerVerification');
      const result = await parallelDialerVerification.cleanupStaleCalls(userId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== AI-Powered Features ====================

  // Check OpenAI configuration status
  app.get("/api/ai/config", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const config = openaiService.checkConfiguration();
      res.json(config);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Generate AI lead score for a contact
  app.post("/api/ai/contacts/:id/score", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const contactId = parseInt(req.params.id);

      // Check if OpenAI is configured
      const config = openaiService.checkConfiguration();
      if (!config.configured) {
        return res.status(503).json({ 
          message: "OpenAI API key not configured", 
          hint: "Add OPENAI_API_KEY environment variable to enable AI features" 
        });
      }

      // Get contact and call history
      const contact = await storage.getContact(userId, contactId);
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }

      const callHistory = await storage.getCallsByContact(userId, contactId);

      // Generate AI score
      const scoreData = await openaiService.scoreContact(contact, callHistory);
      
      // Save to database
      const leadScore = await storage.upsertAiLeadScore(userId, {
        contactId,
        overallScore: scoreData.overallScore,
        answerProbability: scoreData.answerProbability.toString(),
        conversionProbability: scoreData.conversionProbability.toString(),
        engagementScore: scoreData.engagementScore,
        scoringFactors: scoreData.scoringFactors,
        recommendations: scoreData.recommendations,
        confidence: scoreData.confidence.toString(),
        timezone: contact.timezone,
        bestCallTimes: [],
        callPatterns: {},
        responseRate: "0.00",
      });

      res.json({
        ...scoreData,
        id: leadScore.id,
        lastCalculated: leadScore.lastCalculated,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get AI lead score for a contact
  app.get("/api/ai/contacts/:id/score", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const contactId = parseInt(req.params.id);

      const score = await storage.getAiLeadScore(userId, contactId);
      if (!score) {
        return res.status(404).json({ message: "Lead score not found. Generate one first." });
      }

      res.json(score);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Predict best call times for a contact
  app.post("/api/ai/contacts/:id/timing", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const contactId = parseInt(req.params.id);

      const config = openaiService.checkConfiguration();
      if (!config.configured) {
        return res.status(503).json({ 
          message: "OpenAI API key not configured", 
          hint: "Add OPENAI_API_KEY environment variable to enable AI features" 
        });
      }

      const contact = await storage.getContact(userId, contactId);
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }

      const callHistory = await storage.getCallsByContact(userId, contactId);
      const timingData = await openaiService.predictBestCallTimes(contact, callHistory);

      // Update or create lead score with timing data
      await storage.upsertAiLeadScore(userId, {
        contactId,
        bestCallTimes: timingData.bestCallTimes,
        timezone: timingData.timezone,
        callPatterns: timingData.callPatterns,
        overallScore: 0,
        answerProbability: "0.00",
        conversionProbability: "0.00",
        engagementScore: 0,
        scoringFactors: {},
        recommendations: [],
        confidence: "0.00",
        responseRate: "0.00",
      });

      res.json(timingData);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Generate personalized opening script for a contact
  app.post("/api/ai/contacts/:id/script", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const contactId = parseInt(req.params.id);

      const config = openaiService.checkConfiguration();
      if (!config.configured) {
        return res.status(503).json({ 
          message: "OpenAI API key not configured", 
          hint: "Add OPENAI_API_KEY environment variable to enable AI features" 
        });
      }

      const contact = await storage.getContact(userId, contactId);
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }

      const callHistory = await storage.getCallsByContact(userId, contactId);
      const scriptData = await openaiService.generateOpeningScript(contact, callHistory);

      res.json(scriptData);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Analyze call transcript and generate intelligence
  app.post("/api/ai/calls/:id/analyze", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const callId = parseInt(req.params.id);

      const config = openaiService.checkConfiguration();
      if (!config.configured) {
        return res.status(503).json({ 
          message: "OpenAI API key not configured", 
          hint: "Add OPENAI_API_KEY environment variable to enable AI features" 
        });
      }

      const call = await storage.getCall(userId, callId);
      if (!call) {
        return res.status(404).json({ message: "Call not found" });
      }

      const { transcript } = req.body;
      if (!transcript) {
        return res.status(400).json({ message: "Transcript is required" });
      }

      const contact = call.contactId ? await storage.getContact(userId, call.contactId) : null;
      const contactName = contact?.name || "Unknown";

      const analysis = await openaiService.analyzeCallTranscript(transcript, contactName);

      // Save call intelligence
      const intelligence = await storage.createCallIntelligence(userId, {
        callId,
        contactId: call.contactId || null,
        transcript,
        transcriptStatus: "completed",
        summary: analysis.summary,
        sentiment: analysis.sentiment,
        sentimentScore: analysis.sentimentScore.toString(),
        actionItems: analysis.actionItems,
        keywords: analysis.keywords,
        topics: analysis.topics,
        objections: analysis.objections,
        recommendedDisposition: analysis.recommendedDisposition,
        suggestedFollowUp: analysis.suggestedFollowUp,
        nextBestAction: analysis.nextBestAction,
        coachingTips: analysis.coachingTips,
        strengths: analysis.strengths,
        improvements: analysis.improvements,
        confidence: analysis.confidence.toString(),
      });

      res.json({ ...analysis, id: intelligence.id });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get call intelligence for a specific call
  app.get("/api/ai/calls/:id/intelligence", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const callId = parseInt(req.params.id);

      const intelligence = await storage.getCallIntelligence(userId, callId);
      if (!intelligence) {
        return res.status(404).json({ message: "Call intelligence not found. Analyze the call first." });
      }

      res.json(intelligence);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Analyze campaign performance
  app.post("/api/ai/campaigns/:id/analyze", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const campaignId = parseInt(req.params.id);

      const config = openaiService.checkConfiguration();
      if (!config.configured) {
        return res.status(503).json({ 
          message: "OpenAI API key not configured", 
          hint: "Add OPENAI_API_KEY environment variable to enable AI features" 
        });
      }

      // Get campaign stats (you'll need to implement this)
      const campaignStats = {
        name: `Campaign ${campaignId}`,
        totalCalls: 100,
        answeredCalls: 65,
        conversions: 12,
        avgCallDuration: 180,
        commonDispositions: [
          { disposition: "interested", count: 15 },
          { disposition: "callback-requested", count: 10 },
          { disposition: "not-interested", count: 20 },
        ]
      };

      const analysis = await openaiService.analyzeCampaignPerformance(campaignStats);

      // Save as AI insight
      await storage.createAiInsight(userId, {
        type: "campaign_optimization",
        category: "performance",
        priority: "high",
        title: `Campaign ${campaignId} Performance Analysis`,
        description: analysis.insights.join(". "),
        recommendation: analysis.recommendations.join(". "),
        impact: "AI-powered campaign optimization",
        data: { estimatedImprovements: analysis.estimatedImprovements },
        evidence: analysis.priorityActions,
        campaignId,
        confidence: "0.80",
        potentialImpact: "high",
      });

      res.json(analysis);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get all AI insights for a user
  app.get("/api/ai/insights", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const status = req.query.status as string || 'active';
      const type = req.query.type as string;

      const insights = await storage.getAiInsights(userId, { status, type });
      res.json(insights);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Update AI insight status
  app.patch("/api/ai/insights/:id", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const insightId = parseInt(req.params.id);
      const { status } = req.body;

      const insight = await storage.updateAiInsight(userId, insightId, { status });
      res.json(insight);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get top scored contacts for parallel dialer
  app.get("/api/ai/contacts/top-scored", checkJwt, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const limit = parseInt(req.query.limit as string) || 50;

      const topContacts = await storage.getTopScoredContacts(userId, limit);
      res.json(topContacts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  const httpServer = createServer(app);
  
  wsService.initialize(httpServer);
  
  return httpServer;
}

export { wsService };
