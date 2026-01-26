import { FastifyRequest, FastifyReply } from 'fastify';
import { storage } from '../../storage';
import { insertCallSchema, insertCallNoteSchema } from '@shared/schema';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../../utils/errors';
import { wsService } from '../../websocketService';

export async function getAllCalls(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const tenantId = (request as any).tenantId;
  
  if (!tenantId || !userId) {
    console.error('[FASTIFY] Missing context in getAllCalls:', { userId, tenantId });
    return reply.code(401).send({ message: "Unauthorized: Missing user or tenant context" });
  }

  const { page, limit } = request.query as { page?: string; limit?: string };
  const pageNum = page ? parseInt(page) : 1;
  const limitNum = limit ? parseInt(limit) : 50;

  try {
    const result = await storage.getAllCalls(tenantId, userId, { 
      page: pageNum, 
      limit: limitNum 
    });
    return reply.send(result);
  } catch (error: any) {
    console.error('[FASTIFY] Error in getAllCalls:', error);
    return reply.code(500).send({ message: error.message });
  }
}

export async function getCallStats(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const tenantId = (request as any).tenantId;
  if (!tenantId || !userId) throw new UnauthorizedError();

  const stats = await storage.getCallStats(tenantId, userId);
  return reply.send(stats);
}

export async function getActiveCalls(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const tenantId = (request as any).tenantId;
  if (!tenantId || !userId) throw new UnauthorizedError();

  const activeCalls = await storage.getActiveCalls(tenantId, userId);
  return reply.send(activeCalls);
}

export async function createCall(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const tenantId = (request as any).tenantId;
  if (!tenantId || !userId) throw new UnauthorizedError();

  const validatedData = insertCallSchema.safeParse(request.body);
  if (!validatedData.success) {
    throw new BadRequestError('Invalid call data');
  }

  const call = await storage.createCall(tenantId, userId, validatedData.data);
  wsService.broadcastNewCall(userId, call);
  return reply.send(call);
}

export async function updateCall(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const tenantId = (request as any).tenantId;
  if (!tenantId || !userId) throw new UnauthorizedError();

  const { id } = request.params as { id: string };
  const callId = parseInt(id);
  
  const validatedData = insertCallSchema.partial().safeParse(request.body);
  if (!validatedData.success) {
    throw new BadRequestError('Invalid call data');
  }

  const call = await storage.updateCall(tenantId, userId, callId, validatedData.data);
  wsService.broadcastCallUpdate(userId, call);
  return reply.send(call);
}

export async function deleteCall(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const tenantId = (request as any).tenantId;
  if (!tenantId || !userId) throw new UnauthorizedError();

  const { id } = request.params as { id: string };
  const callId = parseInt(id);
  
  await storage.deleteCall(tenantId, userId, callId);
  return reply.send({ message: "Call deleted successfully" });
}