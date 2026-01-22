import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  getAllContacts,
  searchContacts,
  createContact,
  upsertContact,
  updateContact,
  deleteContact,
  toggleFavorite
} from './contacts.controller';

const contactsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const requireAuth = (fastify as any).requireAuth;

  fastify.get('/contacts', { preHandler: [requireAuth] }, getAllContacts);
  fastify.get('/contacts/search', { preHandler: [requireAuth] }, searchContacts);
  fastify.post('/contacts', { preHandler: [requireAuth] }, createContact);
  fastify.post('/contacts/upsert', { preHandler: [requireAuth] }, upsertContact);
  fastify.put('/contacts/:id', { preHandler: [requireAuth] }, updateContact);
  fastify.patch('/contacts/:id', { preHandler: [requireAuth] }, updateContact);
  fastify.delete('/contacts/:id', { preHandler: [requireAuth] }, deleteContact);
  fastify.post('/contacts/:id/favorite', { preHandler: [requireAuth] }, toggleFavorite);
};

export default contactsRoutes;
