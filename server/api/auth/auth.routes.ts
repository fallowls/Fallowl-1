import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { 
  registerUser, 
  loginUser, 
  checkEmail, 
  signup, 
  logout, 
  auth0Session 
} from './auth.controller';

const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Use prefix-less routes as they are registered with /api prefix in fastify.ts
  fastify.post('/auth/check-email', checkEmail);
  fastify.post('/auth/login', loginUser);
  fastify.post('/auth/signup', signup);
  fastify.post('/auth/logout', logout);
  fastify.post('/auth/auth0-session', auth0Session);
  fastify.post('/auth/register', registerUser);
};

export default authRoutes;
