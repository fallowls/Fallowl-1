import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  searchUsers,
  bulkUpdateUsers,
  getUserActivity,
  getLoginHistory,
  getUserInvoices
} from './users.controller';

const usersRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const requireAuth = (fastify as any).requireAuth;

  fastify.get('/users', { preHandler: [requireAuth] }, getAllUsers);
  fastify.post('/users', { preHandler: [requireAuth] }, createUser);
  fastify.put('/users/:id', { preHandler: [requireAuth] }, updateUser);
  fastify.delete('/users/:id', { preHandler: [requireAuth] }, deleteUser);
  fastify.get('/users/search', { preHandler: [requireAuth] }, searchUsers);
  fastify.post('/users/bulk-update', { preHandler: [requireAuth] }, bulkUpdateUsers);
  fastify.get('/users/:id/activity', { preHandler: [requireAuth] }, getUserActivity);
  fastify.get('/users/:id/login-history', { preHandler: [requireAuth] }, getLoginHistory);
  fastify.get('/users/:id/invoices', { preHandler: [requireAuth] }, getUserInvoices);
};

export default usersRoutes;
