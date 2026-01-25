import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  saveCredentials,
  getCredentials,
  deleteCredentials,
  getAccessToken,
  handleVoice,
  handleDialAction,
  handleVoicemail,
  handleVoicemailAction,
  handleTranscription
} from './twilio.controller';

const twilioRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const requireAuth = (fastify as any).requireAuth;

  fastify.post('/user/twilio/credentials', { preHandler: [requireAuth] }, saveCredentials);
  fastify.get('/user/twilio/credentials', { preHandler: [requireAuth] }, getCredentials);
  fastify.delete('/user/twilio/credentials', { preHandler: [requireAuth] }, deleteCredentials);
  fastify.get('/twilio/access-token', { preHandler: [requireAuth] }, getAccessToken);
  
  // Webhooks
  fastify.post('/twilio/voice', handleVoice);
  fastify.post('/twilio/voice/dial-action', handleDialAction);
  fastify.post('/twilio/voice/voicemail', handleVoicemail);
  fastify.post('/twilio/voice/voicemail-action', handleVoicemailAction);
  fastify.post('/twilio/voice/transcription', handleTranscription);
};

export default twilioRoutes;
