import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  getRecordings,
  getRecordingStats,
  syncRecordings,
  getRecordingSettings,
  updateRecordingSettings,
  deleteRecording
} from './recordings.controller';

const recordingsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const requireAuth = (fastify as any).requireAuth;

  fastify.get('/recordings', { preHandler: [requireAuth] }, getRecordings);
  fastify.get('/recordings/stats', { preHandler: [requireAuth] }, getRecordingStats);
  fastify.post('/recordings/sync', { preHandler: [requireAuth] }, syncRecordings);
  fastify.get('/recordings/settings', { preHandler: [requireAuth] }, getRecordingSettings);
  fastify.post('/recordings/settings', { preHandler: [requireAuth] }, updateRecordingSettings);
  fastify.delete('/recordings/:id', { preHandler: [requireAuth] }, deleteRecording);
};

export default recordingsRoutes;
