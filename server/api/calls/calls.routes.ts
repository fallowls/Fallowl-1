import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  getAllCalls,
  getCallStats,
  getActiveCalls,
  createCall,
  updateCall,
  deleteCall
} from './calls.controller';

const callsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const requireAuth = (fastify as any).requireAuth;

  fastify.get('/calls', { preHandler: [requireAuth] }, getAllCalls);
  fastify.get('/calls/stats', { preHandler: [requireAuth] }, getCallStats);
  fastify.get('/calls/active', { preHandler: [requireAuth] }, getActiveCalls);
  fastify.post('/calls', { preHandler: [requireAuth] }, createCall);
  fastify.put('/calls/:id', { preHandler: [requireAuth] }, updateCall);
  fastify.delete('/calls/:id', { preHandler: [requireAuth] }, deleteCall);
};

export default callsRoutes;
