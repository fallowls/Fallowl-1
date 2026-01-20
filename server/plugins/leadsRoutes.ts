import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { rateLimitConfigs } from './rateLimiters';

/**
 * Leads Management Routes
 * Handles CRUD operations for leads and lead-related data
 */
export default async function leadsRoutes(fastify: FastifyInstance) {
  // GET /leads - Get all leads
  fastify.get('/leads', {
    config: { rateLimit: rateLimitConfigs.api },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = (request as any).user;
    const user = await (fastify as any).storage.getUserByAuth0Id(auth.sub);
    
    if (!user) {
      return reply.code(404).send({ message: "User not found" });
    }

    const tenantId = (request as any).tenantId;
    if (!tenantId) {
      return reply.code(401).send({ message: "Tenant context missing" });
    }

    try {
      const leads = await (fastify as any).storage.getAllLeads(tenantId, user.id);
      return reply.send(leads || []);
    } catch (error: any) {
      console.error('Error fetching leads:', error);
      return reply.send([]);
    }
  });

  // GET /leads/stats - Get lead statistics
  fastify.get('/leads/stats', {
    config: { rateLimit: rateLimitConfigs.api },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = (request as any).user;
    const user = await (fastify as any).storage.getUserByAuth0Id(auth.sub);
    
    if (!user) {
      return reply.code(404).send({ message: "User not found" });
    }

    const tenantId = (request as any).tenantId;
    if (!tenantId) {
      return reply.code(401).send({ message: "Tenant context missing" });
    }

    const stats = await (fastify as any).storage.getLeadStats(tenantId, user.id);
    return reply.send(stats);
  });

  // GET /lead-sources/active - Get active lead sources
  fastify.get('/lead-sources/active', {
    config: { rateLimit: rateLimitConfigs.api },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = (request as any).user;
    const user = await (fastify as any).storage.getUserByAuth0Id(auth.sub);
    
    if (!user) {
      return reply.code(404).send({ message: "User not found" });
    }

    const sources = await (fastify as any).storage.getActiveLeadSources(user.id);
    return reply.send(sources || []);
  });

  // GET /lead-statuses/active - Get active lead statuses
  fastify.get('/lead-statuses/active', {
    config: { rateLimit: rateLimitConfigs.api },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = (request as any).user;
    const user = await (fastify as any).storage.getUserByAuth0Id(auth.sub);
    
    if (!user) {
      return reply.code(404).send({ message: "User not found" });
    }

    const statuses = await (fastify as any).storage.getActiveLeadStatuses(user.id);
    return reply.send(statuses || []);
  });

  // POST /leads - Create a new lead
  fastify.post('/leads', {
    config: { rateLimit: rateLimitConfigs.api },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = (request as any).user;
    const user = await (fastify as any).storage.getUserByAuth0Id(auth.sub);
    
    if (!user) {
      return reply.code(404).send({ message: "User not found" });
    }

    const tenantId = (request as any).tenantId;
    if (!tenantId) {
      return reply.code(401).send({ message: "Tenant context missing" });
    }

    const lead = await (fastify as any).storage.createLead(tenantId, user.id, request.body);
    return reply.code(201).send(lead);
  });

  // PUT /leads/:id - Update a lead
  fastify.put('/leads/:id', {
    config: { rateLimit: rateLimitConfigs.api },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = (request as any).user;
    const user = await (fastify as any).storage.getUserByAuth0Id(auth.sub);
    
    if (!user) {
      return reply.code(404).send({ message: "User not found" });
    }

    const tenantId = (request as any).tenantId;
    if (!tenantId) {
      return reply.code(401).send({ message: "Tenant context missing" });
    }

    const { id } = request.params as any;
    const lead = await (fastify as any).storage.updateLead(tenantId, user.id, parseInt(id), request.body);
    return reply.send(lead);
  });

  // DELETE /leads/:id - Delete a lead
  fastify.delete('/leads/:id', {
    config: { rateLimit: rateLimitConfigs.api },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = (request as any).user;
    const user = await (fastify as any).storage.getUserByAuth0Id(auth.sub);
    
    if (!user) {
      return reply.code(404).send({ message: "User not found" });
    }

    const tenantId = (request as any).tenantId;
    if (!tenantId) {
      return reply.code(401).send({ message: "Tenant context missing" });
    }

    const { id } = request.params as any;
    await (fastify as any).storage.deleteLead(tenantId, user.id, parseInt(id));
    return reply.send({ message: "Lead deleted successfully" });
  });

  // GET /leads/:id/activities - Get lead activities
  fastify.get('/leads/:id/activities', {
    config: { rateLimit: rateLimitConfigs.api },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send([]);
  });

  // GET /leads/:id/tasks - Get lead tasks
  fastify.get('/leads/:id/tasks', {
    config: { rateLimit: rateLimitConfigs.api },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send([]);
  });
}
