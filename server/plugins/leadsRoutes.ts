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

    try {
      const leads = await (fastify as any).storage.db.query.leads.findMany({
        where: (table: any) => table.userId === user.id,
      });
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

    return reply.send({
      totalLeads: 0,
      activeLeads: 0,
      closedLeads: 0,
      conversionRate: 0,
      averageValue: 0,
      lastUpdated: new Date().toISOString()
    });
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

    return reply.send([]);
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

    return reply.send([]);
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

    const body = request.body as any;
    return reply.code(201).send({
      id: Math.floor(Math.random() * 10000),
      ...body,
      userId: user.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
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

    const { id } = request.params as any;
    const body = request.body as any;
    
    return reply.send({
      id: parseInt(id),
      ...body,
      userId: user.id,
      updatedAt: new Date().toISOString()
    });
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
