import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { 
  registerUser, 
  loginUser, 
  checkEmail, 
  signup, 
  logout, 
  auth0Session,
  getCurrentUser
} from './auth.controller';

const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get('/user', getCurrentUser);
  fastify.post('/check-email', checkEmail);
  fastify.post('/login', loginUser);
  fastify.post('/signup', signup);
  fastify.post('/logout', logout);
  fastify.post('/auth0-session', auth0Session);
  fastify.post('/register', registerUser);
};

export default authRoutes;
