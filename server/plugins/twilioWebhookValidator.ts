import type { FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';
import crypto from 'crypto';
import twilio from 'twilio';
import { storage } from '../storage';

/**
 * Twilio Webhook Validator for Fastify
 * Handles signature validation and user identification
 */

// Helper function to generate signed webhook tokens
export function generateWebhookToken(userId: number): string {
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY environment variable must be set to generate secure webhook tokens');
  }
  
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac('sha256', process.env.ENCRYPTION_KEY)
    .update(`${timestamp}:${userId}`)
    .digest('hex');
  return `${timestamp}:${userId}:${signature}`;
}

// Helper function to verify and decode webhook tokens
export function verifyWebhookToken(token: string): number {
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY environment variable must be set');
  }
  
  const parts = token.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid webhook token format');
  }
  
  const [timestamp, userIdStr, signature] = parts;
  const userId = parseInt(userIdStr);
  
  if (isNaN(userId)) {
    throw new Error('Invalid user ID in token');
  }
  
  // Verify signature
  const expectedSignature = crypto
    .createHmac('sha256', process.env.ENCRYPTION_KEY)
    .update(`${timestamp}:${userId}`)
    .digest('hex');
  
  if (signature !== expectedSignature) {
    throw new Error('Invalid webhook token signature');
  }
  
  // Check token age (24 hours)
  const tokenAge = Date.now() - parseInt(timestamp);
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  if (tokenAge > maxAge) {
    throw new Error('Webhook token expired');
  }
  
  return userId;
}

// Fastify preHandler hook for Twilio webhook validation
export const validateTwilioWebhook: preHandlerHookHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const signature = request.headers['x-twilio-signature'] as string || '';
    
    // Determine protocol
    let protocol = (request.headers['x-forwarded-proto'] as string) || 'http';
    const host = request.headers.host || '';
    
    if (!host.includes('localhost') && !host.includes('127.0.0.1')) {
      protocol = 'https';
    }
    
    const url = `${protocol}://${host}${request.url}`;
    
    // Get body params
    const body = request.body as any || {};
    const { CallSid, MessageSid, From, To } = body;
    
    let userId: number | null = null;
    
    // For outbound calls from WebRTC client
    if (From && From.startsWith('client:')) {
      const username = From.replace('client:', '');
      const user = await storage.getUserByUsername(username);
      if (user) userId = user.id;
    }
    
    // For incoming calls, lookup user by phone number
    if (!userId && To && !From?.startsWith('client:')) {
      try {
        const user = await storage.getUserByTwilioPhoneNumber(To);
        if (user) {
          userId = user.id;
          console.log('✅ User identified from incoming call to phone number:', To, 'User:', userId);
        }
      } catch (error) {
        console.error('⚠️ Failed to lookup user by phone number:', error);
      }
    }
    
    // For calls with SID
    if (!userId && CallSid) {
      try {
        const call = await storage.getCallByTwilioSid(CallSid);
        if (call) {
          userId = call.userId;
          console.log('✅ User identified from CallSid:', userId);
        }
      } catch (error) {
        console.error('⚠️ Failed to lookup call by SID:', error);
      }
    }
    
    // For messages with SID
    if (!userId && MessageSid) {
      try {
        const message = await storage.getMessageByTwilioSid(MessageSid);
        if (message) {
          userId = message.userId;
          console.log('✅ User identified from MessageSid:', userId);
        }
      } catch (error) {
        console.error('⚠️ Failed to lookup message by SID:', error);
      }
    }
    
    // Try to extract userId from webhook token
    if (!userId && request.query && (request.query as any).token) {
      if (!process.env.ENCRYPTION_KEY) {
        return reply.code(500).send({ 
          error: 'Server configuration error',
          details: 'ENCRYPTION_KEY must be set' 
        });
      }
      
      try {
        userId = verifyWebhookToken((request.query as any).token);
        console.log('✅ User identified from webhook token (24hr TTL):', userId);
      } catch (error) {
        console.error('❌ Invalid or expired webhook token:', error);
        return reply.code(403).send({ 
          error: 'Forbidden - Invalid webhook token',
          details: error instanceof Error ? error.message : 'Token validation failed'
        });
      }
    }
    
    // SECURITY: Reject webhooks when userId cannot be determined
    if (!userId) {
      console.error('❌ SECURITY: Could not determine userId for webhook validation');
      return reply.code(403).send({ 
        error: 'Forbidden - Cannot validate webhook without user context',
        details: 'Webhook must include valid token parameter or identifiable user information'
      });
    }
    
    // Attach userId to request
    (request as any).userId = userId;
    
    // Get user's Twilio credentials for signature validation
    const userCredentials = await storage.getUserTwilioCredentials(userId);
    if (!userCredentials || !userCredentials.twilioAuthToken) {
      console.error('❌ Twilio auth token not found for user:', userId);
      return reply.code(403).send({ 
        error: 'Forbidden - Twilio credentials not configured'
      });
    }
    
    // Validate Twilio signature
    const isValid = twilio.validateRequest(
      userCredentials.twilioAuthToken,
      signature,
      url,
      body
    );
    
    if (!isValid) {
      console.error('❌ Invalid Twilio signature');
      return reply.code(403).send({ 
        error: 'Forbidden - Invalid Twilio signature'
      });
    }
    
    console.log('✅ Twilio webhook validated for user:', userId);
  } catch (error: any) {
    console.error('❌ Twilio webhook validation error:', error);
    return reply.code(500).send({ 
      error: 'Webhook validation error',
      details: error.message
    });
  }
};
