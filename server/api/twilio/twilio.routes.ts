import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  saveCredentials,
  getCredentials,
  deleteCredentials,
  getAccessToken,
  handleVoice
} from './twilio.controller';

const twilioRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const requireAuth = (fastify as any).requireAuth;

  fastify.post('/user/twilio/credentials', { preHandler: [requireAuth] }, saveCredentials);
  fastify.get('/user/twilio/credentials', { preHandler: [requireAuth] }, getCredentials);
  fastify.delete('/user/twilio/credentials', { preHandler: [requireAuth] }, deleteCredentials);
  fastify.get('/twilio/access-token', { preHandler: [requireAuth] }, getAccessToken);
  fastify.post('/twilio/voice', handleVoice); // Webhook usually doesn't have auth, or uses Twilio signature
};

export default twilioRoutes;
