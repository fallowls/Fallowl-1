import { FastifyRequest, FastifyReply } from 'fastify';
import { storage } from '../../storage';
import { UnauthorizedError, NotFoundError } from '../../utils/errors';
import { wsService } from '../../websocketService';

export async function getVoicemails(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const membership = await storage.getDefaultTenantForUser(userId);
  const tenantId = membership?.tenantId;
  if (!userId || !tenantId) throw new UnauthorizedError();

  const voicemails = await storage.getAllVoicemails(tenantId, userId);
  return reply.send(voicemails);
}

export async function getVoicemail(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const membership = await storage.getDefaultTenantForUser(userId);
  const tenantId = membership?.tenantId;
  const { id } = request.params as { id: string };
  
  if (!userId || !tenantId) throw new UnauthorizedError();

  const voicemail = await storage.getVoicemail(tenantId, userId, parseInt(id));
  if (!voicemail) throw new NotFoundError("Voicemail not found");

  return reply.send(voicemail);
}

export async function updateVoicemail(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const membership = await storage.getDefaultTenantForUser(userId);
  const tenantId = membership?.tenantId;
  const { id } = request.params as { id: string };
  const updateData = request.body as any;

  if (!userId || !tenantId) throw new UnauthorizedError();

  const updated = await storage.updateVoicemail(tenantId, userId, parseInt(id), updateData);
  wsService.broadcastVoicemailUpdate(userId, updated);
  return reply.send(updated);
}

export async function deleteVoicemail(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const membership = await storage.getDefaultTenantForUser(userId);
  const tenantId = membership?.tenantId;
  const { id } = request.params as { id: string };

  if (!userId || !tenantId) throw new UnauthorizedError();

  await storage.deleteVoicemail(tenantId, userId, parseInt(id));
  return reply.send({ success: true });
}

export async function playVoicemail(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const membership = await storage.getDefaultTenantForUser(userId);
  const tenantId = membership?.tenantId;
  const { id } = request.params as { id: string };

  if (!userId || !tenantId) throw new UnauthorizedError();

  const voicemail = await storage.getVoicemail(tenantId, userId, parseInt(id));
  if (!voicemail) throw new NotFoundError("Voicemail not found");

  // In a real implementation, this might redirect to a signed URL or stream the file
  return reply.send({ url: voicemail.fileUrl });
}

export async function getVoicemailTranscript(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const membership = await storage.getDefaultTenantForUser(userId);
  const tenantId = membership?.tenantId;
  const { id } = request.params as { id: string };

  if (!userId || !tenantId) throw new UnauthorizedError();

  const voicemail = await storage.getVoicemail(tenantId, userId, parseInt(id));
  if (!voicemail) throw new NotFoundError("Voicemail not found");

  return reply.send({ 
    transcript: voicemail.transcription,
    status: voicemail.transcriptionStatus 
  });
}

export async function getUnreadVoicemailsCount(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const membership = await storage.getDefaultTenantForUser(userId);
  const tenantId = membership?.tenantId;

  if (!userId || !tenantId) throw new UnauthorizedError();

  const count = await storage.getUnreadVoicemailCount(tenantId, userId);
  return reply.send({ count });
}
