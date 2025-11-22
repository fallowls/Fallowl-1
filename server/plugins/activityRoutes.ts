import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { storage } from '../storage';
import { insertLoginHistorySchema, insertUserActivitySchema } from '@shared/schema';
import { rateLimitConfigs } from './rateLimiters';

/**
 * Activity Tracking Routes Plugin for Fastify (Login History & User Activity)
 * Migrated from Express routes
 */
export default async function activityRoutes(fastify: FastifyInstance) {
  // POST /login-history - Create login history entry
  fastify.post('/login-history', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const entryData = insertLoginHistorySchema.parse(request.body);
      const entry = await storage.createLoginHistoryEntry(entryData);
      return reply.send(entry);
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // POST /user-activity - Create user activity entry
  fastify.post('/user-activity', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const activityData = insertUserActivitySchema.parse(request.body);
      const activity = await storage.createUserActivityEntry(activityData);
      return reply.send(activity);
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });
}
