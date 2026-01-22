import { FastifyRequest, FastifyReply } from 'fastify';
import { tenantService } from '../../services/TenantService';
import { BadRequestError } from '../../utils/errors';
import { z } from 'zod';

export async function getAllTenants(request: FastifyRequest, reply: FastifyReply) {
  const tenants = await tenantService.getAllTenants();
  return reply.send(tenants);
}

export async function getTenantById(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const tenantId = parseInt(id);
  const tenant = await tenantService.getTenantById(tenantId);
  return reply.send(tenant);
}

export async function createTenant(request: FastifyRequest, reply: FastifyReply) {
  const schema = z.object({
    name: z.string().min(1),
    slug: z.string().optional(),
  });
  const validatedData = schema.safeParse(request.body);
  if (!validatedData.success) {
    throw new BadRequestError('Invalid tenant data');
  }
  const tenant = await tenantService.createTenant(validatedData.data);
  return reply.status(201).send(tenant);
}

export async function updateTenant(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const tenantId = parseInt(id);
  const tenant = await tenantService.updateTenant(tenantId, request.body);
  return reply.send(tenant);
}

export async function deleteTenant(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const tenantId = parseInt(id);
  await tenantService.deleteTenant(tenantId);
  return reply.send({ message: "Tenant deleted successfully" });
}

export async function updateTwilioCredentials(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const tenantId = parseInt(id);
    const schema = z.object({
        accountSid: z.string(),
        authToken: z.string(),
        apiKeySid: z.string(),
        apiKeySecret: z.string(),
    });
    const validatedData = schema.safeParse(request.body);
    if (!validatedData.success) {
        throw new BadRequestError('Invalid Twilio credentials');
    }
    await tenantService.updateTwilioCredentials(tenantId, validatedData.data);
    return reply.send({ message: "Twilio credentials updated successfully" });
}
