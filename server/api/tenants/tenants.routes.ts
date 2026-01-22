import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  getAllTenants,
  getTenantById,
  createTenant,
  updateTenant,
  deleteTenant,
  updateTwilioCredentials
} from './tenants.controller';

const tenantsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const requireAuth = (fastify as any).requireAuth;

  fastify.get('/tenants', { preHandler: [requireAuth] }, getAllTenants);
  fastify.get('/tenants/:id', { preHandler: [requireAuth] }, getTenantById);
  fastify.post('/tenants', { preHandler: [requireAuth] }, createTenant);
  fastify.put('/tenants/:id', { preHandler: [requireAuth] }, updateTenant);
  fastify.delete('/tenants/:id', { preHandler: [requireAuth] }, deleteTenant);
  fastify.put('/tenants/:id/twilio-credentials', { preHandler: [requireAuth] }, updateTwilioCredentials);
};

export default tenantsRoutes;
