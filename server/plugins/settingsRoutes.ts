import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { storage } from '../storage';
import { rateLimitConfigs } from './rateLimiters';

/**
 * Settings Management Routes Plugin for Fastify
 * Migrated from Express routes
 */

export default async function settingsRoutes(fastify: FastifyInstance) {
  const checkSuperAdmin = async (request: FastifyRequest): Promise<boolean> => {
    const auth = (request as any).user;
    if (!auth?.sub) return false;
    
    const user = await (fastify as any).storage.getUserByAuth0Id(auth.sub);
    return user?.role === 'super_admin' || user?.role === 'admin';
  };

  // GET /settings - Get all user-specific settings
  fastify.get('/settings', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.userId;
      if (!userId) {
        return reply.code(401).send({ message: "User ID not found" });
      }
      const settings = await storage.getAllSettings();
      const userSettings = settings.filter(s => s.key.includes(`_user_${userId}`));
      return reply.send(userSettings);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /settings/:key - Get setting by key
  fastify.get('/settings/:key', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.userId;
      if (!userId) {
        return reply.code(401).send({ message: "User ID not found" });
      }
      const { key } = request.params as { key: string };
      
      // First try user-specific setting
      const userSpecificKey = `${key}_user_${userId}`;
      let setting = await storage.getSetting(userSpecificKey);
      
      // If not found, try global setting (for keys like 'system', 'parallel_dialer_greeting', etc)
      if (!setting) {
        setting = await storage.getSetting(key);
      }
      
      if (!setting) {
        return reply.code(404).send({ message: "Setting not found" });
      }
      return reply.send(setting);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // POST /settings - Create or update setting
  fastify.post('/settings', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.userId;
      if (!userId) {
        return reply.code(401).send({ message: "User ID not found" });
      }
      const { key, value, global } = request.body as { key?: string; value?: any; global?: boolean };
      if (!key || value === undefined) {
        return reply.code(400).send({ message: "Key and value are required" });
      }
      
      // Support global settings (like parallel_dialer_greeting) if global=true
      const settingKey = global ? key : `${key}_user_${userId}`;
      const setting = await storage.setSetting(settingKey, value);
      
      return reply.send(setting);
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // SUPER ADMIN: GET /admin/users - Get all users (super admin only)
  fastify.get('/admin/users', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const isSuperAdmin = await checkSuperAdmin(request);
      if (!isSuperAdmin) {
        return reply.code(403).send({ message: "Super admin access required" });
      }

      const users = await storage.getAllUsers();
      const sanitized = users.map((u: any) => ({
        id: u.id,
        email: u.email,
        username: u.username,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        twilioConfigured: u.twilioConfigured,
        twilioPhoneNumber: u.twilioPhoneNumber
      }));
      return reply.send(sanitized);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // SUPER ADMIN: POST /admin/users/:userId/twilio-credentials - Update any user's Twilio credentials
  fastify.post('/admin/users/:userId/twilio-credentials', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const isSuperAdmin = await checkSuperAdmin(request);
      if (!isSuperAdmin) {
        return reply.code(403).send({ message: "Super admin access required" });
      }

      const { userId } = request.params as { userId: string };
      const targetUserId = parseInt(userId);
      
      if (isNaN(targetUserId)) {
        return reply.code(400).send({ message: "Invalid user ID" });
      }

      const { accountSid, authToken, apiKeySid, apiKeySecret, phoneNumber } = request.body as any;
      
      if (!accountSid || !authToken || !phoneNumber) {
        return reply.code(400).send({ message: "accountSid, authToken, and phoneNumber are required" });
      }

      // Update the user's Twilio credentials
      const user = await storage.updateUser(targetUserId, {
        twilioAccountSid: accountSid,
        twilioAuthToken: authToken,
        twilioApiKeySid: apiKeySid || null,
        twilioApiKeySecret: apiKeySecret || null,
        twilioPhoneNumber: phoneNumber,
        twilioConfigured: true
      });

      return reply.send({
        id: user.id,
        email: user.email,
        username: user.username,
        twilioConfigured: user.twilioConfigured,
        twilioPhoneNumber: user.twilioPhoneNumber,
        message: "Twilio credentials updated successfully"
      });
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // SUPER ADMIN: PUT /admin/users/:userId/status - Update user status
  fastify.put('/admin/users/:userId/status', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const isSuperAdmin = await checkSuperAdmin(request);
      if (!isSuperAdmin) {
        return reply.code(403).send({ message: "Super admin access required" });
      }

      const { userId } = request.params as { userId: string };
      const targetUserId = parseInt(userId);
      const { status } = request.body as { status: string };

      if (isNaN(targetUserId) || !status) {
        return reply.code(400).send({ message: "Invalid user ID or status" });
      }

      const user = await storage.updateUser(targetUserId, { status });
      return reply.send({
        id: user.id,
        email: user.email,
        username: user.username,
        status: user.status,
        message: `User status updated to ${status}`
      });
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // SUPER ADMIN: PUT /admin/users/:userId/role - Update user role
  fastify.put('/admin/users/:userId/role', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const isSuperAdmin = await checkSuperAdmin(request);
      if (!isSuperAdmin) {
        return reply.code(403).send({ message: "Super admin access required" });
      }

      const { userId } = request.params as { userId: string };
      const targetUserId = parseInt(userId);
      const { role } = request.body as { role: string };

      if (isNaN(targetUserId) || !role) {
        return reply.code(400).send({ message: "Invalid user ID or role" });
      }

      const user = await storage.updateUser(targetUserId, { role });
      return reply.send({
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        message: `User role updated to ${role}`
      });
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // SUPER ADMIN: GET /admin/users/:userId/activity - Get user activity stats
  fastify.get('/admin/users/:userId/activity', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const isSuperAdmin = await checkSuperAdmin(request);
      if (!isSuperAdmin) {
        return reply.code(403).send({ message: "Super admin access required" });
      }

      const { userId } = request.params as { userId: string };
      const targetUserId = parseInt(userId);

      if (isNaN(targetUserId)) {
        return reply.code(400).send({ message: "Invalid user ID" });
      }

      const user = await storage.getUser(targetUserId);
      if (!user) {
        return reply.code(404).send({ message: "User not found" });
      }

      return reply.send({
        userId: user.id,
        lastLogin: user.lastLogin,
        lastLoginIp: user.lastLoginIp,
        lastLoginDevice: user.lastLoginDevice,
        createdAt: user.createdAt,
        accountType: user.accountType,
        subscriptionPlan: user.subscriptionPlan,
        subscriptionStatus: user.subscriptionStatus,
        usageStats: user.usageStats,
        twoFactorEnabled: user.twoFactorEnabled
      });
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // SUPER ADMIN: DELETE /admin/users/:userId - Delete a user
  fastify.delete('/admin/users/:userId', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const isSuperAdmin = await checkSuperAdmin(request);
      if (!isSuperAdmin) {
        return reply.code(403).send({ message: "Super admin access required" });
      }

      const { userId } = request.params as { userId: string };
      const targetUserId = parseInt(userId);

      if (isNaN(targetUserId)) {
        return reply.code(400).send({ message: "Invalid user ID" });
      }

      await storage.deleteUser(targetUserId);
      return reply.send({ message: "User deleted successfully" });
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });
}
