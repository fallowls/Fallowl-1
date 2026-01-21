import { FastifyInstance } from 'fastify';
import { registerUser, loginUser } from './auth.controller';
import { rateLimitConfigs } from '../plugins/rateLimiters';

export default async function (fastify: FastifyInstance) {
  fastify.post('/register', { config: { rateLimit: rateLimitConfigs.auth } }, registerUser);
  fastify.post('/login', { config: { rateLimit: rateLimitConfigs.auth } }, loginUser);
  
  fastify.post('/logout', async (request, reply) => {
    request.session.destroy();
    return reply.send({ success: true });
  });

  fastify.get('/user', async (request, reply) => {
    if (!request.userId) {
      return reply.code(401).send({ message: "Not authenticated" });
    }
    const { storage } = await import('../storage');
    const user = await storage.getUser(request.userId);
    return reply.send(user);
  });
}
