import { FastifyInstance } from 'fastify';
import { registerUser, loginUser } from './auth.controller';

export default async function (fastify: FastifyInstance) {
  fastify.post('/register', registerUser);
  fastify.post('/login', loginUser);
}
