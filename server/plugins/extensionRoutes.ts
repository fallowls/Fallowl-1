import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { storage } from '../storage';
import { insertContactSchema } from '@shared/schema';
import { rateLimitConfigs } from './rateLimiters';
import { getUserIdFromRequest } from '../authHelper';
import { userTwilioCache } from '../userTwilioService';
import { wsService } from '../websocketService';

async function getUserFromAuth0(user: any) {
  if (!user || !user.sub) {
    throw new Error('Not authenticated');
  }
  const dbUser = await storage.getUserByAuth0Id(user.sub);
  if (!dbUser) {
    throw new Error('User not found');
  }
  return dbUser;
}

export default async function extensionRoutes(fastify: FastifyInstance) {
  
  const requireAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      return reply.code(401).send({ message: 'Unauthorized' });
    }
  };

  fastify.get('/ext/health', async (request: FastifyRequest, reply: FastifyReply) => {
    return {
      status: 'ok',
      api: 'extension',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    };
  });

  fastify.get('/ext/contacts', {
    config: { rateLimit: rateLimitConfigs.extension },
    preHandler: requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUserFromAuth0((request as any).user);
      const { page = '1', limit = '50', search } = request.query as { page?: string; limit?: string; search?: string };
      
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
      
      let contacts;
      if (search) {
        contacts = await storage.searchContacts(user.id, search);
      } else {
        contacts = await storage.getAllContacts(user.id);
      }
      
      const startIdx = (pageNum - 1) * limitNum;
      const paginatedContacts = contacts.slice(startIdx, startIdx + limitNum);
      
      return reply.send({
        data: paginatedContacts,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: contacts.length,
          totalPages: Math.ceil(contacts.length / limitNum)
        }
      });
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  fastify.get('/ext/contacts/search', {
    config: { rateLimit: rateLimitConfigs.extension },
    preHandler: requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUserFromAuth0((request as any).user);
      const { q, limit = '10' } = request.query as { q?: string; limit?: string };
      
      if (!q || q.trim().length === 0) {
        return reply.code(400).send({ message: "Query parameter 'q' is required" });
      }
      
      const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 10));
      const contacts = await storage.searchContacts(user.id, q);
      
      return reply.send({
        data: contacts.slice(0, limitNum),
        query: q,
        count: Math.min(contacts.length, limitNum)
      });
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  fastify.get('/ext/contacts/:id', {
    config: { rateLimit: rateLimitConfigs.extension },
    preHandler: requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUserFromAuth0((request as any).user);
      const { id } = request.params as { id: string };
      const contactId = parseInt(id);
      
      if (isNaN(contactId)) {
        return reply.code(400).send({ message: "Invalid contact ID" });
      }
      
      const contact = await storage.getContact(user.id, contactId);
      if (!contact) {
        return reply.code(404).send({ message: "Contact not found" });
      }
      
      return reply.send(contact);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  fastify.post('/ext/contacts', {
    config: { rateLimit: rateLimitConfigs.extension },
    preHandler: requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUserFromAuth0((request as any).user);
      const contactData = insertContactSchema.parse(request.body);
      
      const existingContact = await storage.findContactByAnyPhoneFormat(user.id, contactData.phone);
      if (existingContact) {
        return reply.code(409).send({ 
          message: `Contact with phone ${contactData.phone} already exists`,
          existingContact: {
            id: existingContact.id,
            name: existingContact.name,
            phone: existingContact.phone
          }
        });
      }
      
      const contact = await storage.createContact(user.id, contactData);
      return reply.code(201).send(contact);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return reply.code(400).send({ 
          message: "Validation error",
          errors: error.errors
        });
      }
      return reply.code(400).send({ message: error.message });
    }
  });

  fastify.put('/ext/contacts/:id', {
    config: { rateLimit: rateLimitConfigs.extension },
    preHandler: requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUserFromAuth0((request as any).user);
      const { id } = request.params as { id: string };
      const contactId = parseInt(id);
      
      if (isNaN(contactId)) {
        return reply.code(400).send({ message: "Invalid contact ID" });
      }
      
      const existingContact = await storage.getContact(user.id, contactId);
      if (!existingContact) {
        return reply.code(404).send({ message: "Contact not found" });
      }
      
      const contactData = insertContactSchema.partial().parse(request.body);
      
      if (contactData.phone && contactData.phone !== existingContact.phone) {
        const duplicateContact = await storage.findContactByAnyPhoneFormat(user.id, contactData.phone);
        if (duplicateContact && duplicateContact.id !== contactId) {
          return reply.code(409).send({ 
            message: `Phone number already used by: ${duplicateContact.name}` 
          });
        }
      }
      
      const contact = await storage.updateContact(user.id, contactId, contactData);
      return reply.send(contact);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return reply.code(400).send({ 
          message: "Validation error",
          errors: error.errors
        });
      }
      return reply.code(400).send({ message: error.message });
    }
  });

  fastify.delete('/ext/contacts/:id', {
    config: { rateLimit: rateLimitConfigs.extension },
    preHandler: requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUserFromAuth0((request as any).user);
      const { id } = request.params as { id: string };
      const contactId = parseInt(id);
      
      if (isNaN(contactId)) {
        return reply.code(400).send({ message: "Invalid contact ID" });
      }
      
      const contact = await storage.getContact(user.id, contactId);
      if (!contact) {
        return reply.code(404).send({ message: "Contact not found" });
      }
      
      await storage.deleteContact(user.id, contactId);
      return reply.send({ success: true, message: "Contact deleted" });
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  fastify.get('/ext/twilio/token', {
    config: { rateLimit: rateLimitConfigs.extensionCall },
    preHandler: requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUserFromAuth0((request as any).user);
      
      const baseUrl = process.env.REPLIT_DOMAINS 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : (request.hostname && !request.hostname.includes('localhost')) 
          ? `https://${request.hostname}`
          : undefined;

      const accessToken = await userTwilioCache.generateAccessToken(user.id, user.username, baseUrl);
      
      return reply.send({ 
        accessToken,
        expiresIn: 3600,
        identity: user.username 
      });
    } catch (error: any) {
      console.error('Extension token generation error:', error);
      return reply.code(500).send({ 
        message: error.message,
        code: error.code || 'TOKEN_GENERATION_FAILED'
      });
    }
  });

  fastify.post('/ext/calls/initiate', {
    config: { rateLimit: rateLimitConfigs.extensionCall },
    preHandler: requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUserFromAuth0((request as any).user);
      const { to, contactId, contactName, amd = true } = request.body as { 
        to: string; 
        contactId?: number;
        contactName?: string;
        amd?: boolean;
      };
      
      if (!to) {
        return reply.code(400).send({ message: 'Phone number is required' });
      }
      
      const formattedTo = to.startsWith('+') ? to : `+${to}`;
      
      const { client, credentials } = await userTwilioCache.getTwilioClient(user.id);
      
      if (!credentials.phoneNumber) {
        return reply.code(400).send({ 
          message: 'Phone number not configured',
          code: 'NO_PHONE_NUMBER'
        });
      }
      
      const baseUrl = process.env.REPLIT_DOMAINS 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : `https://${request.hostname}`;
      
      const callOptions: any = {
        to: formattedTo,
        from: credentials.phoneNumber,
        url: `${baseUrl}/api/twilio/voice`,
        method: 'POST',
        statusCallback: `${baseUrl}/api/twilio/status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallbackMethod: 'POST',
        timeout: 120
      };
      
      if (amd) {
        callOptions.machineDetection = 'DetectMessageEnd';
        callOptions.asyncAmd = 'true';
        callOptions.asyncAmdStatusCallback = `${baseUrl}/api/twilio/amd-status`;
        callOptions.asyncAmdStatusCallbackMethod = 'POST';
      }
      
      const call = await client.calls.create(callOptions);
      
      const callRecord = await storage.createCall(user.id, {
        userId: user.id,
        phone: formattedTo,
        type: 'outgoing',
        status: call.status,
        duration: 0,
        cost: '0.00',
        callQuality: null,
        contactId: contactId || null,
        tags: [],
        priority: 'normal',
        sentiment: 'neutral',
        callPurpose: 'outbound',
        outcome: 'in-progress',
        transcript: null,
        summary: null,
        actionItems: [],
        followUpRequired: false,
        keywords: [],
        followUpDate: null,
        followUpNotes: null,
        codec: null,
        bitrate: null,
        jitter: null,
        packetLoss: null,
        location: null,
        carrier: null,
        deviceType: null,
        userAgent: null,
        transferredFrom: null,
        transferredTo: null,
        dialAttempts: 1,
        hangupReason: null,
        sipCallId: call.sid,
        conferenceId: null,
        recordingUrl: null,
        customFields: {},
        metadata: { 
          twilioCallSid: call.sid,
          contactName: contactName || null,
          amdEnabled: amd,
          source: 'chrome_extension'
        }
      });
      
      wsService.broadcastNewCall(user.id, callRecord);
      
      return reply.send({
        success: true,
        callSid: call.sid,
        callId: callRecord.id,
        status: call.status
      });
      
    } catch (error: any) {
      console.error('Extension initiate call error:', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  fastify.post('/ext/calls/:id/hangup', {
    config: { rateLimit: rateLimitConfigs.extensionCall },
    preHandler: requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUserFromAuth0((request as any).user);
      const { id } = request.params as { id: string };
      const callId = parseInt(id);
      
      if (isNaN(callId)) {
        return reply.code(400).send({ message: "Invalid call ID" });
      }
      
      const call = await storage.getCall(user.id, callId);
      if (!call) {
        return reply.code(404).send({ message: "Call not found" });
      }
      
      const metadata = (call.metadata as any) || {};
      const twilioCallSid = metadata.twilioCallSid || call.sipCallId;
      
      if (!twilioCallSid) {
        return reply.code(400).send({ message: "No Twilio call SID found" });
      }
      
      const { client } = await userTwilioCache.getTwilioClient(user.id);
      await client.calls(twilioCallSid).update({ status: 'completed' });
      
      await storage.updateCall(user.id, callId, {
        status: 'completed',
        hangupReason: 'user_hangup'
      });
      
      return reply.send({ success: true, message: "Call ended" });
    } catch (error: any) {
      console.error('Extension hangup error:', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  fastify.post('/ext/calls/:id/mute', {
    config: { rateLimit: rateLimitConfigs.extensionCall },
    preHandler: requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUserFromAuth0((request as any).user);
      const { id } = request.params as { id: string };
      const { muted } = request.body as { muted: boolean };
      
      return reply.send({ 
        success: true, 
        message: `Mute ${muted ? 'enabled' : 'disabled'}. Handle mute locally via Twilio Device SDK.`,
        muted 
      });
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  fastify.post('/ext/calls/:id/hold', {
    config: { rateLimit: rateLimitConfigs.extensionCall },
    preHandler: requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUserFromAuth0((request as any).user);
      const { id } = request.params as { id: string };
      const { hold } = request.body as { hold: boolean };
      const callId = parseInt(id);
      
      if (isNaN(callId)) {
        return reply.code(400).send({ message: "Invalid call ID" });
      }
      
      const call = await storage.getCall(user.id, callId);
      if (!call) {
        return reply.code(404).send({ message: "Call not found" });
      }
      
      await storage.updateCall(user.id, callId, {
        metadata: {
          ...((call.metadata as any) || {}),
          onHold: hold,
          holdAt: hold ? new Date().toISOString() : null
        }
      });
      
      return reply.send({ 
        success: true, 
        message: `Call ${hold ? 'placed on hold' : 'resumed'}`,
        hold 
      });
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  fastify.get('/ext/calls/active', {
    config: { rateLimit: rateLimitConfigs.extensionCall },
    preHandler: requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUserFromAuth0((request as any).user);
      const activeCalls = await storage.getActiveCalls(user.id);
      
      return reply.send({
        data: activeCalls,
        count: activeCalls.length
      });
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  fastify.get('/ext/calls/history', {
    config: { rateLimit: rateLimitConfigs.extension },
    preHandler: requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUserFromAuth0((request as any).user);
      const { limit = '20', offset = '0' } = request.query as { limit?: string; offset?: string };
      
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
      const offsetNum = Math.max(0, parseInt(offset) || 0);
      
      const calls = await storage.getAllCalls(user.id);
      const sortedCalls = calls.sort((a, b) => 
        new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime()
      );
      
      return reply.send({
        data: sortedCalls.slice(offsetNum, offsetNum + limitNum),
        pagination: {
          limit: limitNum,
          offset: offsetNum,
          total: calls.length
        }
      });
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  fastify.get('/ext/user/profile', {
    config: { rateLimit: rateLimitConfigs.extension },
    preHandler: requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUserFromAuth0((request as any).user);
      
      return reply.send({
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      });
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  fastify.get('/ext/twilio/status', {
    config: { rateLimit: rateLimitConfigs.extension },
    preHandler: requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUserFromAuth0((request as any).user);
      
      try {
        const { credentials } = await userTwilioCache.getTwilioClient(user.id);
        return reply.send({
          configured: true,
          phoneNumber: credentials.phoneNumber || null,
          hasCredentials: !!credentials.accountSid && !!credentials.authToken
        });
      } catch (e) {
        return reply.send({
          configured: false,
          phoneNumber: null,
          hasCredentials: false
        });
      }
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });
}
