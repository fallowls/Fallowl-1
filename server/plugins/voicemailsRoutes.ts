import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { storage } from '../storage';
import { insertVoicemailSchema } from '@shared/schema';
import { rateLimitConfigs } from './rateLimiters';

/**
 * Voicemails Management Routes Plugin for Fastify
 * Migrated from Express routes
 */
export default async function voicemailsRoutes(fastify: FastifyInstance) {
  // GET /voicemails - Get all voicemails for authenticated user
  fastify.get('/voicemails', {
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
      const voicemails = await storage.getAllVoicemails(userId);
      return reply.send(voicemails);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /voicemails/unread - Get unread voicemails for authenticated user
  fastify.get('/voicemails/unread', {
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
      const voicemails = await storage.getUnreadVoicemails(userId);
      return reply.send(voicemails);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // POST /voicemails - Create new voicemail
  fastify.post('/voicemails', {
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
      const voicemailData = insertVoicemailSchema.parse(request.body);
      const voicemail = await storage.createVoicemail(userId, voicemailData);
      return reply.send(voicemail);
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // PUT /voicemails/:id - Update voicemail
  fastify.put('/voicemails/:id', {
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
      const { id } = request.params as { id: string };
      const voicemailId = parseInt(id);
      const voicemailData = insertVoicemailSchema.partial().parse(request.body);
      const voicemail = await storage.updateVoicemail(userId, voicemailId, voicemailData);
      return reply.send(voicemail);
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // DELETE /voicemails/:id - Delete voicemail
  fastify.delete('/voicemails/:id', {
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
      const { id } = request.params as { id: string };
      const voicemailId = parseInt(id);
      await storage.deleteVoicemail(userId, voicemailId);
      return reply.send({ message: "Voicemail deleted successfully" });
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });
}
