import { FastifyRequest, FastifyReply } from 'fastify';
import { storage } from '../../storage';
import { insertContactSchema, insertContactListSchema } from '@shared/schema';
import { BadRequestError, NotFoundError, UnauthorizedError, ConflictError } from '../../utils/errors';

export async function getAllContacts(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const tenantId = (request as any).tenantId;
  if (!tenantId || !userId) throw new UnauthorizedError();

  const contacts = await storage.getAllContacts(tenantId, userId);
  return reply.send(contacts);
}

export async function searchContacts(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const tenantId = (request as any).tenantId;
  if (!tenantId || !userId) throw new UnauthorizedError();

  const { q } = request.query as { q?: string };
  if (!q) {
    throw new BadRequestError("Query parameter 'q' is required");
  }
  const contacts = await storage.searchContacts(tenantId, userId, q);
  return reply.send(contacts);
}

export async function createContact(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const tenantId = (request as any).tenantId;
  if (!tenantId || !userId) throw new UnauthorizedError();

  const validatedData = insertContactSchema.safeParse(request.body);
  if (!validatedData.success) {
      throw new BadRequestError('Invalid contact data');
  }
  
  const existingContact = await storage.findContactByAnyPhoneFormat(tenantId, userId, validatedData.data.phone);
  if (existingContact) {
    throw new ConflictError(`A contact with phone number ${validatedData.data.phone} already exists`);
  }
  
  const contact = await storage.createContact(tenantId, userId, validatedData.data);
  return reply.status(201).send(contact);
}

export async function upsertContact(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const tenantId = (request as any).tenantId;
  if (!tenantId || !userId) throw new UnauthorizedError();

  const validatedData = insertContactSchema.safeParse(request.body);
  if (!validatedData.success) {
    throw new BadRequestError('Invalid contact data');
  }
  const contact = await storage.upsertContact(tenantId, userId, validatedData.data);
  return reply.send(contact);
}

export async function updateContact(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const tenantId = (request as any).tenantId;
  if (!tenantId || !userId) throw new UnauthorizedError();

  const { id } = request.params as { id: string };
  const contactId = parseInt(id);
  
  const existingContact = await storage.getContact(tenantId, userId, contactId);
  if (!existingContact) {
    throw new NotFoundError("Contact not found");
  }
  
  const validatedData = insertContactSchema.partial().safeParse(request.body);
  if (!validatedData.success) {
      throw new BadRequestError('Invalid contact data');
  }
  
  if (validatedData.data.phone && validatedData.data.phone !== existingContact.phone) {
    const duplicateContact = await storage.findContactByAnyPhoneFormat(tenantId, userId, validatedData.data.phone);
    if (duplicateContact && duplicateContact.id !== contactId) {
      throw new ConflictError(`Phone number ${validatedData.data.phone} is already used`);
    }
  }
  
  const contact = await storage.updateContact(tenantId, userId, contactId, validatedData.data);
  return reply.send(contact);
}

export async function deleteContact(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const tenantId = (request as any).tenantId;
  if (!tenantId || !userId) throw new UnauthorizedError();

  const { id } = request.params as { id: string };
  const contactId = parseInt(id);
  
  const contact = await storage.getContact(tenantId, userId, contactId);
  if (!contact) {
    throw new NotFoundError("Contact not found");
  }
  
  await storage.deleteContact(tenantId, userId, contactId);
  return reply.send({ message: "Contact deleted successfully", deletedContact: contact });
}

export async function toggleFavorite(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const tenantId = (request as any).tenantId;
  if (!tenantId || !userId) throw new UnauthorizedError();

  const { id } = request.params as { id: string };
  const contactId = parseInt(id);
  const { isFavorite } = request.body as { isFavorite?: boolean };
  
  const contact = await storage.getContact(tenantId, userId, contactId);
  if (!contact) {
    throw new NotFoundError("Contact not found");
  }

  const currentTags = contact.tags || [];
  let updatedTags;
  
  if (isFavorite) {
    updatedTags = currentTags.includes('favorite') ? currentTags : [...currentTags, 'favorite'];
  } else {
    updatedTags = currentTags.filter(tag => tag !== 'favorite');
  }

  const updatedContact = await storage.updateContact(tenantId, userId, contactId, { tags: updatedTags });
  return reply.send(updatedContact);
}
