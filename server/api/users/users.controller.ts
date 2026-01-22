import { FastifyRequest, FastifyReply } from 'fastify';
import { userService } from '../../services/UserService';
import { sanitizeUser, sanitizeUsers } from '../../utils/dataSanitization';
import { insertUserSchema } from '@shared/schema';
import { BadRequestError } from '../../utils/errors';

export async function getAllUsers(request: FastifyRequest, reply: FastifyReply) {
  const users = await userService.getAllUsers();
  return reply.send(sanitizeUsers(users));
}

export async function createUser(request: FastifyRequest, reply: FastifyReply) {
  const validatedData = insertUserSchema.safeParse(request.body);
  if (!validatedData.success) {
    throw new BadRequestError('Invalid user data');
  }
  const user = await userService.createUser(validatedData.data);
  return reply.send(sanitizeUser(user));
}

export async function updateUser(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const userId = parseInt(id);
  const validatedData = insertUserSchema.partial().safeParse(request.body);
  if (!validatedData.success) {
    throw new BadRequestError('Invalid user data');
  }
  const user = await userService.updateUser(userId, validatedData.data);
  return reply.send(sanitizeUser(user));
}

export async function deleteUser(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const userId = parseInt(id);
  await userService.deleteUser(userId);
  return reply.send({ message: "User deleted successfully" });
}

export async function searchUsers(request: FastifyRequest, reply: FastifyReply) {
  const { q } = request.query as { q?: string };
  if (!q) {
    throw new BadRequestError("Search query is required");
  }
  const users = await userService.searchUsers(q);
  return reply.send(sanitizeUsers(users));
}

export async function bulkUpdateUsers(request: FastifyRequest, reply: FastifyReply) {
  const { userIds, updates } = request.body as { userIds?: number[]; updates?: any };
  if (!userIds || !Array.isArray(userIds)) {
    throw new BadRequestError("User IDs array is required");
  }
  const validatedUpdates = insertUserSchema.partial().safeParse(updates);
  if (!validatedUpdates.success) {
      throw new BadRequestError("Invalid updates data");
  }
  const updatedUsers = await userService.bulkUpdateUsers(userIds, validatedUpdates.data);
  return reply.send({ 
    message: `${updatedUsers.length} users updated successfully`,
    users: sanitizeUsers(updatedUsers) 
  });
}

export async function getUserActivity(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const userId = parseInt(id);
  const { limit } = request.query as { limit?: string };
  const limitNum = limit ? parseInt(limit) : 50;
  const activity = await userService.getUserActivity(userId, limitNum);
  return reply.send(activity);
}

export async function getLoginHistory(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const userId = parseInt(id);
  const { limit } = request.query as { limit?: string };
  const limitNum = limit ? parseInt(limit) : 50;
  const loginHistory = await userService.getLoginHistory(userId, limitNum);
  return reply.send(loginHistory);
}

export async function getUserInvoices(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const userId = parseInt(id);
  const invoices = await userService.getInvoicesByUser(userId);
  return reply.send(invoices);
}
