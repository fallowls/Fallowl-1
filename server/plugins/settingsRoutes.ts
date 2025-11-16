import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { storage } from '../storage';
import { rateLimitConfigs } from './rateLimiters';

/**
 * Settings Management Routes Plugin for Fastify
 * Migrated from Express routes
 */
export default async function settingsRoutes(fastify: FastifyInstance) {
  // GET /settings - Get all user-specific settings
  fastify.get('/settings', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
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
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
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
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
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
}
