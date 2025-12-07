import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { storage } from '../storage';
import { insertMessageSchema } from '@shared/schema';
import { rateLimitConfigs } from './rateLimiters';
import { userTwilioCache } from '../userTwilioService';
import { wsService } from '../websocketService';

/**
 * Helper function to extract userId from JWT token (similar to requireAuth middleware)
 */
async function getUserIdFromJWT(request: FastifyRequest): Promise<number> {
  const auth = (request as any).user;
  
  if (!auth || !auth.sub) {
    throw new Error('Not authenticated');
  }

  const auth0UserId = auth.sub;
  const email = auth['https://app.com/email'] || auth.email || '';
  let username = auth['https://app.com/name'] || auth.name || auth.nickname || '';
  
  if (!username || username.trim() === '') {
    if (email) {
      username = email.split('@')[0];
    } else {
      username = `user_${auth0UserId.split('|')[1] || auth0UserId}`;
    }
  }

  let user = await storage.getUserByAuth0Id(auth0UserId);
  
  if (!user) {
    const firstName = auth.given_name || username;
    const lastName = auth.family_name || '';
    
    try {
      user = await storage.createUser({
        auth0Id: auth0UserId,
        email,
        username,
        firstName,
        lastName,
        password: '',
        role: auth['https://app.com/roles']?.[0] || 'user'
      });
    } catch (createError: any) {
      if (createError.code === '23505' && createError.constraint === 'users_auth0_id_unique') {
        user = await storage.getUserByAuth0Id(auth0UserId);
      } else {
        throw createError;
      }
    }
  }

  if (!user) {
    throw new Error('Failed to create or retrieve user');
  }

  return user.id;
}

/**
 * Messages Management Routes Plugin for Fastify
 * Migrated from Express routes
 */
export default async function messagesRoutes(fastify: FastifyInstance) {
  // GET /messages - Get all messages
  fastify.get('/messages', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = await getUserIdFromJWT(request);
      const messages = await storage.getAllMessages(userId);
      return reply.send(messages);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /messages/contact/:contactId - Get messages by contact
  fastify.get('/messages/contact/:contactId', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = await getUserIdFromJWT(request);
      const { contactId } = request.params as { contactId: string };
      const messages = await storage.getMessagesByContact(userId, parseInt(contactId));
      return reply.send(messages);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /messages/phone/:phone - Get messages by phone
  fastify.get('/messages/phone/:phone', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = await getUserIdFromJWT(request);
      const { phone } = request.params as { phone: string };
      const messages = await storage.getMessagesByPhone(userId, phone);
      return reply.send(messages);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /messages/search - Search messages
  fastify.get('/messages/search', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = await getUserIdFromJWT(request);
      const { q } = request.query as { q?: string };
      if (!q) {
        return reply.code(400).send({ message: "Query parameter 'q' is required" });
      }
      const messages = await storage.searchMessages(userId, q);
      return reply.send(messages);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /messages/unread/count - Get unread message count
  fastify.get('/messages/unread/count', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = await getUserIdFromJWT(request);
      const count = await storage.getUnreadMessageCount(userId);
      return reply.send({ count });
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // PUT /messages/:id/read - Mark message as read
  fastify.put('/messages/:id/read', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = await getUserIdFromJWT(request);
      const { id } = request.params as { id: string };
      const message = await storage.markMessageAsRead(userId, parseInt(id));
      return reply.send(message);
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // POST /messages - Create message (send SMS)
  fastify.post('/messages', {
    config: {
      rateLimit: rateLimitConfigs.sms
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const auth = (request as any).user;
      if (!auth || !auth.sub) {
        return reply.code(401).send({ message: "Not authenticated" });
      }

      const auth0UserId = auth.sub;
      const user = await storage.getUserByAuth0Id(auth0UserId);
      
      if (!user) {
        return reply.code(404).send({ message: "User not found" });
      }

      const { contactId, phone, content, type = "sent" } = request.body as any;
      
      if (!phone || !content) {
        return reply.code(400).send({ message: "Phone number and message content are required" });
      }

      let twilioMessageSid: string | null = null;
      let twilioStatus = 'sent';
      
      try {
        const twilioResponse = await userTwilioCache.sendSms(user.id, phone, content);
        twilioMessageSid = twilioResponse.sid;
        twilioStatus = twilioResponse.status;
        console.log(`📨 SMS sent by user ${user.id} to ${phone}: ${twilioMessageSid}`);
      } catch (twilioError: any) {
        console.error('Twilio SMS error:', twilioError);
        return reply.code(500).send({ 
          message: "Failed to send SMS via Twilio",
          error: twilioError.message 
        });
      }

      const messageData = {
        userId: user.id,
        contactId,
        phone,
        content,
        type,
        status: twilioStatus,
        metadata: { 
          twilioMessageSid,
          userId: user.id,
          sentBy: user.username
        }
      };
      
      const message = await storage.createMessage(user.id, messageData);
      
      wsService.broadcastNewSms(user.id, message);
      
      return reply.send({
        ...message,
        twilioSid: twilioMessageSid,
        twilioStatus
      });
    } catch (error: any) {
      console.error('Message send error:', error);
      return reply.code(400).send({ message: error.message });
    }
  });

  // DELETE /messages/:id - Delete message
  fastify.delete('/messages/:id', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = await getUserIdFromJWT(request);
      const { id } = request.params as { id: string };
      await storage.deleteMessage(userId, parseInt(id));
      return reply.send({ message: "Message deleted successfully" });
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // GET /sms/analytics - Get SMS analytics
  fastify.get('/sms/analytics', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = await getUserIdFromJWT(request);
      const analytics = await storage.getMessageAnalytics(userId);
      return reply.send(analytics);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });
}
