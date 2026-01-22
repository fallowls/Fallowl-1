import { FastifyRequest, FastifyReply } from 'fastify';
import twilio from 'twilio';
import crypto from 'crypto';
import { userTwilioCache } from '../userTwilioService';
import { storage } from '../storage';

export async function validateTwilioWebhook(request: FastifyRequest, reply: FastifyReply) {
  try {
    const signature = (request.headers['x-twilio-signature'] as string) || '';
    
    // Determine protocol: always use HTTPS in production, except for localhost
    let protocol = request.protocol;
    const host = request.hostname || '';
    
    if (!host.includes('localhost') && !host.includes('127.0.0.1')) {
      // Production environment - always use HTTPS
      protocol = 'https';
    }
    
    const url = `${protocol}://${host}${request.url}`;
    
    // Get the call/message SID to determine which user's credentials to use
    const body = request.body as any;
    const { CallSid, MessageSid, From, To, TenantSid } = body;
    
    let userId: number | null = null;
    let tenantId: number | null = null;
    
    // For multi-tenant environments, TenantSid is expected.
    // We must validate that the user associated with the webhook is a member of this tenant.
    if (TenantSid) {
      const tenant = await storage.getTenantBySlug(TenantSid);
      if (tenant) {
        tenantId = tenant.id;
      } else {
        console.error('❌ SECURITY: Invalid TenantSid in webhook - rejecting request');
        return reply.status(403).send({ 
          error: 'Forbidden - Invalid TenantSid',
          details: 'TenantSid from webhook does not correspond to a valid tenant'
        });
      }
    }
    
    // For outbound calls from WebRTC client
    if (From && From.startsWith('client:')) {
      const username = From.replace('client:', '');
      const user = await storage.getUserByUsername(username);
      if (user) userId = user.id;
    }
    
    // For incoming calls, lookup user by the phone number being called
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
    
    // For calls with SID, find the user from call record using direct SID lookup
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
    
    // For messages with SID, find the user from message record using direct SID lookup
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
    
    // Try to extract userId from webhook URL token parameter as fallback
    const query = request.query as any;
    let tokenValidated = false;
    if (!userId && query.token) {
      if (!process.env.ENCRYPTION_KEY) {
        console.error('❌ ENCRYPTION_KEY not set - cannot verify webhook token');
        return reply.status(500).send({ 
          error: 'Server configuration error',
          details: 'ENCRYPTION_KEY must be set' 
        });
      }
      
      try {
        const [timestamp, userIdStr, tokenSignature] = String(query.token).split(':');
        const expectedSignature = crypto
          .createHmac('sha256', process.env.ENCRYPTION_KEY)
          .update(`${timestamp}:${userIdStr}`)
          .digest('hex');
        
        // SECURITY: Reduced from 30 days to 24 hours to limit replay attack window
        const tokenMaxAge = 24 * 60 * 60 * 1000; // 24 hours
        if (tokenSignature === expectedSignature && Date.now() - parseInt(timestamp) < tokenMaxAge) {
          userId = parseInt(userIdStr);
          tokenValidated = true;
          console.log('✅ User identified from webhook token (24hr TTL):', userId);
        } else {
          console.error('❌ Invalid or expired webhook token');
          return reply.status(403).send({ 
            error: 'Forbidden - Invalid webhook token',
            details: 'Token signature mismatch or token expired (24hr limit)'
          });
        }
      } catch (error) {
        console.error('❌ Failed to parse webhook token:', error);
        return reply.status(403).send({ 
          error: 'Forbidden - Malformed webhook token',
          details: 'Token format invalid'
        });
      }
    }
    
    // SECURITY: Reject webhooks when userId cannot be determined
    if (!userId) {
      console.error('❌ SECURITY: Could not determine userId for webhook validation - rejecting request');
      console.error('❌ URL:', request.url);
      console.error('❌ Body:', JSON.stringify(body).substring(0, 200));
      return reply.status(403).send({ 
        error: 'Forbidden - Cannot validate webhook without user context',
        details: 'Webhook must include valid token parameter or identifiable user information'
      });
    }

    // MULTI-TENANT SECURITY: If tenant context is present, validate user membership.
    if (tenantId) {
      const membership = await storage.getTenantMembership(tenantId, userId);
      if (!membership) {
        console.error(`❌ SECURITY: User ${userId} is not a member of tenant ${tenantId} - rejecting webhook`);
        return reply.status(403).send({
          error: 'Forbidden - User not a member of the specified tenant',
          details: 'The user identified does not have access to the tenant specified in the webhook'
        });
      }
      console.log(`✅ User ${userId} is a valid member of tenant ${tenantId}`);
    }
    
    // SECURITY: Validate Twilio signature when possible (defense in depth)
    // Token-only validation is allowed for TwiML flows where URL includes token parameter
    // This is necessary because Twilio's signature fails when query params are in the webhook URL
    const { credentials } = await userTwilioCache.getTwilioClient(userId);
    
    // Validate signature using user's auth token
    const isValid = twilio.validateRequest(
      credentials.authToken,
      signature,
      url,
      body
    );
    
    if (!isValid) {
      // If token was validated, allow it (TwiML flow with token in URL)
      // Otherwise, reject the invalid signature
      if (tokenValidated) {
        console.log('⚠️ Twilio signature validation skipped - using validated token (TwiML flow)');
        return;
      }
      
      console.error('❌ Invalid Twilio webhook signature for user:', userId);
      console.error('❌ URL:', url);
      console.error('❌ Signature:', signature.substring(0, 20) + '...');
      return reply.status(403).send('Forbidden - Invalid Twilio signature');
    }
    
    console.log('✅ Twilio webhook signature validated for user:', userId);
    
    // Attach userId to request for use in controller
    (request as any).webhookUserId = userId;
    
  } catch (error: any) {
    console.error('❌ Webhook validation error:', error);
    // SECURITY: Reject webhooks when validation fails to prevent potential attacks
    return reply.status(403).send({ 
      error: 'Forbidden - Webhook validation failed',
      details: error.message 
    });
  }
}
