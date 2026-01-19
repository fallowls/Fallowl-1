import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { storage } from '../storage';
import { insertCallSchema, insertCallNoteSchema } from '@shared/schema';
import { rateLimitConfigs } from './rateLimiters';
import { getUserIdFromRequest } from '../authHelper';
import { wsService } from '../websocketService';

/**
 * Calls Management Routes Plugin for Fastify
 * Migrated from Express routes
 */
export default async function callsRoutes(fastify: FastifyInstance) {
  // GET /calls - Get all calls
  fastify.get('/calls', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { page, limit } = request.query as { page?: string; limit?: string };
      const pageNum = page ? parseInt(page) : 1;
      const limitNum = limit ? parseInt(limit) : 50;

      const result = await storage.getAllCalls(tenantId, userId, { 
        page: pageNum, 
        limit: limitNum 
      });
      return reply.send(result);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /calls/recent - Get recent calls
  fastify.get('/calls/recent', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const tenantId = (request as any).tenantId;
      if (!tenantId) {
        return reply.code(400).send({ message: "Tenant context missing" });
      }
      const { limit } = request.query as { limit?: string };
      const limitNum = limit ? parseInt(limit) : 10;
      const calls = await storage.getRecentCalls(tenantId, userId, limitNum);
      return reply.send(calls);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /calls/stats - Get call statistics
  fastify.get('/calls/stats', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const tenantId = (request as any).tenantId;
      if (!tenantId) {
        return reply.code(400).send({ message: "Tenant context missing" });
      }
      const stats = await storage.getCallStats(tenantId, userId);
      return reply.send(stats);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /calls/active - Get active calls
  fastify.get('/calls/active', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const tenantId = (request as any).tenantId;
      if (!tenantId) {
        return reply.code(400).send({ message: "Tenant context missing" });
      }
      const activeCalls = await storage.getActiveCalls(tenantId, userId);
      return reply.send(activeCalls);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /calls/by-status - Get calls grouped by status
  fastify.get('/calls/by-status', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const allCalls = await storage.getAllCalls(userId);
      
      const enrichedCalls = await Promise.all(allCalls.map(async (call) => {
        let contactName = null;
        let agentName = null;
        
        if (call.contactId) {
          const contact = await storage.getContact(userId, call.contactId);
          if (contact) {
            contactName = contact.name;
          }
        }
        
        const user = await storage.getUser(call.userId);
        if (user) {
          agentName = user.username || user.firstName || user.email;
        }
        
        return {
          ...call,
          contactName,
          agentName
        };
      }));
      
      const grouped = {
        queued: enrichedCalls.filter(call => call.status === 'queued'),
        initiated: enrichedCalls.filter(call => call.status === 'initiated'),
        ringing: enrichedCalls.filter(call => call.status === 'ringing'),
        inProgress: enrichedCalls.filter(call => call.status === 'in-progress'),
        completed: enrichedCalls.filter(call => call.status === 'completed'),
        busy: enrichedCalls.filter(call => call.status === 'busy'),
        failed: enrichedCalls.filter(call => call.status === 'failed'),
        noAnswer: enrichedCalls.filter(call => call.status === 'no-answer'),
        voicemail: enrichedCalls.filter(call => call.outcome === 'voicemail' || call.status === 'voicemail'),
        dropped: enrichedCalls.filter(call => call.status === 'call-dropped'),
        canceled: enrichedCalls.filter(call => call.status === 'canceled')
      };
      
      const summary = {
        totalCalls: enrichedCalls.length,
        active: grouped.queued.length + grouped.initiated.length + grouped.ringing.length + grouped.inProgress.length,
        connected: grouped.inProgress.length,
        completed: grouped.completed.length,
        failed: grouped.failed.length + grouped.busy.length + grouped.noAnswer.length,
        voicemail: grouped.voicemail.length,
        dropped: grouped.dropped.length
      };
      
      return reply.send({ grouped, summary });
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // POST /calls/test - Create test call data
  fastify.post('/calls/test', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const testCalls = [
        {
          userId,
          phone: '+1234567890',
          status: 'completed',
          type: 'outbound',
          duration: 300,
          cost: '0.0250',
          callQuality: 4,
          contactId: 1,
          tags: ['sales', 'follow-up'],
          priority: 'high',
          sentiment: 'positive',
          callPurpose: 'sales',
          outcome: 'successful',
          transcript: 'Customer showed interest in premium package.',
          summary: 'Sales call with positive outcome',
          actionItems: ['Schedule follow-up call', 'Send premium package details'],
          followUpRequired: true,
          keywords: ['premium', 'package', 'sales'],
          followUpDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          followUpNotes: 'Schedule demo for premium package',
          codec: 'G.711',
          bitrate: 64000,
          jitter: 12,
          packetLoss: '0.1',
          location: 'New York, NY',
          carrier: 'Verizon',
          deviceType: 'mobile',
          userAgent: 'SIPClient/3.0',
          transferredFrom: null,
          transferredTo: null,
          customFields: {},
          metadata: {}
        },
        {
          userId,
          phone: '+1987654321',
          status: 'missed',
          type: 'inbound',
          duration: 0,
          cost: '0.0000',
          callQuality: null,
          contactId: 2,
          tags: ['urgent'],
          priority: 'high',
          sentiment: 'neutral',
          callPurpose: 'support',
          outcome: 'missed',
          transcript: null,
          summary: 'Missed call from customer',
          actionItems: ['Call back customer'],
          followUpRequired: true,
          keywords: [],
          followUpDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
          followUpNotes: 'Return call as soon as possible',
          codec: null,
          bitrate: null,
          jitter: null,
          packetLoss: null,
          location: 'Los Angeles, CA',
          carrier: 'AT&T',
          deviceType: 'mobile',
          userAgent: null,
          transferredFrom: null,
          transferredTo: null,
          customFields: {},
          metadata: {}
        }
      ];

      const createdCalls = [];
      for (const call of testCalls) {
        const created = await storage.createCall(userId, call);
        createdCalls.push(created);
      }

      return reply.send({ message: 'Test calls created successfully', calls: createdCalls });
    } catch (error: any) {
      fastify.log.error('Error creating test calls:', error);
      return reply.code(500).send({ message: 'Failed to create test calls', error: error.message });
    }
  });

  // POST /calls - Create new call
  fastify.post('/calls', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const callData = insertCallSchema.parse(request.body);
      const call = await storage.createCall(userId, callData);
      wsService.broadcastNewCall(userId, call);
      return reply.send(call);
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // PUT /calls/:id - Update call
  fastify.put('/calls/:id', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const { id } = request.params as { id: string };
      const callId = parseInt(id);
      
      if (isNaN(callId)) {
        return reply.code(400).send({ message: "Invalid call ID" });
      }
      
      const callData = insertCallSchema.partial().parse(request.body);
      const call = await storage.updateCall(userId, callId, callData);
      wsService.broadcastCallUpdate(userId, call);
      return reply.send(call);
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // DELETE /calls/:id - Delete call
  fastify.delete('/calls/:id', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const { id } = request.params as { id: string };
      const callId = parseInt(id);
      
      if (isNaN(callId)) {
        return reply.code(400).send({ message: "Invalid call ID" });
      }
      
      await storage.deleteCall(userId, callId);
      return reply.send({ message: "Call deleted successfully" });
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // GET /call-notes - Get all call notes
  fastify.get('/call-notes', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const notes = await storage.getAllCallNotes(userId);
      return reply.send(notes);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /call-notes/call/:callId - Get call notes by call ID
  fastify.get('/call-notes/call/:callId', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const { callId } = request.params as { callId: string };
      const callIdNum = parseInt(callId);
      
      if (isNaN(callIdNum)) {
        return reply.code(400).send({ message: "Invalid call ID" });
      }
      
      const notes = await storage.getCallNotesByCall(userId, callIdNum);
      return reply.send(notes);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /call-notes/contact/:contactId - Get call notes by contact ID
  fastify.get('/call-notes/contact/:contactId', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const { contactId } = request.params as { contactId: string };
      const contactIdNum = parseInt(contactId);
      
      if (isNaN(contactIdNum)) {
        return reply.code(400).send({ message: "Invalid contact ID" });
      }
      
      const notes = await storage.getCallNotesByContact(userId, contactIdNum);
      return reply.send(notes);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /call-notes/phone/:phone - Get call notes by phone number
  fastify.get('/call-notes/phone/:phone', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const { phone } = request.params as { phone: string };
      const notes = await storage.getCallNotesByPhone(userId, phone);
      return reply.send(notes);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // POST /call-notes - Create new call note
  fastify.post('/call-notes', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const noteData = insertCallNoteSchema.parse(request.body);
      const note = await storage.createCallNote(userId, noteData);
      return reply.send(note);
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // PUT /call-notes/:id - Update call note
  fastify.put('/call-notes/:id', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const { id } = request.params as { id: string };
      const noteId = parseInt(id);
      
      if (isNaN(noteId)) {
        return reply.code(400).send({ message: "Invalid note ID" });
      }
      
      const noteData = insertCallNoteSchema.partial().parse(request.body);
      const note = await storage.updateCallNote(userId, noteId, noteData);
      return reply.send(note);
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // DELETE /call-notes/:id - Delete call note
  fastify.delete('/call-notes/:id', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const { id } = request.params as { id: string };
      const noteId = parseInt(id);
      
      if (isNaN(noteId)) {
        return reply.code(400).send({ message: "Invalid note ID" });
      }
      
      await storage.deleteCallNote(userId, noteId);
      return reply.send({ message: "Call note deleted successfully" });
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // GET /dialer/metrics - Get dialer dashboard metrics
  fastify.get('/dialer/metrics', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const stats = await storage.getCallStats(userId);
      
      return reply.send({
        totalCalls: stats?.totalCalls || 0,
        answeredCalls: stats?.answeredCalls || 0,
        missedCalls: stats?.missedCalls || 0,
        totalDuration: stats?.totalDuration || 0,
        averageDuration: stats?.averageDuration || 0,
        callsToday: 0,
        activeAgents: 0,
        dialsInProgress: 0,
        successRate: 0,
        conversionRate: 0,
        lastUpdated: new Date().toISOString()
      });
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });
}
