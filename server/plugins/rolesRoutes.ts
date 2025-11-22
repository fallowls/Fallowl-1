import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { storage } from '../storage';
import { insertRoleSchema } from '@shared/schema';
import { rateLimitConfigs } from './rateLimiters';

/**
 * Roles Management Routes Plugin for Fastify
 * Migrated from Express routes
 */
export default async function rolesRoutes(fastify: FastifyInstance) {
  // GET /roles - Get all roles
  fastify.get('/roles', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const roles = await storage.getAllRoles();
      return reply.send(roles);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // POST /roles - Create new role
  fastify.post('/roles', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const roleData = insertRoleSchema.parse(request.body);
      const role = await storage.createRole(roleData);
      return reply.send(role);
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // PUT /roles/:id - Update role
  fastify.put('/roles/:id', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const roleId = parseInt(id);
      const roleData = insertRoleSchema.partial().parse(request.body);
      const role = await storage.updateRole(roleId, roleData);
      return reply.send(role);
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // DELETE /roles/:id - Delete role
  fastify.delete('/roles/:id', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const roleId = parseInt(id);
      await storage.deleteRole(roleId);
      return reply.send({ message: "Role deleted successfully" });
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });
}
