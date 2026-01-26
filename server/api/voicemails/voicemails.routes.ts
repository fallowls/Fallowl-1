import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  getVoicemails,
  getVoicemail,
  updateVoicemail,
  deleteVoicemail,
  playVoicemail,
  getVoicemailTranscript,
  getUnreadVoicemailsCount
} from './voicemails.controller';

const voicemailRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const requireAuth = (fastify as any).requireAuth;

  fastify.get('/api/voicemails', { preHandler: [requireAuth] }, getVoicemails);
  fastify.get('/api/voicemails/unread/count', { preHandler: [requireAuth] }, getUnreadVoicemailsCount);
  fastify.get('/api/voicemails/:id', { preHandler: [requireAuth] }, getVoicemail);
  fastify.put('/api/voicemails/:id', { preHandler: [requireAuth] }, updateVoicemail);
  fastify.delete('/api/voicemails/:id', { preHandler: [requireAuth] }, deleteVoicemail);
  fastify.get('/api/voicemails/:id/play', { preHandler: [requireAuth] }, playVoicemail);
  fastify.get('/api/voicemails/:id/transcript', { preHandler: [requireAuth] }, getVoicemailTranscript);
};

export default voicemailRoutes;
