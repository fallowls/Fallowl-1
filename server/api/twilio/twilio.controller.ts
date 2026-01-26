import { FastifyRequest, FastifyReply } from 'fastify';
import { storage } from '../../storage';
import { userTwilioCache, clearTwilioCacheOnLogout } from '../../userTwilioService';
import { wsService } from '../../websocketService';
import twilio from 'twilio';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../../utils/errors';
import { getBaseUrl } from '../../utils/urlConfig';

export async function saveCredentials(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  if (!userId) throw new UnauthorizedError();

  const { accountSid, authToken, apiKeySid, apiKeySecret, phoneNumber, twimlAppSid } = request.body as any;

  if (!accountSid || !authToken || !phoneNumber) {
    throw new BadRequestError("Account SID, Auth Token, and Phone Number are required");
  }

  // Validate credentials
  try {
    const testClient = twilio(accountSid, authToken);
    await testClient.api.v2010.accounts(accountSid).fetch();
  } catch (error: any) {
    throw new UnauthorizedError(`Invalid Twilio credentials: ${error.message}`);
  }

  await storage.updateUserTwilioCredentials(userId, {
    twilioAccountSid: accountSid,
    twilioAuthToken: authToken,
    twilioApiKeySid: apiKeySid,
    twilioApiKeySecret: apiKeySecret,
    twilioPhoneNumber: phoneNumber,
    twilioTwimlAppSid: twimlAppSid,
    twilioConfigured: true
  });

  clearTwilioCacheOnLogout(userId);

  return reply.send({ message: "Twilio credentials saved successfully", configured: true });
}

export async function getCredentials(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  if (!userId) throw new UnauthorizedError();

  try {
    const dbCredentials = await storage.getUserTwilioCredentials(userId);
    
    if (!dbCredentials) {
      return reply.send({ configured: false, credentials: null });
    }

    // Auto-fix configured status if credentials exist
    if (!dbCredentials.twilioConfigured && dbCredentials.twilioAccountSid && dbCredentials.twilioAuthToken) {
      await storage.updateUserTwilioCredentials(userId, { twilioConfigured: true });
      dbCredentials.twilioConfigured = true;
    }

    return reply.send({
      configured: true,
      credentials: {
        accountSid: dbCredentials.twilioAccountSid ? `${dbCredentials.twilioAccountSid.slice(0, 10)}...` : null,
        phoneNumber: dbCredentials.twilioPhoneNumber,
        hasApiKey: !!dbCredentials.twilioApiKeySid,
        twimlAppSid: dbCredentials.twilioTwimlAppSid
      }
    });
  } catch (error) {
    return reply.send({ configured: false, credentials: null });
  }
}

export async function deleteCredentials(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  if (!userId) throw new UnauthorizedError();

  await storage.updateUserTwilioCredentials(userId, {
    twilioAccountSid: undefined,
    twilioAuthToken: undefined,
    twilioApiKeySid: undefined,
    twilioApiKeySecret: undefined,
    twilioPhoneNumber: undefined,
    twilioTwimlAppSid: undefined,
    twilioConfigured: false
  });

  clearTwilioCacheOnLogout(userId);
  return reply.send({ message: "Twilio credentials removed successfully", configured: false });
}

export async function getAccessToken(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const user = await storage.getUser(userId);
  if (!user) throw new NotFoundError("User not found");

  const baseUrl = getBaseUrl();

  const accessToken = await userTwilioCache.generateAccessToken(userId, user.username, baseUrl);
  
  return reply.send({ 
    accessToken,
    expiresIn: 3600,
    identity: user.username 
  });
}

export async function handleVoice(request: FastifyRequest, reply: FastifyReply) {
<<<<<<< HEAD
    const { From, To, CallSid } = request.body as any;
    console.log(`🎯 Voice webhook called: From=${From}, To=${To}, CallSid=${CallSid}`);

    const incomingUser = await storage.getUserByTwilioPhoneNumber(To);
    if (!incomingUser) {
        console.error(`❌ No user found with Twilio number: ${To}`);
        const VoiceResponse = twilio.twiml.VoiceResponse;
        const twiml = new VoiceResponse();
        twiml.say("This number is not configured.");
        reply.header('Content-Type', 'text/xml');
        return reply.send(twiml.toString());
    }

    const baseUrl = getBaseUrl();
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const twiml = new VoiceResponse();

    const dial = twiml.dial({
        timeout: 20,
        action: `${baseUrl}/api/twilio/voice/dial-action`,
        method: 'POST'
    });
    dial.client(incomingUser.username);

    reply.header('Content-Type', 'text/xml');
    return reply.send(twiml.toString());
=======
    const { To, From, CallSid, Direction } = request.body as any;
    
    console.log(`📞 Incoming voice webhook: Direction=${Direction}, From=${From}, To=${To}, CallSid=${CallSid}`);

    reply.header('Content-Type', 'text/xml');

    // For outbound calls from browser client
    if (To && To.startsWith('client:')) {
        const clientName = To.replace('client:', '');
        return reply.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Dial><Client>${clientName}</Client></Dial></Response>`);
    }

    // For calls to external numbers
    if (To && To !== process.env.TWILIO_PHONE_NUMBER) {
        // Find user by From if it's a client
        let callerId = process.env.TWILIO_PHONE_NUMBER;
        let userId: number | null = null;
        
        if (From && From.startsWith('client:')) {
            const username = From.replace('client:', '');
            const user = await storage.getUserByUsername(username);
            if (user) {
                userId = user.id;
                const credentials = await storage.getUserTwilioCredentials(user.id);
                if (credentials?.twilioPhoneNumber) {
                    callerId = credentials.twilioPhoneNumber;
                }
            }
        }

        // Generate the Dial TwiML
        const dialParams: any = { callerId };
        
        // Add recording if enabled for the user
        if (userId) {
            const { twilioService } = await import('../../twilioService');
            const autoRecord = await twilioService.getAutoRecordingSetting(userId); // Assuming tenantId=userId for default
            if (autoRecord) {
                dialParams.record = 'record-from-answer';
                dialParams.recordingStatusCallback = `${process.env.BASE_URL || ''}/api/twilio/recordings/status`;
            }
        }

        return reply.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Dial${Object.entries(dialParams).map(([k,v]) => ` ${k}="${v}"`).join('')}>${To}</Dial></Response>`);
    }

    // Default response
    return reply.send('<?xml version="1.0" encoding="UTF-8"?><Response><Say>Welcome to the platform. Please wait while we connect you.</Say><Dial><Client>admin</Client></Dial></Response>');
