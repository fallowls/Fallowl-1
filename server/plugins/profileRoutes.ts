import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { storage } from '../storage';
import { rateLimitConfigs } from './rateLimiters';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { getUserIdFromRequest } from '../authHelper';

/**
 * Profile Management Routes Plugin for Fastify
 * Migrated from Express routes
 */
export default async function profileRoutes(fastify: FastifyInstance) {
  // GET /profile - Get current user profile
  fastify.get('/profile', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request, reply) => {
      if (!(request as any).session?.userId) {
        return reply.code(401).send({ message: "Not authenticated" });
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).session.userId;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return reply.code(404).send({ message: "User not found" });
      }

      return reply.send({
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
      return reply.code(500).send({ message: error.message });
    }
  });

  // PUT /profile - Update user profile
  fastify.put('/profile', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      
      const profileUpdateSchema = z.object({
        firstName: z.string().max(100).optional(),
        lastName: z.string().max(100).optional(),
        phone: z.string().max(20).optional(),
        avatar: z.string().url().max(500).optional().or(z.literal(''))
      }).strict();

      const validatedData = profileUpdateSchema.parse(request.body);

      if (Object.keys(validatedData).length === 0) {
        return reply.code(400).send({ message: "No valid fields to update" });
      }

      const user = await storage.updateUser(userId, validatedData);
      
      return reply.send({
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
        return reply.code(400).send({ message: "Invalid input data", errors: error.errors });
      }
      return reply.code(500).send({ message: "Failed to update profile" });
    }
  });

  // PUT /profile/password - Update user password
  fastify.put('/profile/password', {
    config: {
      rateLimit: rateLimitConfigs.strict
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      
      const passwordUpdateSchema = z.object({
        currentPassword: z.string().min(1, "Current password is required"),
        newPassword: z.string().min(8, "New password must be at least 8 characters long")
      }).strict();

      const { currentPassword, newPassword } = passwordUpdateSchema.parse(request.body);

      const user = await storage.getUser(userId);
      if (!user) {
        return reply.code(404).send({ message: "User not found" });
      }

      if (user.auth0Id && !user.password) {
        return reply.code(400).send({ 
          message: "Password changes are managed through Auth0. Please use the 'Forgot Password' link on the login page." 
        });
      }

      const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isPasswordValid) {
        return reply.code(401).send({ message: "Current password is incorrect" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(userId, { password: hashedPassword });

      return reply.send({ message: "Password updated successfully" });
    } catch (error: any) {
      console.error('Error updating password:', error);
      if (error.name === 'ZodError') {
        return reply.code(400).send({ message: error.errors[0]?.message || "Invalid input data" });
      }
      return reply.code(500).send({ message: "Failed to update password" });
    }
  });

  // PUT /profile/notifications - Update notification preferences
  fastify.put('/profile/notifications', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      
      const notificationSettingsSchema = z.object({
        emailNotifications: z.boolean().optional(),
        smsNotifications: z.boolean().optional(),
        callNotifications: z.boolean().optional(),
        voicemailNotifications: z.boolean().optional(),
        marketingEmails: z.boolean().optional(),
        weeklyReports: z.boolean().optional()
      }).strict();

      const notificationSettings = notificationSettingsSchema.parse(request.body);

      const user = await storage.getUser(userId);
      if (!user) {
        return reply.code(404).send({ message: "User not found" });
      }

      const currentCustomFields = (user.customFields as any) || {};
      const updatedCustomFields = {
        ...currentCustomFields,
        notificationSettings
      };

      await storage.updateUser(userId, {
        customFields: updatedCustomFields
      });

      return reply.send({ 
        message: "Notification preferences updated successfully",
        settings: notificationSettings
      });
    } catch (error: any) {
      console.error('Error updating notifications:', error);
      if (error.name === 'ZodError') {
        return reply.code(400).send({ message: "Invalid notification settings", errors: error.errors });
      }
      return reply.code(500).send({ message: "Failed to update notification preferences" });
    }
  });

  // POST /profile/avatar - Update user avatar
  fastify.post('/profile/avatar', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const { avatar } = request.body as { avatar?: string };

      if (!avatar) {
        return reply.code(400).send({ message: "Avatar URL is required" });
      }

      const user = await storage.updateUser(userId, { avatar });

      return reply.send({
        message: "Avatar updated successfully",
        avatar: user.avatar
      });
    } catch (error: any) {
      console.error('Error updating avatar:', error);
      return reply.code(500).send({ message: error.message });
    }
  });
}
