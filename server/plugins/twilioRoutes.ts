import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import twilio from 'twilio';
import { z } from 'zod';
import { storage } from '../storage';
import { userTwilioCache, clearTwilioCacheOnLogout } from '../userTwilioService';
import { wsService } from '../websocketService';
import { rateLimitConfigs } from './rateLimiters';

// Helper to get userId from request
function getUserIdFromRequest(request: FastifyRequest): number {
  return (request as any).userId;
}
import type { Twilio } from 'twilio';

interface HasUserId {
  userId?: number;
}
const auth0Domain = process.env.VITE_AUTH0_DOMAIN || process.env.AUTH0_DOMAIN;
if (!auth0Domain) {
  console.warn('⚠️ AUTH0_DOMAIN or VITE_AUTH0_DOMAIN is not set. Token verification may fail.');
}
const auth0Audience = process.env.VITE_AUTH0_AUDIENCE || process.env.AUTH0_AUDIENCE;

// Use current origin but log it for debugging
const getBaseUrl = (request: FastifyRequest) => {
  if (process.env.REPLIT_DOMAINS) {
    return `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`;
  }
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  return `${request.protocol}://${request.hostname}`;
};

/**
 * Twilio Integration Routes Plugin for Fastify
 * Handles all Twilio-related endpoints including webhooks, credentials management, and call handling
 */
