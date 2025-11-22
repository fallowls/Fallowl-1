import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { storage } from '../storage';
import { insertContactSchema, insertContactListSchema, insertContactListMembershipSchema } from '@shared/schema';
import { rateLimitConfigs } from './rateLimiters';
import { getUserIdFromRequest } from '../authHelper';

/**
 * Contacts Management Routes Plugin for Fastify
 * Migrated from Express routes
 */
export default async function contactsRoutes(fastify: FastifyInstance) {
  // GET /contacts - Get all contacts
  fastify.get('/contacts', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const contacts = await storage.getAllContacts(userId);
      return reply.send(contacts);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /contacts/search - Search contacts
  fastify.get('/contacts/search', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const { q } = request.query as { q?: string };
      if (!q) {
        return reply.code(400).send({ message: "Query parameter 'q' is required" });
      }
      const contacts = await storage.searchContacts(userId, q);
      return reply.send(contacts);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // POST /contacts - Create new contact
  fastify.post('/contacts', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const contactData = insertContactSchema.parse(request.body);
      
      // Check if contact with this phone number already exists
      const existingContact = await storage.findContactByAnyPhoneFormat(userId, contactData.phone);
      if (existingContact) {
        return reply.code(409).send({ 
          message: `A contact with phone number ${contactData.phone} already exists. Contact name: ${existingContact.name}` 
        });
      }
      
      const contact = await storage.createContact(userId, contactData);
      return reply.code(201).send(contact);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return reply.code(400).send({ 
          message: "Validation error: " + error.errors.map((e: any) => e.message).join(', ') 
        });
      }
      return reply.code(400).send({ message: error.message || "Failed to create contact" });
    }
  });

  // POST /contacts/upsert - Upsert contact
  fastify.post('/contacts/upsert', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const contactData = insertContactSchema.parse(request.body);
      const contact = await storage.upsertContact(userId, contactData);
      return reply.send(contact);
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // PUT /contacts/:id - Update contact
  fastify.put('/contacts/:id', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const { id } = request.params as { id: string };
      const contactId = parseInt(id);
      
      if (isNaN(contactId)) {
        return reply.code(400).send({ message: "Invalid contact ID" });
      }
      
      const existingContact = await storage.getContact(userId, contactId);
      if (!existingContact) {
        return reply.code(404).send({ message: "Contact not found" });
      }
      
      const contactData = insertContactSchema.partial().parse(request.body);
      
      // If phone is being updated, check for duplicates
      if (contactData.phone && contactData.phone !== existingContact.phone) {
        const duplicateContact = await storage.findContactByAnyPhoneFormat(userId, contactData.phone);
        if (duplicateContact && duplicateContact.id !== contactId) {
          return reply.code(409).send({ 
            message: `Phone number ${contactData.phone} is already used by contact: ${duplicateContact.name}` 
          });
        }
      }
      
      const contact = await storage.updateContact(userId, contactId, contactData);
      return reply.send(contact);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return reply.code(400).send({ 
          message: "Validation error: " + error.errors.map((e: any) => e.message).join(', ') 
        });
      }
      if (error.message === "Contact not found") {
        return reply.code(404).send({ message: error.message });
      }
      return reply.code(400).send({ message: error.message || "Failed to update contact" });
    }
  });

  // PATCH /contacts/:id - Partial update contact
  fastify.patch('/contacts/:id', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const { id } = request.params as { id: string };
      const contactId = parseInt(id);
      
      if (isNaN(contactId)) {
        return reply.code(400).send({ message: "Invalid contact ID" });
      }
      
      const existingContact = await storage.getContact(userId, contactId);
      if (!existingContact) {
        return reply.code(404).send({ message: "Contact not found" });
      }
      
      const contactData = insertContactSchema.partial().parse(request.body);
      
      // If phone is being updated, check for duplicates
      if (contactData.phone && contactData.phone !== existingContact.phone) {
        const duplicateContact = await storage.findContactByAnyPhoneFormat(userId, contactData.phone);
        if (duplicateContact && duplicateContact.id !== contactId) {
          return reply.code(409).send({ 
            message: `Phone number ${contactData.phone} is already used by contact: ${duplicateContact.name}` 
          });
        }
      }
      
      const contact = await storage.updateContact(userId, contactId, contactData);
      return reply.send(contact);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return reply.code(400).send({ 
          message: "Validation error: " + error.errors.map((e: any) => e.message).join(', ') 
        });
      }
      if (error.message === "Contact not found") {
        return reply.code(404).send({ message: error.message });
      }
      return reply.code(400).send({ message: error.message || "Failed to update contact" });
    }
  });

  // DELETE /contacts/:id - Delete contact
  fastify.delete('/contacts/:id', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const { id } = request.params as { id: string };
      const contactId = parseInt(id);
      
      if (isNaN(contactId)) {
        return reply.code(400).send({ message: "Invalid contact ID" });
      }
      
      const contact = await storage.getContact(userId, contactId);
      if (!contact) {
        return reply.code(404).send({ message: "Contact not found" });
      }
      
      await storage.deleteContact(userId, contactId);
      return reply.send({ message: "Contact deleted successfully", deletedContact: contact });
    } catch (error: any) {
      return reply.code(500).send({ message: error.message || "Failed to delete contact" });
    }
  });

  // POST /contacts/:id/favorite - Toggle favorite status
  fastify.post('/contacts/:id/favorite', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const { id } = request.params as { id: string };
      const contactId = parseInt(id);
      const { isFavorite } = request.body as { isFavorite?: boolean };
      
      // Add favorite to tags array
      const contact = await storage.getContact(userId, contactId);
      if (!contact) {
        return reply.code(404).send({ message: "Contact not found" });
      }

      const currentTags = contact.tags || [];
      let updatedTags;
      
      if (isFavorite) {
        updatedTags = currentTags.includes('favorite') ? currentTags : [...currentTags, 'favorite'];
      } else {
        updatedTags = currentTags.filter(tag => tag !== 'favorite');
      }

      const updatedContact = await storage.updateContact(userId, contactId, { tags: updatedTags });
      return reply.send(updatedContact);
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // POST /contacts/:id/disposition - Update contact disposition
  fastify.post('/contacts/:id/disposition', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const { id } = request.params as { id: string };
      const contactId = parseInt(id);
      const { disposition } = request.body as { disposition?: string };
      
      if (isNaN(contactId)) {
        return reply.code(400).send({ message: "Invalid contact ID" });
      }
      
      if (!disposition) {
        return reply.code(400).send({ message: "Disposition is required" });
      }
      
      // Validate disposition is one of the allowed values
      const validDispositions = [
        'answered', 'human', 'voicemail', 'machine', 'busy', 'no-answer', 'failed', 
        'callback-requested', 'interested', 'not-interested', 'qualified', 
        'wrong-number', 'disconnected', 'dnc-requested', 'dnc-skipped'
      ];
      
      if (!validDispositions.includes(disposition)) {
        return reply.code(400).send({ 
          message: `Invalid disposition. Must be one of: ${validDispositions.join(', ')}` 
        });
      }
      
      const contact = await storage.getContact(userId, contactId);
      if (!contact) {
        return reply.code(404).send({ message: "Contact not found" });
      }

      const updatedContact = await storage.updateContact(userId, contactId, { 
        disposition,
        lastContactedAt: new Date()
      });
      return reply.send(updatedContact);
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // POST /contacts/:id/call - Initiate call to contact
  fastify.post('/contacts/:id/call', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const { id } = request.params as { id: string };
      const contactId = parseInt(id);
      const contact = await storage.getContact(userId, contactId);
      
      if (!contact) {
        return reply.code(404).send({ message: "Contact not found" });
      }

      if (contact.doNotCall) {
        return reply.code(400).send({ message: "This contact has opted out of calls" });
      }

      // Update last contacted timestamp
      await storage.updateContact(userId, contactId, {
        lastContactedAt: new Date()
      });

      return reply.send({ 
        message: "Call initiated",
        contact: contact,
        phone: contact.phone
      });
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // POST /contacts/bulk/export - Bulk export contacts
  fastify.post('/contacts/bulk/export', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const { contactIds } = request.body as { contactIds?: number[] };
      let contacts;
      
      if (contactIds && contactIds.length > 0) {
        contacts = await Promise.all(contactIds.map((id: number) => storage.getContact(userId, id)));
        contacts = contacts.filter(Boolean); // Remove null results
      } else {
        contacts = await storage.getAllContacts(userId);
      }

      // Convert to CSV format
      const csvHeaders = ['Name', 'Phone', 'Email', 'Company', 'Job Title', 'Lead Status', 'Priority', 'Tags'];
      const csvRows = contacts.map(contact => [
        contact.name,
        contact.phone,
        contact.email || '',
        contact.company || '',
        contact.jobTitle || '',
        contact.leadStatus || 'new',
        contact.priority || 'medium',
        contact.tags?.join(';') || ''
      ]);

      const csvContent = [csvHeaders, ...csvRows]
        .map(row => row.map(field => `"${field}"`).join(','))
        .join('\n');

      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', 'attachment; filename="contacts.csv"');
      return reply.send(csvContent);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // POST /contacts/bulk/call - Bulk call contacts
  fastify.post('/contacts/bulk/call', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const { contactIds } = request.body as { contactIds?: number[] };
      
      if (!contactIds || contactIds.length === 0) {
        return reply.code(400).send({ message: "Contact IDs are required" });
      }

      const results = [];
      for (const id of contactIds) {
        const contact = await storage.getContact(userId, id);
        if (contact && !contact.doNotCall) {
          await storage.updateContact(userId, id, {
            lastContactedAt: new Date()
          });
          results.push({ id, phone: contact.phone, status: 'queued' });
        } else {
          results.push({ id, status: 'skipped', reason: contact?.doNotCall ? 'Do not call' : 'Contact not found' });
        }
      }

      return reply.send({ 
        message: "Bulk call operation processed",
        results
      });
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // POST /contacts/bulk/sms - Bulk SMS contacts
  fastify.post('/contacts/bulk/sms', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const { contactIds, message } = request.body as { contactIds?: number[]; message?: string };
      
      if (!contactIds || contactIds.length === 0) {
        return reply.code(400).send({ message: "Contact IDs are required" });
      }

      if (!message) {
        return reply.code(400).send({ message: "Message content is required" });
      }

      const results = [];
      for (const id of contactIds) {
        const contact = await storage.getContact(userId, id);
        if (contact && !contact.doNotSms) {
          results.push({ id, phone: contact.phone, status: 'queued' });
        } else {
          results.push({ id, status: 'skipped', reason: contact?.doNotSms ? 'Do not SMS' : 'Contact not found' });
        }
      }

      return reply.send({ 
        message: "Bulk SMS operation processed",
        results
      });
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // POST /contacts/bulk/email - Bulk email contacts
  fastify.post('/contacts/bulk/email', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const { contactIds, subject, message } = request.body as { contactIds?: number[]; subject?: string; message?: string };
      
      if (!contactIds || contactIds.length === 0) {
        return reply.code(400).send({ message: "Contact IDs are required" });
      }

      if (!subject || !message) {
        return reply.code(400).send({ message: "Subject and message are required" });
      }

      const results = [];
      for (const id of contactIds) {
        const contact = await storage.getContact(userId, id);
        if (contact && contact.email && !contact.doNotEmail) {
          results.push({ id, email: contact.email, status: 'queued' });
        } else {
          results.push({ id, status: 'skipped', reason: contact?.doNotEmail ? 'Do not email' : 'No email or contact not found' });
        }
      }

      return reply.send({ 
        message: "Bulk email operation processed",
        results
      });
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // POST /contacts/import/parse - Parse CSV for import
  fastify.post('/contacts/import/parse', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { csvContent } = request.body as { csvContent?: string };
      
      if (!csvContent || typeof csvContent !== 'string') {
        return reply.code(400).send({ message: "CSV content is required" });
      }

      const { fieldMappingService } = await import('../services/fieldMappingService');
      const { csvImportService } = await import('../services/csvImportService');
      
      // Parse CSV
      const { headers, data } = csvImportService.parseCsvContent(csvContent);
      
      // Get smart field mappings
      const fieldMappings = fieldMappingService.mapFields(headers);
      
      // Get available fields for manual mapping
      const availableFields = fieldMappingService.getAvailableFields();
      
      return reply.send({
        headers,
        data: data.slice(0, 5), // Return first 5 rows for preview
        totalRows: data.length,
        fieldMappings,
        availableFields
      });
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // POST /contacts/import/preview - Preview CSV import
  fastify.post('/contacts/import/preview', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { csvContent, fieldMappings } = request.body as { csvContent?: string; fieldMappings?: any };
      
      if (!csvContent || !fieldMappings) {
        return reply.code(400).send({ message: "CSV content and field mappings are required" });
      }

      const { csvImportService } = await import('../services/csvImportService');
      
      // Parse CSV
      const { data } = csvImportService.parseCsvContent(csvContent);
      
      // Get preview
      const preview = csvImportService.getImportPreview(data, fieldMappings, 10);
      
      return reply.send(preview);
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // POST /contacts/import/execute - Execute CSV import
  fastify.post('/contacts/import/execute', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      if (!userId) {
        return reply.code(401).send({ message: "Not authenticated" });
      }

      const { csvContent, fieldMappings, options } = request.body as { csvContent?: string; fieldMappings?: any; options?: any };
      
      if (!csvContent || !fieldMappings) {
        return reply.code(400).send({ message: "CSV content and field mappings are required" });
      }

      const { csvImportService } = await import('../services/csvImportService');
      
      // Parse CSV
      const { data } = csvImportService.parseCsvContent(csvContent);
      
      // Execute import
      const result = await csvImportService.importContacts(userId, data, fieldMappings, options || {
        skipDuplicates: true,
        updateDuplicates: false,
        createList: false
      });
      
      return reply.send(result);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /lists - Get all contact lists
  fastify.get('/lists', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const { category, type } = request.query as { category?: string; type?: string };
      let lists;

      if (category) {
        lists = await storage.getContactListsByCategory(userId, category);
      } else if (type) {
        lists = await storage.getContactListsByType(userId, type);
      } else {
        lists = await storage.getAllContactLists(userId);
      }

      return reply.send(lists);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /lists/:id - Get single contact list
  fastify.get('/lists/:id', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const { id } = request.params as { id: string };
      const listId = parseInt(id);
      const list = await storage.getContactList(userId, listId);
      if (!list) {
        return reply.code(404).send({ message: "Contact list not found" });
      }
      return reply.send(list);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // POST /lists - Create new contact list
  fastify.post('/lists', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      
      // Set userId in the data before validation
      const listWithUserId = {
        ...request.body,
        userId
      };
      
      const listData = insertContactListSchema.parse(listWithUserId);
      const list = await storage.createContactList(userId, listData);
      return reply.send(list);
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // PUT /lists/:id - Update contact list
  fastify.put('/lists/:id', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const { id } = request.params as { id: string };
      const listId = parseInt(id);
      const listData = insertContactListSchema.partial().parse(request.body);
      const list = await storage.updateContactList(userId, listId, listData);
      return reply.send(list);
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // DELETE /lists/:id - Delete contact list
  fastify.delete('/lists/:id', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const { id } = request.params as { id: string };
      const listId = parseInt(id);
      await storage.deleteContactList(userId, listId);
      return reply.send({ message: "Contact list deleted successfully" });
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // GET /lists/:id/contacts - Get all contacts in a list
  fastify.get('/lists/:id/contacts', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const { id } = request.params as { id: string };
      const listId = parseInt(id);
      const contacts = await storage.getContactsInList(userId, listId);
      return reply.send(contacts);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /lists/:id/memberships - Get all memberships in a list
  fastify.get('/lists/:id/memberships', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const { id } = request.params as { id: string };
      const listId = parseInt(id);
      const memberships = await storage.getContactListMemberships(userId, listId);
      return reply.send(memberships);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // POST /lists/:id/contacts - Add contact to list
  fastify.post('/lists/:id/contacts', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const { id } = request.params as { id: string };
      const listId = parseInt(id);
      const { contactId } = request.body as { contactId?: number };
      
      if (!contactId) {
        return reply.code(400).send({ message: "Contact ID is required" });
      }

      const membership = await storage.addContactToList(userId, contactId, listId);
      return reply.send(membership);
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // DELETE /lists/:listId/contacts/:contactId - Remove contact from list
  fastify.delete('/lists/:listId/contacts/:contactId', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const { listId, contactId } = request.params as { listId: string; contactId: string };
      const listIdNum = parseInt(listId);
      const contactIdNum = parseInt(contactId);
      
      await storage.removeContactFromList(userId, contactIdNum, listIdNum);
      return reply.send({ message: "Contact removed from list successfully" });
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // GET /contacts/:id/lists - Get all lists for a contact
  fastify.get('/contacts/:id/lists', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const { id } = request.params as { id: string };
      const contactId = parseInt(id);
      const memberships = await storage.getContactMemberships(userId, contactId);
      return reply.send(memberships);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });
}