>>>>>>> 43bdb2c406eeeb988434b3e253e5d0d7dfff8041
}

export async function handleDialAction(request: FastifyRequest, reply: FastifyReply) {
    const { DialCallStatus, To } = request.body as any;
    const baseUrl = getBaseUrl();
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const twiml = new VoiceResponse();

    if (DialCallStatus !== 'completed') {
        // Redirect to voicemail
        twiml.redirect(`${baseUrl}/api/twilio/voice/voicemail?To=${encodeURIComponent(To)}`);
    }

    reply.header('Content-Type', 'text/xml');
    return reply.send(twiml.toString());
}

export async function handleVoicemail(request: FastifyRequest, reply: FastifyReply) {
    const { To } = request.query as { To: string };
    const baseUrl = getBaseUrl();
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const twiml = new VoiceResponse();

    twiml.say("Please leave a message after the beep.");
    twiml.record({
        maxLength: 120,
        playBeep: true,
        transcribe: true,
        transcribeCallback: `${baseUrl}/api/twilio/voice/transcription`,
        action: `${baseUrl}/api/twilio/voice/voicemail-action?To=${encodeURIComponent(To)}`,
        method: 'POST'
    });

    reply.header('Content-Type', 'text/xml');
    return reply.send(twiml.toString());
}

export async function handleVoicemailAction(request: FastifyRequest, reply: FastifyReply) {
    const { RecordingUrl, RecordingDuration, RecordingSid, From, CallSid } = request.body as any;
    const { To } = request.query as { To: string };
    console.log(`📼 Voicemail recorded: ${RecordingSid}, Duration: ${RecordingDuration}, To: ${To}`);

    const user = await storage.getUserByTwilioPhoneNumber(To);
    if (user) {
        const membership = await storage.getDefaultTenantForUser(user.id);
        const tenantId = membership?.tenantId || 1;
        
        const voicemail = await storage.createVoicemail(tenantId, user.id, {
            userId: user.id,
            phone: From,
            duration: parseInt(RecordingDuration),
            fileUrl: RecordingUrl,
            recordingSid: RecordingSid,
            isRead: false,
            isArchived: false,
            tags: []
        });

        wsService.broadcastNewVoicemail(user.id, voicemail);
    }

    const VoiceResponse = twilio.twiml.VoiceResponse;
    const twiml = new VoiceResponse();
    twiml.say("Thank you for your message. Goodbye.");
    twiml.hangup();

    reply.header('Content-Type', 'text/xml');
    return reply.send(twiml.toString());
}

export async function handleTranscription(request: FastifyRequest, reply: FastifyReply) {
    const { TranscriptionText, TranscriptionStatus, RecordingSid } = request.body as any;
    console.log(`🎤 Transcription received for ${RecordingSid}: ${TranscriptionStatus}`);

    if (TranscriptionStatus === 'completed' && RecordingSid) {
        const voicemail = await storage.getVoicemailByRecordingSid(RecordingSid);
        if (voicemail) {
            const membership = await storage.getDefaultTenantForUser(voicemail.userId);
            const tenantId = membership?.tenantId || 1;
            
            const updatedVoicemail = await storage.updateVoicemail(tenantId, voicemail.userId, voicemail.id, {
                transcription: TranscriptionText,
                transcriptionStatus: 'completed'
            });
            console.log(`✅ Updated transcription for voicemail ${voicemail.id}`);
            wsService.broadcastVoicemailUpdate(voicemail.userId, updatedVoicemail);
        }
    } else if (TranscriptionStatus === 'failed' && RecordingSid) {
        const voicemail = await storage.getVoicemailByRecordingSid(RecordingSid);
        if (voicemail) {
            const membership = await storage.getDefaultTenantForUser(voicemail.userId);
            const tenantId = membership?.tenantId || 1;
            
            const updatedVoicemail = await storage.updateVoicemail(tenantId, voicemail.userId, voicemail.id, {
                transcriptionStatus: 'failed'
            });
            wsService.broadcastVoicemailUpdate(voicemail.userId, updatedVoicemail);
        }
    }
    
    return reply.send({ success: true });
}