export default async function twilioRoutes(fastify: FastifyInstance) {
  
  // ============================================================================
  // USER TWILIO CREDENTIALS MANAGEMENT
  // ============================================================================
  
  // POST /user/twilio/credentials - Save Twilio credentials
  fastify.post('/user/twilio/credentials', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: [fastify.requireAuth]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.userId!;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return reply.code(404).send({ message: "User not found" });
      }

      const { accountSid, authToken, apiKeySid, apiKeySecret, phoneNumber, twimlAppSid } = request.body as any;

      if (!accountSid || !authToken || !phoneNumber) {
        return reply.code(400).send({ message: "Account SID, Auth Token, and Phone Number are required" });
      }

      // Validate credentials before saving
      console.log(`🔐 Validating Twilio credentials for user ${user.id}...`);
      try {
        const testClient = twilio(accountSid, authToken);
        await testClient.api.v2010.accounts(accountSid).fetch();
        console.log(`✅ Twilio credentials validated successfully for user ${user.id}`);
      } catch (validationError: any) {
        console.error('❌ Twilio credential validation failed:', validationError.message);
        return reply.code(401).send({ 
          message: "Invalid Twilio credentials. Please check your Account SID and Auth Token.",
          error: validationError.message,
          code: 'AUTHENTICATION_ERROR'
        });
      }

      // Update user's Twilio credentials
      await storage.updateUserTwilioCredentials(user.id, {
        twilioAccountSid: accountSid,
        twilioAuthToken: authToken,
        twilioApiKeySid: apiKeySid,
        twilioApiKeySecret: apiKeySecret,
        twilioPhoneNumber: phoneNumber,
        twilioTwimlAppSid: twimlAppSid,
        twilioConfigured: true
      });

      clearTwilioCacheOnLogout(user.id);
      console.log(`✅ Twilio credentials saved for user ${user.id}`);

      // Resolve tenant for the user
      const membership = await storage.ensureDefaultTenant(user.id);
      const tenantId = membership.tenantId;

      // Auto-create TwiML Application if not provided
      let finalTwimlAppSid = twimlAppSid;
      if (!twimlAppSid) {
        try {
          console.log(`📱 Auto-creating TwiML Application for user ${user.id}...`);
          const baseUrl = getBaseUrl(request);
          
          const application = await userTwilioCache.createTwiMLApplication(user.id, baseUrl);
          finalTwimlAppSid = application.sid;
          console.log(`✅ TwiML Application auto-created: ${finalTwimlAppSid}`);
        } catch (twimlError: any) {
          console.error('TwiML Application creation failed:', twimlError);
        }
      }

      // Configure phone number's voiceUrl for incoming calls
      try {
        console.log(`📞 Configuring incoming call webhook for phone number ${phoneNumber}...`);
        const baseUrl = getBaseUrl(request);
        
        const twilioClient = twilio(accountSid, authToken);
        const phoneNumbers = await twilioClient.incomingPhoneNumbers.list({
          phoneNumber: phoneNumber
        });
        
        if (phoneNumbers.length === 0) {
          console.warn(`⚠️ Phone number ${phoneNumber} not found in Twilio account`);
        } else {
          await twilioClient.incomingPhoneNumbers(phoneNumbers[0].sid).update({
            voiceUrl: `${baseUrl}/api/twilio/voice`,
            voiceMethod: 'POST',
            statusCallback: `${baseUrl}/api/twilio/status`,
            statusCallbackMethod: 'POST'
          });
          
          console.log(`✅ Phone number ${phoneNumber} configured for incoming calls`);
        }
      } catch (phoneConfigError: any) {
        console.error('⚠️ Phone number webhook configuration failed:', phoneConfigError.message);
      }

      return reply.send({
        message: "Twilio credentials saved successfully",
        configured: true,
        twimlAppSid: finalTwimlAppSid
      });
    } catch (error: any) {
      console.error('Error saving Twilio credentials:', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /user/twilio/credentials - Get Twilio credentials
  fastify.get('/user/twilio/credentials', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: [fastify.requireAuth]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.userId!;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return reply.code(404).send({ message: "User not found" });
      }

      try {
        const { client, credentials } = await userTwilioCache.getTwilioClient(user.id);
        
        let webhookUrls = null;
        if (credentials.twimlAppSid) {
          try {
            const twimlApp = await client.applications(credentials.twimlAppSid).fetch();
            webhookUrls = {
              voiceUrl: twimlApp.voiceUrl,
              voiceMethod: twimlApp.voiceMethod,
              statusCallback: twimlApp.statusCallback,
              statusCallbackMethod: twimlApp.statusCallbackMethod
            };
          } catch (error) {
            console.error(`Failed to fetch TwiML App details for user ${user.id}:`, error);
          }
        }
        
        return reply.send({
          configured: true,
          credentials: {
            accountSid: credentials.accountSid ? `${credentials.accountSid.slice(0, 10)}...` : null,
            phoneNumber: credentials.phoneNumber,
            hasApiKey: !!credentials.apiKeySid,
            twimlAppSid: credentials.twimlAppSid,
            webhookUrls
          }
        });
      } catch (error: any) {
        return reply.send({
          configured: false,
          credentials: null
        });
      }
    } catch (error: any) {
      console.error('Error fetching Twilio credentials:', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  // DELETE /user/twilio/credentials - Delete Twilio credentials
  fastify.delete('/user/twilio/credentials', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
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

      await storage.updateUserTwilioCredentials(user.id, {
        twilioAccountSid: undefined,
        twilioAuthToken: undefined,
        twilioApiKeySid: undefined,
        twilioApiKeySecret: undefined,
        twilioPhoneNumber: undefined,
        twilioTwimlAppSid: undefined,
        twilioConfigured: false
      });

      clearTwilioCacheOnLogout(user.id);
      console.log(`✅ Twilio credentials removed for user ${user.id}`);

      return reply.send({
        message: "Twilio credentials removed successfully",
        configured: false
      });
    } catch (error: any) {
      console.error('Error removing Twilio credentials:', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /user/twilio/status - Get Twilio status
  fastify.get('/user/twilio/status', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        return reply.code(401).send({ message: "No Authorization was found in request.headers" });
      }
    }
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

      try {
        const { credentials } = await userTwilioCache.getTwilioClient(user.id);
        const connectionStatus = await userTwilioCache.getConnectionStatus(user.id);

        return reply.send({
          userId: user.id,
          isConfigured: true,
          hasCredentials: true,
          phoneNumber: credentials.phoneNumber,
          hasTwimlApp: !!credentials.twimlAppSid,
          hasApiKey: !!credentials.apiKeySid,
          status: connectionStatus.isConnected ? 'ready' : 'error',
          isValid: connectionStatus.isConnected,
          lastCheck: connectionStatus.lastCheck.toISOString()
        });
      } catch (error: any) {
        return reply.send({
          userId: user.id,
          isConfigured: false,
          hasCredentials: false,
          phoneNumber: null,
          status: 'not_configured',
          message: 'Twilio credentials not configured for this user'
        });
      }
    } catch (error: any) {
      console.error('Error checking Twilio status:', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  // ============================================================================
  // TWILIO TOKEN & STATUS
  // ============================================================================

  // GET /twilio/access-token - Generate access token
  fastify.get('/twilio/access-token', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
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

      const baseUrl = process.env.REPLIT_DOMAINS 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : (request.hostname && !request.hostname.includes('localhost')) 
          ? `https://${request.hostname}`
          : undefined;

      const accessToken = await userTwilioCache.generateAccessToken(user.id, user.username, baseUrl);
      
      console.log(`✅ Generated access token for user ${user.id}`);
      return reply.send({ 
        accessToken,
        expiresIn: 3600,
        identity: user.username 
      });
    } catch (error: any) {
      console.error('Token generation error:', error);
      return reply.code(500).send({ 
        message: error.message,
        code: error.code || 'TOKEN_GENERATION_FAILED'
      });
    }
  });

  // GET /twilio/status - Get Twilio status
  fastify.get('/twilio/status', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        return reply.code(401).send({ message: "No Authorization was found in request.headers" });
      }
    }
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

      const connectionStatus = await userTwilioCache.getConnectionStatus(user.id);
      const { credentials } = await userTwilioCache.getTwilioClient(user.id);
      
      return reply.send({
        isConfigured: connectionStatus.diagnostics.hasCredentials,
        hasCredentials: connectionStatus.diagnostics.hasCredentials,
        phoneNumber: credentials?.phoneNumber || null,
        connection: connectionStatus,
        lastHealthCheck: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('Status check error:', error);
      return reply.code(500).send({ 
        message: error.message,
        code: error.code || 'STATUS_CHECK_FAILED'
      });
    }
  });

  // POST /twilio/test-connection - Test Twilio connection
  fastify.post('/twilio/test-connection', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
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

      const connectionStatus = await userTwilioCache.getConnectionStatus(user.id);
      const { credentials } = await userTwilioCache.getTwilioClient(user.id);
      
      return reply.send({
        connected: connectionStatus.isConnected,
        status: connectionStatus.accountStatus,
        diagnostics: connectionStatus.diagnostics,
        lastCheck: connectionStatus.lastCheck,
        phoneNumber: credentials?.phoneNumber || null,
        twimlAppSid: credentials?.twimlAppSid || null
      });
    } catch (error: any) {
      console.error('Connection test error:', error);
      return reply.code(500).send({ 
        message: error.message,
        code: error.code || 'CONNECTION_TEST_FAILED'
      });
    }
  });

  // POST /twilio/refresh-token - Refresh access token
  fastify.post('/twilio/refresh-token', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
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

      const baseUrl = process.env.REPLIT_DOMAINS 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : (request.hostname && !request.hostname.includes('localhost')) 
          ? `https://${request.hostname}`
          : undefined;

      const accessToken = await userTwilioCache.generateAccessToken(user.id, user.username, baseUrl);
      
      console.log(`✅ Refreshed access token for user ${user.id} (${user.username})`);
      return reply.send({ 
        accessToken,
        expiresIn: 3600,
        identity: user.username 
      });
    } catch (error: any) {
      console.error('Token refresh error:', error);
      return reply.code(500).send({ 
        message: error.message,
        code: error.code || 'TOKEN_REFRESH_FAILED'
      });
    }
  });

  // ============================================================================
  // TWIML APPLICATION MANAGEMENT
  // ============================================================================

  // POST /twilio/create-twiml-app - Create TwiML application
  fastify.post('/twilio/create-twiml-app', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
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

      const baseUrl = getBaseUrl(request);
      console.log(`Creating TwiML Application for user ${user.id} with base URL:`, baseUrl);
      
      const application = await userTwilioCache.createTwiMLApplication(user.id, baseUrl);

      return reply.send({
        success: true,
        application: {
          sid: application.sid,
          friendlyName: application.friendlyName,
          voiceUrl: application.voiceUrl,
          statusCallback: application.statusCallback
        }
      });
    } catch (error: any) {
      console.error('Create TwiML application error:', error);
      return reply.code(500).send({ 
        message: error.message,
        code: error.code || 'TWIML_APP_CREATION_FAILED'
      });
    }
  });

  // POST /twilio/update-twiml-app-webhooks - Update TwiML application webhooks
  fastify.post('/twilio/update-twiml-app-webhooks', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
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

      const baseUrl = getBaseUrl(request);
      
      console.log(`🔄 Updating TwiML App webhooks for user ${user.id} with base URL:`, baseUrl);
      
      const { client, credentials } = await userTwilioCache.getTwilioClient(user.id);
      
      if (!credentials.twimlAppSid) {
        return reply.code(400).send({ 
          message: "No TwiML Application found. Please create one first.",
          code: 'NO_TWIML_APP'
        });
      }
      
      const updatedApp = await client.applications(credentials.twimlAppSid).update({
        voiceUrl: `${baseUrl}/api/twilio/voice`,
        voiceMethod: 'POST',
        smsUrl: `${baseUrl}/api/twilio/sms`,
        smsMethod: 'POST',
        statusCallback: `${baseUrl}/api/twilio/status`,
        statusCallbackMethod: 'POST'
      });
      
      console.log(`✅ Updated TwiML App ${credentials.twimlAppSid} for user ${user.id}`);
      
      return reply.send({
        success: true,
        message: "TwiML Application webhooks updated successfully",
        application: {
          sid: updatedApp.sid,
          friendlyName: updatedApp.friendlyName,
          voiceUrl: updatedApp.voiceUrl,
          smsUrl: updatedApp.smsUrl,
          statusCallback: updatedApp.statusCallback
        }
      });
    } catch (error: any) {
      console.error('Update TwiML application webhooks error:', error);
      return reply.code(500).send({ 
        message: error.message,
        code: error.code || 'TWIML_APP_UPDATE_FAILED'
      });
    }
  });

  // POST /twilio/configure-phone-webhook - Configure phone number webhook
  fastify.post('/twilio/configure-phone-webhook', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
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

      const baseUrl = getBaseUrl(request);
      
      console.log(`📞 Configuring phone number webhook for user ${user.id}...`);
      
      const { client, credentials } = await userTwilioCache.getTwilioClient(user.id);
      
      if (!credentials.phoneNumber) {
        return reply.code(400).send({ 
          message: "No phone number configured. Please save your Twilio credentials first.",
          code: 'NO_PHONE_NUMBER'
        });
      }
      
      const phoneNumbers = await client.incomingPhoneNumbers.list({
        phoneNumber: credentials.phoneNumber
      });
      
      if (phoneNumbers.length === 0) {
        return reply.code(404).send({ 
          message: `Phone number ${credentials.phoneNumber} not found in your Twilio account`,
          code: 'PHONE_NUMBER_NOT_FOUND'
        });
      }
      
      const updatedNumber = await client.incomingPhoneNumbers(phoneNumbers[0].sid).update({
        voiceUrl: `${baseUrl}/api/twilio/voice`,
        voiceMethod: 'POST',
        statusCallback: `${baseUrl}/api/twilio/status`,
        statusCallbackMethod: 'POST'
      });
      
      console.log(`✅ Phone number ${credentials.phoneNumber} configured for incoming calls`);
      
      return reply.send({
        success: true,
        message: "Phone number webhook configured successfully for incoming calls",
        phoneNumber: {
          sid: updatedNumber.sid,
          phoneNumber: updatedNumber.phoneNumber,
          voiceUrl: updatedNumber.voiceUrl,
          voiceMethod: updatedNumber.voiceMethod,
          statusCallback: updatedNumber.statusCallback
        }
      });
    } catch (error: any) {
      console.error('Configure phone webhook error:', error);
      return reply.code(500).send({ 
        message: error.message,
        code: error.code || 'PHONE_WEBHOOK_CONFIG_FAILED'
      });
    }
  });

  // ============================================================================
  // WEBHOOK ROUTES (with Twilio signature validation)
  // ============================================================================

  // Main Voice webhook endpoint - handles both inbound and outbound calls
  fastify.post('/twilio/voice', {
    config: {
      rateLimit: rateLimitConfigs.webhook
    },
    preHandler: validateTwilioWebhook
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { From, To, CallSid, Direction, Caller } = request.body as any;
      
      console.log('🎯 Voice webhook called:', {
        From, To, CallSid, Direction, Caller
      });
      
      // Determine call type
      const isOutbound = From && From.startsWith('client:');
      
      if (isOutbound) {
        // Handle outbound call from WebRTC client
        const userId = From.replace('client:', '');
        
        // Get user's phone number for caller ID
        const user = await storage.getUserByUsername(userId);
        if (!user) {
          throw new Error(`User not found: ${userId}`);
        }
        
        // Get user's Twilio credentials via cache (ensures proper isolation)
        const { credentials } = await userTwilioCache.getTwilioClient(user.id);
        const callerIdNumber = credentials.phoneNumber;
        
        // Format destination number
        const formattedTo = To.startsWith('+') ? To : `+${To}`;
        
        // Create call record in database
        const metadataObj = { twilioCallSid: CallSid };
        const membership = await storage.ensureDefaultTenant(user.id);
        const tenantId = membership.tenantId;

        const callRecord = await storage.createCall(tenantId, user.id, {
          userId: user.id,
          phone: formattedTo,
          type: 'outgoing',
          status: 'initiated',
          duration: 0,
          cost: '0.00',
          callQuality: null,
          contactId: null,
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
          sipCallId: CallSid,
          conferenceId: null,
          recordingUrl: null,
          customFields: {},
          metadata: metadataObj
        });
        
        wsService.broadcastNewCall(user.id, callRecord);
        
        // Generate TwiML for outbound call
        const baseUrl = process.env.REPLIT_DOMAINS 
          ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
          : `https://${request.hostname}`;
        
        // Check if auto-recording is enabled for this user
        let autoRecordEnabled = false;
        if (user) {
          const setting = await storage.getSetting(`auto_record_calls_user_${user.id}`);
          autoRecordEnabled = setting?.value === true || setting?.value === "true";
          console.log(`📊 Outbound call - Auto-recording for user ${user.id}: ${autoRecordEnabled}`);
        }
        
        // Use Twilio SDK's VoiceResponse for proper XML escaping
        const VoiceResponse = twilio.twiml.VoiceResponse;
        const twimlResponse = new VoiceResponse();
        
        const dialOptions: any = {
          callerId: callerIdNumber,
          timeout: 120,
          hangupOnStar: false,
          timeLimit: 14400,
          action: `${baseUrl}/api/twilio/dial-status`,
          method: 'POST',
          statusCallback: `${baseUrl}/api/twilio/status`,
          statusCallbackEvent: 'initiated ringing in-progress answered completed',
          statusCallbackMethod: 'POST'
        };
        
        // Only add recording attributes if auto-recording is enabled
        if (autoRecordEnabled) {
          dialOptions.record = 'record-from-answer-dual';
          dialOptions.recordingStatusCallback = `${baseUrl}/api/twilio/recording-status`;
        }
        
        const dial = twimlResponse.dial(dialOptions);
        dial.number(formattedTo);
        
        console.log('📞 Outbound call TwiML generated:', twimlResponse.toString());
        reply.header('Content-Type', 'text/xml');
        return reply.send(twimlResponse.toString());
      } else {
        // Handle incoming call to Twilio number - find which user owns this number
        const incomingUser = await storage.getUserByTwilioPhoneNumber(To);
        
        if (!incomingUser) {
          console.error(`❌ No user found with Twilio number: ${To}`);
          throw new Error(`No user configured for phone number ${To}`);
        }
        
        console.log(`📞 Incoming call to ${To} belongs to user ${incomingUser.id} (${incomingUser.username})`);
        
        // Create call record in database for this user
        const metadataObj = { twilioCallSid: CallSid };
        const membership = await storage.ensureDefaultTenant(incomingUser.id);
        const tenantId = membership.tenantId;

        const callRecord = await storage.createCall(tenantId, incomingUser.id, {
          userId: incomingUser.id,
          phone: From,
          type: 'incoming',
          status: 'initiated',
          duration: 0,
          cost: '0.00',
          callQuality: null,
          contactId: null,
          tags: [],
          priority: 'normal',
          sentiment: 'neutral',
          callPurpose: 'incoming',
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
          sipCallId: CallSid,
          conferenceId: null,
          recordingUrl: null,
          customFields: {},
          metadata: metadataObj
        });
        
        wsService.broadcastNewCall(incomingUser.id, callRecord);
        
        // Route incoming call to the correct user's WebRTC client
        let autoRecordEnabled = false;
        const setting = await storage.getSetting(`auto_record_calls_user_${incomingUser.id}`);
        autoRecordEnabled = setting?.value === true || setting?.value === "true";
        console.log(`📊 Incoming call - Auto-recording for user ${incomingUser.id}: ${autoRecordEnabled}`);
        
        const baseUrl = process.env.REPLIT_DOMAINS 
          ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
          : `https://${request.hostname}`;
        
        // Use Twilio SDK's VoiceResponse for proper XML escaping
        const VoiceResponse = twilio.twiml.VoiceResponse;
        const twimlResponse = new VoiceResponse();
        
        const dialOptions: any = {
          timeout: 30,
          action: `${baseUrl}/api/twilio/dial-status`,
          method: 'POST',
          statusCallback: `${baseUrl}/api/twilio/status`,
          statusCallbackEvent: 'initiated ringing in-progress answered completed',
          statusCallbackMethod: 'POST'
        };
        
        if (autoRecordEnabled) {
          dialOptions.record = 'record-from-answer-dual';
          dialOptions.recordingStatusCallback = `${baseUrl}/api/twilio/recording-status`;
        }
        
        // Route to the user's WebRTC client identity (their username)
        const dial = twimlResponse.dial(dialOptions);
        dial.client(incomingUser.username);
        
        console.log(`📞 Incoming call routed to WebRTC client: ${incomingUser.username}`);
        reply.header('Content-Type', 'text/xml');
        return reply.send(twimlResponse.toString());
      }
    } catch (error: any) {
      console.error('Voice webhook error:', error);
      
      // Determine error message based on error type
      let errorMessage = "There was an error processing your call.";
      
      if (error.message?.includes('No user found') || error.message?.includes('No user configured')) {
        errorMessage = "This phone number is not configured. Please contact your administrator.";
      } else if (error.message?.includes('Twilio credentials')) {
        errorMessage = "Twilio credentials are not properly configured. Please contact your administrator.";
      } else if (error.message?.includes('User not found')) {
        errorMessage = "User account not found. Please contact your administrator.";
      }
      
      // Return descriptive TwiML error response using SDK for proper XML escaping
      const VoiceResponse = twilio.twiml.VoiceResponse;
      const twimlResponse = new VoiceResponse();
      twimlResponse.say({ voice: 'alice' }, errorMessage);
      twimlResponse.hangup();
      
      reply.header('Content-Type', 'text/xml');
      return reply.send(twimlResponse.toString());
    }
  });

  // Parallel Dialer Voice webhook - connects answered calls to agent's browser via conference
  fastify.post('/twilio/voice/parallel-dialer', {
    config: {
      rateLimit: rateLimitConfigs.webhook
    },
    preHandler: validateTwilioWebhook
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as any;
      const query = request.query as any;
      const { CallSid, From, To, AnsweredBy } = body;
      const token = query.token as string;
      const lineId = query.lineId as string;
      const name = query.name as string;
      const userId = query.userId ? parseInt(query.userId as string) : null;
      
      console.log('🎯 Parallel Dialer Voice webhook called:', {
        CallSid, From, To, AnsweredBy, lineId, name, userId, hasToken: !!token
      });
      
      if (!token) {
        throw new Error('Missing webhook token');
      }
      
      // Verify and decode the webhook token to get userId (fallback if not in query)
      const verifiedUserId = userId || verifyWebhookToken(token);
      
      // Get user details
      const user = await storage.getUser(verifiedUserId);
      if (!user) {
        throw new Error(`User not found: ${verifiedUserId}`);
      }
      
      // Get user's Twilio credentials
      const { credentials } = await userTwilioCache.getTwilioClient(verifiedUserId);
      
      // Check if AMD detected a machine
      const normalized = (AnsweredBy || '').toLowerCase();
      const isMachine = normalized.startsWith('machine') || normalized === 'fax';
      const isHuman = normalized === 'human';
      
      if (isMachine) {
        console.log(`🤖 Answering machine detected for call ${CallSid}, hanging up`);
        
        const VoiceResponse = twilio.twiml.VoiceResponse;
        const twimlResponse = new VoiceResponse();
        twimlResponse.hangup();
        
        reply.header('Content-Type', 'text/xml');
        return reply.send(twimlResponse.toString());
      }
      
      // CALL QUEUE MANAGEMENT: Track primary call and queue secondary human answers
      let isPrimaryCall = false;
      if (isHuman && lineId) {
        console.log(`🎯 Human detected on line ${lineId}`);
        
        try {
          const primaryCallSetting = await storage.getSetting(`parallel_dialer_primary_call_${verifiedUserId}`);
          
          if (!primaryCallSetting || !primaryCallSetting.value) {
            await storage.setSetting(`parallel_dialer_primary_call_${verifiedUserId}`, {
              lineId,
              callSid: CallSid,
              timestamp: Date.now(),
              inConference: false
            });
            
            isPrimaryCall = true;
            console.log(`✅ Marked line ${lineId} as primary call`);
            
            wsService.broadcastToUser(verifiedUserId, 'parallel_dialer_primary_connected', {
              lineId,
              callSid: CallSid
            });
          } else {
            console.log(`🔄 Secondary human-answered call detected on line ${lineId} - queueing on HOLD`);
            
            await storage.setSetting(`parallel_dialer_secondary_call_${verifiedUserId}_${lineId}`, {
              lineId,
              callSid: CallSid,
              timestamp: Date.now(),
              onHold: true,
              name: name || 'Unknown',
              phone: To
            });
          }
        } catch (error: any) {
          console.error('Error in call queue management:', error);
          isPrimaryCall = true;
        }
      }
      
      // Check if there's an active conference
      const conferenceSetting = await storage.getSetting(`parallel_dialer_conference_${verifiedUserId}`);
      let conferenceData: any = conferenceSetting?.value || null;
      
      // Validate conference is still active
      if (conferenceData && conferenceData.status === 'active') {
        const conferenceAge = Date.now() - (conferenceData.startTime || 0);
        if (conferenceAge > 10 * 60 * 1000) {
          console.warn(`⚠️ Conference expired, cleaning up`);
          await storage.setSetting(`parallel_dialer_conference_${verifiedUserId}`, null);
          await storage.setSetting(`parallel_dialer_primary_call_${verifiedUserId}`, null);
          for (let i = 0; i < 10; i++) {
            await storage.setSetting(`parallel_dialer_secondary_call_${verifiedUserId}_line-${i}`, null);
          }
          conferenceData = null;
        }
      }
      
      const baseUrl = process.env.REPLIT_DOMAINS 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : `https://${request.hostname}`;
      
      const webhookToken = generateWebhookToken(verifiedUserId);
      
      // Check if auto-recording is enabled
      let autoRecordEnabled = true;
      const setting = await storage.getSetting(`auto_record_calls_user_${user.id}`);
      autoRecordEnabled = setting?.value === true || setting?.value === "true" || setting?.value === undefined;
      
      // Check if pre-recorded greeting is enabled
      const greetingSetting = await storage.getSetting(`parallel_dialer_greeting`);
      const greetingUrl = greetingSetting?.value as string | undefined;
      
      const VoiceResponse = twilio.twiml.VoiceResponse;
      const twimlResponse = new VoiceResponse();
      
      // Add optional greeting
      if (greetingUrl && greetingUrl.trim().length > 0) {
        twimlResponse.play(greetingUrl);
        console.log(`🎵 Playing pre-recorded greeting for call ${CallSid}`);
      }
      
      // Check if this is a secondary call that should be put on HOLD
      const secondaryCallSetting = await storage.getSetting(`parallel_dialer_secondary_call_${verifiedUserId}_${lineId}`);
      const isSecondaryCall = secondaryCallSetting && secondaryCallSetting.value && (secondaryCallSetting.value as any).onHold;
      
      if (isSecondaryCall) {
        console.log(`🔇 Secondary call ${CallSid} on line ${lineId} - putting on HOLD`);
        
        twimlResponse.say({ voice: 'alice' }, 'Please hold while we connect you.');
        twimlResponse.play({ loop: 0 }, 'http://com.twilio.sounds.music.s3.amazonaws.com/MARKOVICHAMP-Borghestral.mp3');
        
        wsService.broadcastToUser(verifiedUserId, 'parallel_dialer_call_on_hold', {
          lineId,
          callSid: CallSid,
          timestamp: Date.now()
        });
      } else if (conferenceData && conferenceData.status === 'active' && conferenceData.conferenceName) {
        const waitForAgent = !conferenceData.conferenceStarted;
        console.log(`🎯 Bridging call ${CallSid} to conference: ${conferenceData.conferenceName}`);
        
        const dialOptions: any = {
          action: `${baseUrl}/api/twilio/dial-status?token=${encodeURIComponent(webhookToken)}`,
          method: 'POST'
        };
        
        if (autoRecordEnabled) {
          dialOptions.record = 'record-from-answer-dual';
          dialOptions.recordingStatusCallback = `${baseUrl}/api/twilio/recording-status?token=${encodeURIComponent(webhookToken)}`;
        }
        
        const dial = twimlResponse.dial(dialOptions);
        dial.conference({
          startConferenceOnEnter: waitForAgent,
          endConferenceOnExit: false,
          beep: 'false' as any,
          waitUrl: waitForAgent ? '' : undefined,
          statusCallback: `${baseUrl}/api/twilio/conference-status?token=${encodeURIComponent(webhookToken)}`,
          statusCallbackEvent: ['join', 'leave'] as any
        }, conferenceData.conferenceName);
      } else {
        console.log(`⚠️ Using direct client connection for call ${CallSid}`);
        
        const dialOptions: any = {
          answerOnBridge: true,
          timeout: 30,
          action: `${baseUrl}/api/twilio/dial-status?token=${encodeURIComponent(webhookToken)}`,
          method: 'POST',
          statusCallback: `${baseUrl}/api/twilio/status?token=${encodeURIComponent(webhookToken)}`,
          statusCallbackEvent: 'initiated ringing in-progress answered completed',
          statusCallbackMethod: 'POST'
        };
        
        if (autoRecordEnabled) {
          dialOptions.record = 'record-from-answer-dual';
          dialOptions.recordingStatusCallback = `${baseUrl}/api/twilio/recording-status?token=${encodeURIComponent(webhookToken)}`;
        }
        
        if (credentials.phoneNumber) {
          dialOptions.callerId = credentials.phoneNumber;
        }
        
        const dial = twimlResponse.dial(dialOptions);
        const client = dial.client(user.username);
        client.parameter({ name: 'isParallelDialer', value: 'true' });
        client.parameter({ name: 'contactName', value: name || 'Unknown' });
        client.parameter({ name: 'contactPhone', value: To });
        client.parameter({ name: 'lineId', value: lineId || '' });
        client.parameter({ name: 'greetingPlayed', value: greetingUrl ? 'true' : 'false' });
      }
      
      console.log(`📞 Parallel dialer call ${CallSid} connecting to agent: ${user.username}`);
      reply.header('Content-Type', 'text/xml');
      return reply.send(twimlResponse.toString());
      
    } catch (error: any) {
      console.error('Parallel dialer voice webhook error:', error);
      
      const VoiceResponse = twilio.twiml.VoiceResponse;
      const twimlResponse = new VoiceResponse();
      twimlResponse.say({ voice: 'alice' }, 'There was an error connecting your call.');
      twimlResponse.hangup();
      
      reply.header('Content-Type', 'text/xml');
      return reply.send(twimlResponse.toString());
    }
  });

  // AMD status callback
  fastify.post('/twilio/amd-status', {
    config: {
      rateLimit: rateLimitConfigs.webhook
    },
    preHandler: validateTwilioWebhook
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { CallSid, AnsweredBy, MachineDetectionDuration } = request.body as any;
      
      console.log('🤖 Async AMD callback:', { CallSid, AnsweredBy, MachineDetectionDuration });
      
      const callRecord = await storage.getCallByTwilioSid(CallSid);
      
      if (callRecord && callRecord.metadata) {
        const metadata = callRecord.metadata as any;
        const isHuman = AnsweredBy === 'human';
        const isMachine = AnsweredBy?.startsWith('machine') || AnsweredBy === 'fax';
        
        await storage.updateCall(callRecord.userId, callRecord.id, {
          metadata: {
            ...metadata,
            answeredBy: AnsweredBy,
            isAnsweringMachine: isMachine,
            isHuman: isHuman,
            machineDetectionDuration: MachineDetectionDuration ? parseInt(MachineDetectionDuration) : 0
          }
        });
        
        console.log(`📊 AMD result for ${CallSid}: ${AnsweredBy}`);
        
        // If human answered, cancel other parallel calls
        if (isHuman && metadata.lineId) {
          console.log(`🎯 Human detected on line ${metadata.lineId}, canceling other parallel calls`);
          
          const activeCalls = await storage.getActiveCalls(callRecord.userId);
          const parallelCalls = activeCalls.filter(call => {
            const callMeta = call.metadata as any;
            const callTwilioSid = callMeta?.twilioCallSid || call.sipCallId;
            return callMeta?.lineId && 
                   callTwilioSid !== CallSid && 
                   ['initiated', 'queued', 'ringing'].includes(call.status);
          });
          
          if (parallelCalls.length > 0) {
            console.log(`🚫 Canceling ${parallelCalls.length} other parallel calls`);
            
            const { client } = await userTwilioCache.getTwilioClient(callRecord.userId);
            
            for (const call of parallelCalls) {
              const callMeta = call.metadata as any;
              const twilioCallSid = callMeta?.twilioCallSid || call.sipCallId;
              
              if (!twilioCallSid) continue;
              
              try {
                await client.calls(twilioCallSid).update({ status: 'canceled' });
                await storage.updateCall(callRecord.userId, call.id, {
                  status: 'canceled',
                  metadata: {
                    ...callMeta,
                    cancelReason: 'human_answered_on_another_line',
                    canceledAt: new Date().toISOString()
                  }
                });
                console.log(`✅ Canceled call ${twilioCallSid} on line ${callMeta?.lineId}`);
              } catch (error: any) {
                console.error(`Failed to cancel call ${twilioCallSid}:`, error.message);
              }
            }
          }
        }
      }
      
      return reply.code(200).send();
    } catch (error: any) {
      console.error('AMD callback error:', error);
      return reply.code(200).send(); // Always return 200
    }
  });

  // Dial status callback
  fastify.post('/twilio/dial-status', {
    config: {
      rateLimit: rateLimitConfigs.webhook
    },
    preHandler: validateTwilioWebhook
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { CallSid, DialCallStatus, DialCallDuration } = request.body as any;
      
      console.log('📞 Dial status callback:', { CallSid, DialCallStatus, DialCallDuration });
      
      // Auto-assign disposition based on call outcome (async, non-blocking)
      setImmediate(async () => {
        try {
          const callRecord = await storage.getCallByTwilioSid(CallSid);
          if (!callRecord) {
            console.warn(`⚠️ Call record not found for CallSid: ${CallSid}`);
            return;
          }
          
          const metadata = (callRecord.metadata as any) || {};
          const answeredBy = metadata.answeredBy || '';
          const contactId = metadata.contactId;
          
          // Auto-assign disposition
          let autoDisposition = '';
          
          if (DialCallStatus === 'completed' || DialCallStatus === 'answered') {
            if (answeredBy === 'human') {
              autoDisposition = 'answered';
            } else if (answeredBy === 'machine_start' || answeredBy === 'machine_end_beep' || answeredBy === 'machine_end_silence') {
              autoDisposition = 'voicemail';
            } else if (answeredBy === 'fax') {
              autoDisposition = 'disconnected';
            } else {
              autoDisposition = 'answered';
            }
          } else if (DialCallStatus === 'busy') {
            autoDisposition = 'busy';
          } else if (DialCallStatus === 'no-answer') {
            autoDisposition = 'no-answer';
          } else if (DialCallStatus === 'canceled') {
            autoDisposition = 'failed';
          } else if (DialCallStatus === 'failed') {
            autoDisposition = 'failed';
          } else {
            autoDisposition = 'no-answer';
          }
          
          console.log(`🎯 Auto-assigning disposition: ${autoDisposition}`);
          
          await storage.updateCall(callRecord.userId, callRecord.id, {
            disposition: autoDisposition,
            metadata: {
              ...metadata,
              autoDisposition: autoDisposition,
              dialCallStatus: DialCallStatus,
              dialCallDuration: DialCallDuration ? parseInt(DialCallDuration) : 0
            }
          });
          
          if (contactId) {
            await storage.updateContact(callRecord.userId, contactId, {
              disposition: autoDisposition
            });
            console.log(`✅ Updated contact ${contactId} disposition to: ${autoDisposition}`);
          }
          
        } catch (error: any) {
          console.error('Auto-disposition error:', error);
        }
      });
      
      // Return TwiML hangup
      const VoiceResponse = twilio.twiml.VoiceResponse;
      const twimlResponse = new VoiceResponse();
      twimlResponse.hangup();
      
      reply.header('Content-Type', 'text/xml');
      return reply.send(twimlResponse.toString());
    } catch (error: any) {
      console.error('Dial status callback error:', error);
      
      const VoiceResponse = twilio.twiml.VoiceResponse;
      const twimlResponse = new VoiceResponse();
      twimlResponse.hangup();
      
      reply.header('Content-Type', 'text/xml');
      return reply.send(twimlResponse.toString());
    }
  });

  // Recording status webhook
  fastify.post('/twilio/recording-status', {
    config: {
      rateLimit: rateLimitConfigs.webhook
    },
    preHandler: validateTwilioWebhook
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { 
        CallSid,
        RecordingSid, 
        RecordingUrl, 
        RecordingStatus, 
        RecordingDuration,
        RecordingChannels, 
        RecordingSource, 
        RecordingStartTime,
        AccountSid
      } = request.body as any;
      
      console.log('📼 Recording status webhook received:', {
        RecordingSid,
        RecordingStatus,
        RecordingDuration,
        CallSid,
        RecordingUrl
      });
      
      // Return 200 immediately to acknowledge receipt
      reply.code(200).send();
      
      // Process recording in background
      if (!RecordingSid || !CallSid) {
        console.error('❌ Missing required recording data (RecordingSid or CallSid)');
        return;
      }
      
      // Find the call record to get userId and other details
      const callRecord = await storage.getCallByTwilioSid(CallSid);
      
      if (!callRecord || !callRecord.userId) {
        console.error(`❌ Call record not found for CallSid: ${CallSid}`);
        return;
      }
      
      const userId = callRecord.userId;
      
      // Check if recording already exists
      const existingRecording = await storage.getRecordingByTwilioSid(userId, RecordingSid);
      
      const recordingData = {
        twilioRecordingSid: RecordingSid,
        twilioCallSid: CallSid,
        twilioAccountSid: AccountSid,
        callId: callRecord.id,
        contactId: callRecord.contactId,
        userId: userId,
        phone: callRecord.phone,
        direction: callRecord.type === 'outgoing' ? 'outbound' : 'inbound',
        duration: RecordingDuration ? parseInt(RecordingDuration) : 0,
        twilioUrl: RecordingUrl,
        audioCodec: 'mp3',
        channels: RecordingChannels ? parseInt(RecordingChannels) : 1,
        status: RecordingStatus === 'completed' ? 'ready' : RecordingStatus || 'processing',
        recordingSource: RecordingSource || 'DialVerb',
        recordingStartTime: RecordingStartTime ? new Date(RecordingStartTime) : new Date(),
        metadata: {
          originalWebhookData: request.body,
          receivedAt: new Date().toISOString()
        }
      };
      
      let recordingId: number;
      
      if (existingRecording) {
        const updated = await storage.updateRecording(userId, existingRecording.id, recordingData);
        wsService.broadcastRecordingUpdate(userId, updated);
        console.log(`✅ Updated recording: ${RecordingSid} (ID: ${existingRecording.id})`);
        recordingId = existingRecording.id;
      } else {
        const created = await storage.createRecording(userId, recordingData);
        wsService.broadcastNewRecording(userId, created);
        console.log(`✅ Created new recording: ${RecordingSid} (ID: ${created.id})`);
        recordingId = created.id;
      }

      // Automatic BunnyCDN upload and Twilio deletion workflow
      if (RecordingStatus === 'completed' && RecordingUrl) {
        console.log(`📤 Recording ${RecordingSid} completed - initiating automatic BunnyCDN upload workflow...`);
        
        // Run upload workflow in background (non-blocking)
        setImmediate(async () => {
          try {
            // Check if already migrated to prevent duplicate processing
            const currentRecording = await storage.getRecording(userId, recordingId);
            if (currentRecording?.bunnycdnUrl && currentRecording?.bunnycdnUploadedAt) {
              console.log(`⏭️ Recording ${RecordingSid} already migrated to BunnyCDN - skipping duplicate webhook`);
              return;
            }
            
            const { bunnycdnService } = await import('./services/bunnycdnService');
            
            // Check if BunnyCDN is configured
            if (!bunnycdnService.isConfigured()) {
              console.log(`⏭️ BunnyCDN not configured for recording ${RecordingSid} - skipping automatic upload`);
              await storage.updateRecording(userId, recordingId, {
                metadata: {
                  ...recordingData.metadata,
                  automaticUploadSkipped: true,
                  automaticUploadSkippedReason: 'BunnyCDN not configured'
                }
              });
              return;
            }
            
            console.log(`🚀 Starting BunnyCDN upload for recording ${RecordingSid}...`);
            await storage.updateRecording(userId, recordingId, {
              status: 'uploading_to_bunnycdn',
              metadata: {
                ...recordingData.metadata,
                automaticUploadStarted: new Date().toISOString()
              }
            });
            
            // Upload to BunnyCDN
            const bunnycdnUrl = await recordingService.uploadRecordingToBunnyCDN(userId, recordingId);
            
            console.log(`✅ Successfully uploaded recording ${RecordingSid} to BunnyCDN: ${bunnycdnUrl}`);
            console.log(`🗑️ Deleting recording ${RecordingSid} from Twilio...`);
            
            // Delete from Twilio
            await recordingService.deleteRecordingFromTwilio(userId, recordingId);
            
            console.log(`✅ Automatic workflow completed for recording ${RecordingSid}`);
            
          } catch (error: any) {
            console.error(`❌ Automatic upload/deletion failed for recording ${RecordingSid}:`, error);
            await storage.updateRecording(userId, recordingId, {
              status: 'automatic_upload_failed',
              metadata: {
                ...recordingData.metadata,
                automaticUploadError: error.message,
                automaticUploadFailedAt: new Date().toISOString()
              }
            });
          }
        });
      }
      
    } catch (error: any) {
      console.error('Recording status webhook error:', error);
      return reply.code(200).send(); // Always return 200 to Twilio
    }
  });

  // Status callback webhook
  fastify.post('/twilio/status', {
    config: {
      rateLimit: rateLimitConfigs.webhook
    },
    preHandler: validateTwilioWebhook
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { CallSid, CallStatus, CallDuration, Timestamp } = request.body as any;
      
      console.log('📊 Call status webhook:', { CallSid, CallStatus, CallDuration, Timestamp });
      
      const callRecord = await storage.getCallByTwilioSid(CallSid);
      
      if (callRecord) {
        const updates: any = { status: CallStatus };
        
        if (CallStatus === 'completed' && CallDuration) {
          updates.duration = parseInt(CallDuration);
        }
        
        await storage.updateCall(callRecord.userId, callRecord.id, updates);
        
        wsService.broadcastCallUpdate(callRecord.userId, {
          ...callRecord,
          ...updates
        });
      }
      
      return reply.code(200).send();
    } catch (error: any) {
      console.error('Status webhook error:', error);
      return reply.code(200).send();
    }
  });

  // SMS webhook - Handle incoming SMS messages
  fastify.post('/twilio/sms', {
    config: {
      rateLimit: rateLimitConfigs.webhook
    },
    preHandler: validateTwilioWebhook
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { From, To, Body, MessageSid, SmsStatus, AccountSid } = request.body as any;
      const userId = (request as any).userId as number;
      
      console.log('📨 Incoming SMS webhook:', { From, To, MessageSid, SmsStatus, userId });
      
      if (!userId) {
        console.warn('⚠️ No userId found in webhook request');
        return reply
          .header('Content-Type', 'text/xml')
          .code(200)
          .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      }
      
      // Find contact for the sender
      const contact = await storage.getContactByPhone(userId, From);
      
      // Create the incoming message record using proper schema fields
      const messageData = {
        userId,
        contactId: contact?.id || null,
        phone: From,
        content: Body || '',
        type: 'received',
        status: 'delivered',
        twilioMessageSid: MessageSid,
        twilioAccountSid: AccountSid,
        twilioFromNumber: From,
        twilioToNumber: To,
        twilioStatus: SmsStatus || 'received',
        messageSource: 'twilio_webhook' as const,
        messageDirection: 'inbound' as const
      };
      
      const message = await storage.createMessage(userId, messageData);
      
      console.log(`✅ Incoming SMS saved for user ${userId} from ${From}`);
      
      // Broadcast to connected WebSocket clients
      wsService.broadcastIncomingSms(userId, {
        ...message,
        contactName: contact?.name || From
      });
      
      // Return empty TwiML response
      return reply
        .header('Content-Type', 'text/xml')
        .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    } catch (error: any) {
      console.error('SMS webhook error:', error);
      return reply
        .header('Content-Type', 'text/xml')
        .code(200)
        .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }
  });

  // SMS Status callback - Handle delivery status updates
  fastify.post('/twilio/sms-status', {
    config: {
      rateLimit: rateLimitConfigs.webhook
    },
    preHandler: validateTwilioWebhook
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = request.body as any;
      const userId = (request as any).userId as number;
      
      console.log('📊 SMS status callback:', { MessageSid, MessageStatus, ErrorCode, userId });
      
      // Map Twilio status to app status (valid: delivered, pending, failed, read)
      const mapTwilioStatusToAppStatus = (twilioStatus: string): string => {
        switch (twilioStatus) {
          case 'queued':
          case 'accepted':
          case 'sending':
          case 'sent': // Sent but not yet confirmed delivered
            return 'pending';
          case 'delivered':
            return 'delivered';
          case 'read':
            return 'read';
          case 'failed':
          case 'undelivered':
            return 'failed';
          default:
            return 'pending'; // Default to pending for unknown statuses
        }
      };
      
      // Find the message by Twilio SID (using userId from webhook validator if available)
      const message = await storage.getMessageByTwilioSid(MessageSid);
      
      if (message) {
        const targetUserId = userId || message.userId;
        const appStatus = mapTwilioStatusToAppStatus(MessageStatus);
        
        const updates: any = { 
          status: appStatus,
          twilioStatus: MessageStatus
        };
        
        if (ErrorCode) {
          updates.twilioErrorCode = ErrorCode;
          updates.twilioErrorMessage = ErrorMessage;
        }
        
        await storage.updateMessage(targetUserId, message.id, updates);
        
        const updatedMessage = { ...message, ...updates };
        
        // Always broadcast generic status update for UI synchronization
        wsService.broadcastSmsStatusUpdate(targetUserId, updatedMessage);
        
        // Also broadcast specific events for delivered/failed
        if (appStatus === 'delivered') {
          wsService.broadcastSmsDelivered(targetUserId, updatedMessage);
        } else if (appStatus === 'failed') {
          wsService.broadcastSmsFailed(targetUserId, {
            ...updatedMessage,
            errorCode: ErrorCode,
            errorMessage: ErrorMessage
          });
        }
        
        console.log(`✅ SMS status updated for message ${message.id}: ${MessageStatus} -> ${appStatus}`);
      } else {
        console.warn(`⚠️ Message not found for SID: ${MessageSid}`);
      }
      
      return reply.code(200).send();
    } catch (error: any) {
      console.error('SMS status webhook error:', error);
      return reply.code(200).send();
    }
  });

  // Conference status webhook
  fastify.post('/twilio/conference-status', {
    config: {
      rateLimit: rateLimitConfigs.webhook
    },
    preHandler: validateTwilioWebhook
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { ConferenceSid, StatusCallbackEvent, ParticipantLabel, CallSid } = request.body as any;
      const query = request.query as any;
      const token = query.token as string;
      
      console.log('🎙️ Conference status callback:', {
        ConferenceSid,
        StatusCallbackEvent,
        ParticipantLabel,
        CallSid
      });
      
      if (!token) {
        console.warn('⚠️ Conference status webhook missing token');
        return reply.code(200).send();
      }
      
      try {
        const userId = verifyWebhookToken(token);
        
        // Broadcast conference event to user's websocket
        wsService.broadcastToUser(userId, 'conference_status', {
          conferenceSid: ConferenceSid,
          event: StatusCallbackEvent,
          participantLabel: ParticipantLabel,
          callSid: CallSid,
          timestamp: new Date().toISOString()
        });
        
      } catch (error: any) {
        console.error('Failed to verify webhook token:', error.message);
      }
      
      return reply.code(200).send();
    } catch (error: any) {
      console.error('Conference status webhook error:', error);
      return reply.code(200).send();
    }
  });

  // ============================================================================
  // UTILITY ROUTES (with JWT authentication)
  // ============================================================================

  // Make outbound call
  fastify.post('/twilio/make-call', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.code(401).send({ message: 'Unauthorized' });
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUserFromAuth0(request.user);
      const { to, amd = true, contactId, contactName } = request.body as any;
      
      if (!to) {
        return reply.code(400).send({ message: 'Phone number is required' });
      }
      
      const formattedTo = to.startsWith('+') ? to : `+${to}`;
      
      const { client, credentials } = await userTwilioCache.getTwilioClient(user.id);
      
      if (!credentials.phoneNumber) {
        return reply.code(400).send({ 
          message: 'Phone number not configured. Please save your Twilio credentials first.',
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
          amdEnabled: amd
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
      console.error('Make call error:', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  // Register Twilio Device
  fastify.post('/twilio/device/register', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.code(401).send({ message: 'Unauthorized' });
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUserFromAuth0(request.user);
      const { deviceId } = request.body as any;
      
      console.log(`📱 Device registration for user ${user.id}: ${deviceId}`);
      
      await storage.setSetting(`twilio_device_${user.id}`, {
        deviceId,
        registeredAt: new Date().toISOString()
      });
      
      return reply.send({ success: true, deviceId });
    } catch (error: any) {
      console.error('Device registration error:', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  // Unregister Twilio Device
  fastify.post('/twilio/device/unregister', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.code(401).send({ message: 'Unauthorized' });
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUserFromAuth0(request.user);
      
      console.log(`📱 Device unregistration for user ${user.id}`);
      
      await storage.setSetting(`twilio_device_${user.id}`, null);
      
      return reply.send({ success: true });
    } catch (error: any) {
      console.error('Device unregistration error:', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  // Submit call quality metrics
  fastify.post('/twilio/call-quality', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.code(401).send({ message: 'Unauthorized' });
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUserFromAuth0(request.user);
      const { callSid, metrics } = request.body as any;
      
      if (!callSid || !metrics) {
        return reply.code(400).send({ message: 'Call SID and metrics are required' });
      }
      
      const callRecord = await storage.getCallByTwilioSid(callSid);
      
      if (!callRecord || callRecord.userId !== user.id) {
        return reply.code(404).send({ message: 'Call not found' });
      }
      
      await storage.updateCall(user.id, callRecord.id, {
        callQuality: metrics.quality || null,
        codec: metrics.codec || null,
        jitter: metrics.jitter || null,
        packetLoss: metrics.packetLoss || null,
        metadata: {
          ...(callRecord.metadata as any || {}),
          qualityMetrics: metrics
        }
      });
      
      console.log(`📊 Call quality metrics saved for call ${callSid}`);
      
      return reply.send({ success: true });
    } catch (error: any) {
      console.error('Call quality error:', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  // Toggle auto-recording
  fastify.post('/twilio/auto-recording/toggle', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.code(401).send({ message: 'Unauthorized' });
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUserFromAuth0(request.user);
      const { enabled } = request.body as any;
      
      await storage.setSetting(`auto_record_calls_user_${user.id}`, enabled);
      
      console.log(`📼 Auto-recording ${enabled ? 'enabled' : 'disabled'} for user ${user.id}`);
      
      return reply.send({ success: true, enabled });
    } catch (error: any) {
      console.error('Auto-recording toggle error:', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  // Get auto-recording status
  fastify.get('/twilio/auto-recording/status', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.code(401).send({ message: 'Unauthorized' });
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUserFromAuth0(request.user);
      
      const setting = await storage.getSetting(`auto_record_calls_user_${user.id}`);
      const enabled = setting?.value === true || setting?.value === "true";
      
      return reply.send({ enabled });
    } catch (error: any) {
      console.error('Auto-recording status error:', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  // Health check
  fastify.get('/twilio/health', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.code(401).send({ message: 'Unauthorized' });
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUserFromAuth0(request.user);
      
      const { client, credentials } = await userTwilioCache.getTwilioClient(user.id);
      
      // Test Twilio connection
      const account = await client.api.v2010.accounts(credentials.accountSid).fetch();
      
      return reply.send({
        healthy: true,
        account: {
          sid: account.sid,
          friendlyName: account.friendlyName,
          status: account.status
        },
        credentials: {
          accountSid: credentials.accountSid,
          phoneNumber: credentials.phoneNumber,
          twimlAppSid: credentials.twimlAppSid
        }
      });
    } catch (error: any) {
      console.error('Twilio health check error:', error);
      return reply.code(500).send({ 
        healthy: false,
        error: error.message 
      });
    }
  });

  // TwiML dial client endpoint
  fastify.post('/twilio/twiml/dial-client', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.code(401).send({ message: 'Unauthorized' });
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUserFromAuth0(request.user);
      const { clientName, params } = request.body as any;
      
      const VoiceResponse = twilio.twiml.VoiceResponse;
      const twimlResponse = new VoiceResponse();
      
      const dial = twimlResponse.dial({ timeout: 30 });
      const client = dial.client(clientName || user.username);
      
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          client.parameter({ name: key, value: String(value) });
        }
      }
      
      reply.header('Content-Type', 'text/xml');
      return reply.send(twimlResponse.toString());
    } catch (error: any) {
      console.error('TwiML dial client error:', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  // Generic webhook voice endpoint
  fastify.post('/twilio/webhook/voice', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.code(401).send({ message: 'Unauthorized' });
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const VoiceResponse = twilio.twiml.VoiceResponse;
      const twimlResponse = new VoiceResponse();
      twimlResponse.say({ voice: 'alice' }, 'Hello from Twilio');
      
      reply.header('Content-Type', 'text/xml');
      return reply.send(twimlResponse.toString());
    } catch (error: any) {
      console.error('Webhook voice error:', error);
      return reply.code(500).send({ message: error.message });
    }
  });


  // Admin endpoint to verify all TwiML apps
  fastify.post('/admin/verify-all-twiml-apps', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.code(401).send({ message: 'Unauthorized' });
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUserFromAuth0(request.user);
      
      // Get all users' TwiML apps
      const { client, credentials } = await userTwilioCache.getTwilioClient(user.id);
      
      const apps = await client.applications.list();
      
      const baseUrl = process.env.REPLIT_DOMAINS 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : `https://${request.hostname}`;
      
      const results = await Promise.all(
        apps.map(async (app) => {
          try {
            const updated = await client.applications(app.sid).update({
              voiceUrl: `${baseUrl}/api/twilio/voice`,
              voiceMethod: 'POST',
              statusCallback: `${baseUrl}/api/twilio/status`,
              statusCallbackMethod: 'POST'
            });
            
            return {
              sid: app.sid,
              friendlyName: app.friendlyName,
              success: true,
              voiceUrl: updated.voiceUrl
            };
          } catch (error: any) {
            return {
              sid: app.sid,
              friendlyName: app.friendlyName,
              success: false,
              error: error.message
            };
          }
        })
      );
      
      return reply.send({
        success: true,
        totalApps: results.length,
        successfulUpdates: results.filter(r => r.success).length,
        failedUpdates: results.filter(r => !r.success).length,
        results
      });
    } catch (error: any) {
      console.error('Verify TwiML apps error:', error);
      return reply.code(500).send({ message: error.message });
    }
  });
}
