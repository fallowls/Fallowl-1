import { FastifyRequest, FastifyReply } from 'fastify';
import { storage } from '../../storage';
import { userTwilioCache, clearTwilioCacheOnLogout } from '../../userTwilioService';
import { wsService } from '../../websocketService';
import twilio from 'twilio';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../../utils/errors';

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

  const baseUrl = process.env.REPLIT_DOMAINS 
    ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
    : `https://${request.hostname}`;

  const accessToken = await userTwilioCache.generateAccessToken(userId, user.username, baseUrl);
  
  return reply.send({ 
    accessToken,
    expiresIn: 3600,
    identity: user.username 
  });
}

export async function handleVoice(request: FastifyRequest, reply: FastifyReply) {
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
        // If it's an outbound call from the client to a real number
        // The From will be the client identity
        return reply.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Dial callerId="${From.startsWith('client:') ? (request as any).userPhoneNumber || From : From}">${To}</Dial></Response>`);
    }

    // Default response
    return reply.send('<?xml version="1.0" encoding="UTF-8"?><Response><Say>Welcome to the platform. Please wait while we connect you.</Say><Dial><Client>admin</Client></Dial></Response>');
}

// ... other twilio methods would be refactored here ...
