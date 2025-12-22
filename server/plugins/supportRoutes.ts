import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { rateLimitConfigs } from './rateLimiters';

/**
 * Support Routes - Handle support tickets and knowledge base
 */
export default async function supportRoutes(fastify: FastifyInstance) {
  // GET /support/tickets - Get all support tickets
  fastify.get('/support/tickets', {
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

  // POST /support/tickets - Create a new support ticket
  fastify.post('/support/tickets', {
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
      status: 'open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  });

  // GET /support/tickets/:id - Get a specific support ticket
  fastify.get('/support/tickets/:id', {
    config: { rateLimit: rateLimitConfigs.api },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      id: (request.params as any).id,
      status: 'open',
      createdAt: new Date().toISOString()
    });
  });

  // PUT /support/tickets/:id - Update a support ticket
  fastify.put('/support/tickets/:id', {
    config: { rateLimit: rateLimitConfigs.api },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as any;
    const body = request.body as any;
    
    return reply.send({
      id,
      ...body,
      updatedAt: new Date().toISOString()
    });
  });
}
