import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { storage } from '../storage';
import { sanitizeUser, sanitizeUsers } from '../dataSanitization';
import { insertUserSchema } from '@shared/schema';
import { rateLimitConfigs } from './rateLimiters';

/**
 * Users Management Routes Plugin for Fastify
 * Migrated from Express routes
 */
export default async function usersRoutes(fastify: FastifyInstance) {
  // GET /users - Get all users
  fastify.get('/users', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const users = await storage.getAllUsers();
      return reply.send(sanitizeUsers(users));
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // POST /users - Create new user
  fastify.post('/users', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userData = insertUserSchema.parse(request.body);
      const user = await storage.createUser(userData);
      return reply.send(sanitizeUser(user));
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // PUT /users/:id - Update user
  fastify.put('/users/:id', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const userId = parseInt(id);
      const userData = insertUserSchema.partial().parse(request.body);
      const user = await storage.updateUser(userId, userData);
      return reply.send(sanitizeUser(user));
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // DELETE /users/:id - Delete user
  fastify.delete('/users/:id', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const userId = parseInt(id);
      await storage.deleteUser(userId);
      return reply.send({ message: "User deleted successfully" });
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // GET /users/search - Search users
  fastify.get('/users/search', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { q } = request.query as { q?: string };
      if (!q) {
        return reply.code(400).send({ message: "Search query is required" });
      }
      const users = await storage.searchUsers(q);
      return reply.send(sanitizeUsers(users));
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // POST /users/bulk-update - Bulk update users
  fastify.post('/users/bulk-update', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userIds, updates } = request.body as { userIds?: number[]; updates?: any };
      if (!userIds || !Array.isArray(userIds)) {
        return reply.code(400).send({ message: "User IDs array is required" });
      }
      const validatedUpdates = insertUserSchema.partial().parse(updates);
      const updatedUsers = await storage.bulkUpdateUsers(userIds, validatedUpdates);
      return reply.send({ 
        message: `${updatedUsers.length} users updated successfully`,
        users: sanitizeUsers(updatedUsers) 
      });
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // GET /users/:id/activity - Get user activity
  fastify.get('/users/:id/activity', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const userId = parseInt(id);
      const { limit } = request.query as { limit?: string };
      const limitNum = limit ? parseInt(limit) : 50;
      const activity = await storage.getUserActivity(userId, limitNum);
      return reply.send(activity);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /users/:id/login-history - Get user login history
  fastify.get('/users/:id/login-history', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const userId = parseInt(id);
      const { limit } = request.query as { limit?: string };
      const limitNum = limit ? parseInt(limit) : 50;
      const loginHistory = await storage.getLoginHistory(userId, limitNum);
      return reply.send(loginHistory);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /users/:id/invoices - Get user invoices
  fastify.get('/users/:id/invoices', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const userId = parseInt(id);
      const invoices = await storage.getInvoicesByUser(userId);
      return reply.send(invoices);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });
}
