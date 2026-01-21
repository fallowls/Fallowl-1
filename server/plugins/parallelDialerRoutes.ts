import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { storage } from '../storage';
import { userTwilioCache } from '../userTwilioService';
import { wsService } from '../websocketService';
import { generateWebhookToken, verifyWebhookToken } from '../routes';
import twilio from 'twilio';
import { rateLimitConfigs } from './rateLimiters';

interface AuthRequest extends FastifyRequest {
  userId?: number;
}

/**
 * Parallel Dialer Routes Plugin for Fastify
 * Migrated from Express routes in server/routes.ts
 */
export default async function parallelDialerRoutes(fastify: FastifyInstance) {
  
  // POST /dialer/parallel-call - Initiate parallel dialer call
  fastify.post('/dialer/parallel-call', {
    config: {
      rateLimit: rateLimitConfigs.call
    },
    preHandler: [fastify.requireAuth]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.userId!;
      const tenantId = request.tenantId!;
      const { contactId, phone, name, lineId, amdEnabled, amdTimeout = 30, amdSensitivity = 'standard' } = request.body as any;

      if (!phone) {
        return reply.code(400).send({ message: "Phone number is required" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return reply.code(404).send({ message: "User not found" });
      }

      let contact = null;
      if (contactId) {
        contact = await storage.getContact(tenantId, userId, contactId);
      }

      const { client, credentials } = await userTwilioCache.getTwilioClient(userId);
      
      if (!credentials.phoneNumber) {
        return reply.code(400).send({ message: "Twilio phone number not configured" });
      }

      const callRecord = await storage.createCall(tenantId, userId, {
        userId,
        contactId: contactId || undefined,
        phone,
        type: 'outgoing',
        status: 'initiated',
        duration: 0,
        metadata: {
          lineId,
          amdEnabled,
          amdTimeout,
          amdSensitivity
        }
      });

      const baseUrl = process.env.REPLIT_DOMAINS 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : `https://${request.headers.host}`;
      
      const webhookToken = generateWebhookToken(userId);
      
      const voiceUrl = `${baseUrl}/api/twilio/voice/parallel-dialer?token=${encodeURIComponent(webhookToken)}&lineId=${encodeURIComponent(String(lineId))}&name=${encodeURIComponent(name || 'Unknown')}&userId=${userId}`;
      
      console.log(`📞 Creating parallel dialer call to ${phone} with voiceUrl webhook for user: ${user.username}`);
      
      const amdConfig = amdEnabled ? {
        machineDetection: 'Enable' as const,
        machineDetectionTimeout: amdTimeout,
        asyncAmd: false,
        ...(amdSensitivity === 'low' ? {
          machineDetectionSilenceTimeout: 3000,
          machineDetectionSpeechThreshold: 3000,
          machineDetectionSpeechEndThreshold: 2000
        } : amdSensitivity === 'high' ? {
          machineDetectionSilenceTimeout: 1500,
          machineDetectionSpeechThreshold: 1500,
          machineDetectionSpeechEndThreshold: 1000
        } : {})
      } : {};

      const call = await client.calls.create({
        to: phone,
        from: credentials.phoneNumber,
        url: voiceUrl,
        method: 'POST',
        statusCallback: `${baseUrl}/api/twilio/status?token=${encodeURIComponent(webhookToken)}`,
        statusCallbackEvent: ['initiated', 'ringing', 'in-progress', 'answered', 'completed'],
        ...amdConfig
      });

      await storage.updateCall(tenantId, userId, callRecord.id, {
        sipCallId: call.sid,
        metadata: {
          ...(callRecord.metadata && typeof callRecord.metadata === 'object' ? callRecord.metadata : {}),
          twilioCallSid: call.sid,
          lineId,
          amdEnabled,
          amdTimeout,
          amdSensitivity,
          contactId: contact?.id
        }
      });

      if (contact) {
        const currentAttempts = contact.callAttempts || 0;
        await storage.updateContact(tenantId, userId, contact.id, {
          callAttempts: currentAttempts + 1,
          lastCallAttempt: new Date()
        });
        console.log(`📊 Updated call attempts for ${contact.name}: ${currentAttempts} → ${currentAttempts + 1}`);
      }

      const contactData = {
        id: contact?.id || 0,
        name: contact?.name || name || 'Unknown',
        phone: phone,
        company: contact?.company || undefined,
        jobTitle: contact?.jobTitle || undefined,
        email: contact?.email || undefined
      };

      wsService.broadcastParallelCallStarted(userId, {
        lineId,
        callSid: call.sid,
        callId: callRecord.id,
        contact: contactData,
        status: 'initiated',
        startTime: Date.now(),
        timestamp: Date.now()
      });

      return reply.send({
        callSid: call.sid,
        callId: callRecord.id,
        status: call.status,
        lineId
      });

    } catch (error: any) {
      console.error('Parallel call error:', error);
      
      let errorMessage = error.message;
      let errorCode = 'UNKNOWN';
      
      if (error.code === 21219) {
        errorMessage = "Trial account can only call verified numbers. Please verify this number in your Twilio console or upgrade your account.";
        errorCode = 'TRIAL_ACCOUNT_RESTRICTION';
      } else if (error.code === 20429 || error.status === 429) {
        errorMessage = "Rate limit exceeded. Please reduce the number of parallel lines or slow down call initiation rate.";
        errorCode = 'RATE_LIMIT_EXCEEDED';
      } else if (error.code === 21217) {
        errorMessage = "Phone number is not formatted correctly. Please use E.164 format (+1234567890).";
        errorCode = 'INVALID_PHONE_NUMBER';
      } else if (error.code === 21614) {
        errorMessage = "'To' number is not a valid phone number.";
        errorCode = 'INVALID_TO_NUMBER';
      }
      
      return reply.code(error.status || 500).send({ 
        message: errorMessage,
        code: errorCode,
        twilioCode: error.code,
        lineId: (request.body as any)?.lineId
      });
    }
  });

  // POST /dialer/call-connected - Notify call connected
  fastify.post('/dialer/call-connected', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: [fastify.requireAuth]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.userId!;
      const tenantId = request.tenantId!;
      const { callSid, lineId, phone } = request.body as any;

      if (!callSid || !lineId) {
        return reply.code(400).send({ message: "callSid and lineId are required" });
      }

      console.log(`📞 Client reported call connected: CallSid=${callSid}, lineId=${lineId}`);

      const callRecord = await storage.getCallByTwilioSid(callSid);

      if (callRecord) {
        let contact = null;
        if (callRecord.contactId) {
          contact = await storage.getContact(tenantId, userId, callRecord.contactId);
        }

        const contactData = {
          id: contact?.id || 0,
          name: contact?.name || 'Unknown',
          phone: phone || callRecord.phone,
          company: contact?.company || undefined,
          jobTitle: contact?.jobTitle || undefined,
          email: contact?.email || undefined
        };

        const eventData = {
          lineId,
          callSid,
          callId: callRecord.id,
          contact: contactData,
          status: 'in-progress',
          duration: 0,
          isAnsweringMachine: false,
          timestamp: Date.now()
        };

        console.log(`✅ Broadcasting parallel_call_connected for line ${lineId}`);
        wsService.broadcastParallelCallConnected(userId, eventData);

        return reply.send({ success: true, message: 'Call connected event broadcasted' });
      } else {
        console.warn(`⚠️ Call record not found for CallSid: ${callSid}`);
        return reply.code(404).send({ message: 'Call record not found' });
      }
    } catch (error: any) {
      console.error('Error handling call connected notification:', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  // POST /dialer/call-rejected - Reject a call
  fastify.post('/dialer/call-rejected', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: [fastify.requireAuth]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.userId!;
      const { callSid, lineId, phone, reason } = request.body as any;

      if (!lineId) {
        return reply.code(400).send({ message: "lineId is required" });
      }

      console.log(`⚠️ Client rejected parallel dialer call: CallSid=${callSid}, lineId=${lineId}, reason=${reason}`);

      const eventData = {
        lineId,
        callSid,
        phone,
        status: 'busy',
        reason: reason || 'agent_busy',
        timestamp: Date.now()
      };

      console.log(`📤 Broadcasting parallel_call_ended for rejected call on line ${lineId}`);
      wsService.broadcastParallelCallEnded(userId, eventData);

      return reply.send({ success: true, message: 'Call rejection handled, line will dial next contact' });
    } catch (error: any) {
      console.error('Error handling call rejection:', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  // POST /dialer/clear-primary-call - Clear primary call setting
  fastify.post('/dialer/clear-primary-call', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: [fastify.requireAuth]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.userId!;
      
      await storage.setSetting(`parallel_dialer_primary_call_${userId}`, null);
      
      console.log(`✅ Cleared primary call setting for user ${userId}`);
      return reply.send({ message: 'Primary call setting cleared' });
    } catch (error: any) {
      console.error('Clear primary call error:', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  // POST /dialer/hangup - Hangup a call
  fastify.post('/dialer/hangup', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: [fastify.requireAuth]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.userId!;
      const tenantId = request.tenantId!;
      const { callSid } = request.body as any;

      if (!callSid) {
        return reply.code(400).send({ message: "Call SID is required" });
      }

      const conferenceSetting = await storage.getSetting(`parallel_dialer_conference_${userId}`);
      if (conferenceSetting && conferenceSetting.value) {
        const conferenceData = conferenceSetting.value as any;
        if (conferenceData.agentCallSid === callSid) {
          console.warn(`⚠️ Attempted to disconnect conference join call ${callSid} - rejected`);
          return reply.code(400).send({ 
            message: "Cannot disconnect the conference connection. Use 'Stop Dialing' to end the session." 
          });
        }
      }

      const allCalls = await storage.getAllCalls(tenantId, userId);
      const call = allCalls.find(c => 
        c.metadata && 
        typeof c.metadata === 'object' && 
        'twilioCallSid' in c.metadata && 
        c.metadata.twilioCallSid === callSid
      );

      if (!call) {
        return reply.code(403).send({ message: "Unauthorized: Call not found or does not belong to this user" });
      }

      const { client } = await userTwilioCache.getTwilioClient(userId);
      
      console.log(`📞 Disconnecting customer call ${callSid} for user ${userId}`);
      await client.calls(callSid).update({ status: 'completed' });

      try {
        const primaryCallSetting = await storage.getSetting(`parallel_dialer_primary_call_${userId}`);
        if (primaryCallSetting && primaryCallSetting.value) {
          const primaryData = primaryCallSetting.value as any;
          
          if (primaryData.callSid === callSid) {
            console.log(`🔄 Primary call ended - checking for queued calls`);
            
            await storage.setSetting(`parallel_dialer_primary_call_${userId}`, null);
            
            for (let i = 0; i < 10; i++) {
              const secondaryKey = `parallel_dialer_secondary_call_${userId}_line-${i}`;
              const secondarySetting = await storage.getSetting(secondaryKey);
              
              if (secondarySetting && secondarySetting.value) {
                const secondaryData = secondarySetting.value as any;
                
                if (secondaryData.onHold && secondaryData.callSid) {
                  console.log(`✅ Found queued call on line-${i} (${secondaryData.callSid}) - promoting to primary`);
                  
                  await storage.setSetting(`parallel_dialer_primary_call_${userId}`, {
                    lineId: `line-${i}`,
                    callSid: secondaryData.callSid,
                    timestamp: Date.now(),
                    inConference: false
                  });
                  
                  await storage.setSetting(secondaryKey, null);
                  
                  const baseUrl = process.env.REPLIT_DOMAINS 
                    ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
                    : `https://${process.env.VITE_AUTH0_DOMAIN?.replace('auth.', 'app.') || 'fallowl.com'}`;
                  const webhookToken = generateWebhookToken(userId);
                  const conferenceSetting = await storage.getSetting(`parallel_dialer_conference_${userId}`);
                  
                  if (conferenceSetting && conferenceSetting.value) {
                    const conferenceData = conferenceSetting.value as any;
                    const redirectUrl = `${baseUrl}/api/dialer/queue/join-conference?token=${encodeURIComponent(webhookToken)}&conference=${encodeURIComponent(conferenceData.conferenceName)}&lineId=line-${i}`;
                    
                    await client.calls(secondaryData.callSid).update({
                      url: redirectUrl,
                      method: 'POST'
                    });
                    
                    console.log(`🎯 Redirected queued call ${secondaryData.callSid} to conference`);
                    
                    wsService.broadcastToUser(userId, 'parallel_dialer_queue_promoted', {
                      lineId: `line-${i}`,
                      callSid: secondaryData.callSid,
                      name: secondaryData.name,
                      phone: secondaryData.phone
                    });
                  }
                  
                  break;
                }
              }
            }
          }
        }
      } catch (queueError: any) {
        console.error('Error managing call queue:', queueError);
      }

      return reply.send({ message: "Call ended successfully" });
    } catch (error: any) {
      console.error('Hangup error:', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  // POST /dialer/conference/start - Start conference
  fastify.post('/dialer/conference/start', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request: AuthRequest, reply: FastifyReply) => {
    try {
      const userId = request.userId!;
      const user = await storage.getUser(userId);
      if (!user) {
        return reply.code(404).send({ message: "User not found" });
      }

      const { client, credentials } = await userTwilioCache.getTwilioClient(userId);
      
      if (!credentials.phoneNumber) {
        return reply.code(400).send({ message: "Twilio phone number not configured" });
      }

      const baseUrl = process.env.REPLIT_DOMAINS 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : `https://${request.headers.host}`;
      
      const webhookToken = generateWebhookToken(userId);
      const conferenceName = `parallel-dialer-${userId}-${Date.now()}`;
      
      const conferenceUrl = `${baseUrl}/api/dialer/conference/join-agent?token=${encodeURIComponent(webhookToken)}&conference=${encodeURIComponent(conferenceName)}`;
      
      const call = await client.calls.create({
        to: `client:${user.username}`,
        from: credentials.phoneNumber,
        url: conferenceUrl,
        method: 'POST',
        statusCallback: `${baseUrl}/api/twilio/status?token=${encodeURIComponent(webhookToken)}`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
      });

      await storage.setSetting(`parallel_dialer_conference_${userId}`, {
        conferenceName,
        agentCallSid: call.sid,
        startTime: Date.now(),
        status: 'active',
        isConferenceJoin: true
      });

      return reply.send({
        conferenceName,
        agentCallSid: call.sid,
        status: 'initiated',
        message: 'Conference session initiated. Please accept the incoming call to establish the media session.'
      });

    } catch (error: any) {
      console.error('Conference start error:', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /dialer/conference/status - Get conference status
  fastify.get('/dialer/conference/status', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request: AuthRequest, reply: FastifyReply) => {
    try {
      const userId = request.userId!;
      const setting = await storage.getSetting(`parallel_dialer_conference_${userId}`);
      
      if (!setting || !setting.value) {
        return reply.send({ active: false, message: 'No active conference' });
      }

      const conferenceData = setting.value as any;
      return reply.send({
        active: conferenceData.status === 'active',
        conferenceName: conferenceData.conferenceName,
        agentCallSid: conferenceData.agentCallSid,
        startTime: conferenceData.startTime
      });

    } catch (error: any) {
      console.error('Conference status error:', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /dialer/conference/check-join/:callSid - Check if call is conference join
  fastify.get('/dialer/conference/check-join/:callSid', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request: AuthRequest, reply: FastifyReply) => {
    try {
      const userId = request.userId!;
      const { callSid } = request.params as { callSid: string };
      
      const setting = await storage.getSetting(`parallel_dialer_conference_${userId}`);
      
      if (!setting || !setting.value) {
        return reply.send({ isConferenceJoin: false });
      }

      const conferenceData = setting.value as any;
      const isConferenceJoin = conferenceData.agentCallSid === callSid && 
                               conferenceData.status === 'active' &&
                               conferenceData.isConferenceJoin === true;
      
      return reply.send({ isConferenceJoin });

    } catch (error: any) {
      console.error('Conference check error:', error);
      return reply.send({ isConferenceJoin: false });
    }
  });

  // POST /dialer/conference/end - End conference
  fastify.post('/dialer/conference/end', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request: AuthRequest, reply: FastifyReply) => {
    try {
      const userId = request.userId!;
      const setting = await storage.getSetting(`parallel_dialer_conference_${userId}`);
      
      if (!setting || !setting.value) {
        return reply.send({ message: 'No active conference to end' });
      }

      const conferenceData = setting.value as any;
      const { client } = await userTwilioCache.getTwilioClient(userId);
      
      try {
        await client.conferences(conferenceData.conferenceName).update({ status: 'completed' });
      } catch (error) {
        console.log('Conference already ended or not found');
      }

      if (conferenceData.agentCallSid) {
        try {
          await client.calls(conferenceData.agentCallSid).update({ status: 'completed' });
        } catch (error) {
          console.log('Agent call already ended');
        }
      }

      await storage.setSetting(`parallel_dialer_conference_${userId}`, null);
      console.log('✅ Removed conference setting');

      await storage.setSetting(`parallel_dialer_primary_call_${userId}`, null);
      console.log('✅ Cleared primary call setting');
      
      for (let i = 0; i < 10; i++) {
        await storage.setSetting(`parallel_dialer_secondary_call_${userId}_line-${i}`, null);
      }
      console.log('✅ Cleaned up all secondary call settings');

      return reply.send({ message: 'Conference ended successfully' });

    } catch (error: any) {
      console.error('Conference end error:', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /parallel-dialer/verify/data-integrity - Verify data integrity
  fastify.get('/parallel-dialer/verify/data-integrity', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request: AuthRequest, reply: FastifyReply) => {
    try {
      const userId = request.userId!;
      const { startDate, endDate } = request.query as { startDate?: string; endDate?: string };
      const start = startDate ? new Date(startDate) : undefined;
      const end = endDate ? new Date(endDate) : undefined;
      
      const { parallelDialerVerification } = await import('../services/parallelDialerVerification');
      const report = await parallelDialerVerification.verifyDataIntegrity(userId, start, end);
      return reply.send(report);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /parallel-dialer/verify/amd-performance - Analyze AMD performance
  fastify.get('/parallel-dialer/verify/amd-performance', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request: AuthRequest, reply: FastifyReply) => {
    try {
      const userId = request.userId!;
      const { startDate, endDate } = request.query as { startDate?: string; endDate?: string };
      const start = startDate ? new Date(startDate) : undefined;
      const end = endDate ? new Date(endDate) : undefined;
      
      const { parallelDialerVerification } = await import('../services/parallelDialerVerification');
      const metrics = await parallelDialerVerification.analyzeAMDPerformance(userId, start, end);
      return reply.send(metrics);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /parallel-dialer/verify/disposition-accuracy - Validate disposition accuracy
  fastify.get('/parallel-dialer/verify/disposition-accuracy', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request: AuthRequest, reply: FastifyReply) => {
    try {
      const userId = request.userId!;
      const { startDate, endDate } = request.query as { startDate?: string; endDate?: string };
      const start = startDate ? new Date(startDate) : undefined;
      const end = endDate ? new Date(endDate) : undefined;
      
      const { parallelDialerVerification } = await import('../services/parallelDialerVerification');
      const report = await parallelDialerVerification.validateDispositionAccuracy(userId, start, end);
      return reply.send(report);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /parallel-dialer/verify/resource-leaks - Check for resource leaks
  fastify.get('/parallel-dialer/verify/resource-leaks', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request: AuthRequest, reply: FastifyReply) => {
    try {
      const userId = request.userId!;
      
      const { parallelDialerVerification } = await import('../services/parallelDialerVerification');
      const leaks = await parallelDialerVerification.checkResourceLeaks(userId);
      return reply.send(leaks);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /parallel-dialer/verify/single-call-enforcement - Verify single call enforcement
  fastify.get('/parallel-dialer/verify/single-call-enforcement', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request: AuthRequest, reply: FastifyReply) => {
    try {
      const userId = request.userId!;
      const { timeWindow } = request.query as { timeWindow?: string };
      const window = timeWindow ? parseInt(timeWindow) : 300;
      
      const { parallelDialerVerification } = await import('../services/parallelDialerVerification');
      const report = await parallelDialerVerification.verifySingleCallEnforcement(userId, window);
      return reply.send(report);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /parallel-dialer/analytics/report - Generate analytics report
  fastify.get('/parallel-dialer/analytics/report', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request: AuthRequest, reply: FastifyReply) => {
    try {
      const userId = request.userId!;
      const { startDate, endDate } = request.query as { startDate?: string; endDate?: string };
      const start = startDate ? new Date(startDate) : undefined;
      const end = endDate ? new Date(endDate) : undefined;
      
      const { parallelDialerVerification } = await import('../services/parallelDialerVerification');
      const report = await parallelDialerVerification.generateAnalyticsReport(userId, start, end);
      return reply.send(report);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // POST /parallel-dialer/cleanup/stale-calls - Cleanup stale calls
  fastify.post('/parallel-dialer/cleanup/stale-calls', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request: AuthRequest, reply: FastifyReply) => {
    try {
      const userId = request.userId!;
      
      const { parallelDialerVerification } = await import('../services/parallelDialerVerification');
      const result = await parallelDialerVerification.cleanupStaleCalls(userId);
      return reply.send(result);
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });
}
