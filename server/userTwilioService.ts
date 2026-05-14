import twilio from 'twilio';
import jwt from 'jsonwebtoken';
import { storage } from './storage';
import { generateWebhookToken } from './utils/webhookAuth';
import { getBaseUrl, getUserTwilioWebhookUrls, isProductionUrl } from './utils/urlConfig';
const { AccessToken } = twilio.jwt;
const VoiceGrant = AccessToken.VoiceGrant;

export interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  apiKeySid?: string | null;
  apiKeySecret?: string | null;
  phoneNumber: string;
  twimlAppSid?: string | null;
}

interface CachedTwilioClient {
  client: twilio.Twilio;
  credentials: TwilioCredentials;
  createdAt: number;
}

class UserTwilioClientCache {
  private cache: Map<number, CachedTwilioClient> = new Map();
  private readonly CACHE_TTL = 30 * 60 * 1000;
  private tokenCache: Map<string, { token: string; expires: number }> = new Map();

  public clearUserCache(userId: number): void {
    this.cache.delete(userId);
    const tokenPrefix = `user_${userId}_`;
    const keysToDelete: string[] = [];
    this.tokenCache.forEach((value, key) => {
      if (key.startsWith(tokenPrefix)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => this.tokenCache.delete(key));
    console.log(`🗑️ Cleared Twilio cache for user ${userId}`);
  }

  public clearAllCache(): void {
    this.cache.clear();
    this.tokenCache.clear();
    console.log('🗑️ Cleared all Twilio client cache');
  }

  public async getTwilioClient(userId: number, tenantId?: string): Promise<{ client: twilio.Twilio; credentials: TwilioCredentials }> {
    const cached = this.cache.get(userId);
    const now = Date.now();

    if (cached && (now - cached.createdAt) < this.CACHE_TTL) {
      return { client: cached.client, credentials: cached.credentials };
    }

    const dbCredentials = await storage.getUserTwilioCredentials(userId);

    if (!dbCredentials) {
      console.log(`❌ Twilio credentials not found in DB for user ${userId}`);
      throw new Error(`Twilio credentials not found for user ${userId}`);
    }

    // Workaround: The UI might check this flag, and it should be true if we have SID and Token
    if (!dbCredentials.twilioConfigured && dbCredentials.twilioAccountSid && dbCredentials.twilioAuthToken) {
      console.log(`🔧 User ${userId} has credentials but configured flag is false. Auto-fixing state...`);
      await storage.updateUserTwilioCredentials(userId, { twilioConfigured: true });
      dbCredentials.twilioConfigured = true;
    }

    console.log(`🔍 User ${userId} status: configured=${dbCredentials.twilioConfigured}, hasSid=${!!dbCredentials.twilioAccountSid}, hasToken=${!!dbCredentials.twilioAuthToken}`);

    if (!dbCredentials.twilioConfigured) {
      throw new Error(`Twilio credentials not configured for user ${userId}`);
    }

    // If tenantId is provided, verify it matches (for multi-tenant safety)
    if (tenantId) {
      // Corrected parameter order: tenantId first, then userId
      const membership = await storage.getTenantMembership(Number(tenantId), userId);
      if (!membership) {
        console.warn(`🔒 Security Alert: User ${userId} attempted to access Twilio credentials for tenant ${tenantId} without membership.`);
        throw new Error(`Security Alert: Access denied for tenant ${tenantId}.`);
      }
    }

    if (!dbCredentials.twilioAccountSid || !dbCredentials.twilioAuthToken || !dbCredentials.twilioPhoneNumber) {
      throw new Error(`Invalid Twilio credentials for user ${userId}`);
    }

    const credentials: TwilioCredentials = {
      accountSid: dbCredentials.twilioAccountSid,
      authToken: dbCredentials.twilioAuthToken,
      apiKeySid: dbCredentials.twilioApiKeySid || null,
      apiKeySecret: dbCredentials.twilioApiKeySecret || null,
      phoneNumber: dbCredentials.twilioPhoneNumber,
      twimlAppSid: dbCredentials.twilioTwimlAppSid || null,
    };

    const client = twilio(credentials.accountSid, credentials.authToken);

    this.cache.set(userId, {
      client,
      credentials,
      createdAt: now,
    });

    console.log(`✅ Created and cached Twilio client for user ${userId}`);
    return { client, credentials };
  }

  public async generateAccessToken(userId: number, identity: string, baseUrl?: string): Promise<string> {
    let { credentials } = await this.getTwilioClient(userId);

    // Use centralized base URL if not provided
    const effectiveBaseUrl = baseUrl || getBaseUrl();
    
    // Only update webhooks if we have a reliable base URL (not localhost)
    const shouldUpdateWebhooks = isProductionUrl(effectiveBaseUrl);

    // Auto-create TwiML Application if missing (required for Voice SDK)
    if (!credentials.twimlAppSid) {
      console.log(`📱 TwiML App SID missing for user ${userId}, auto-creating...`);
      
      try {
        const application = await this.createTwiMLApplication(userId, effectiveBaseUrl);
        console.log(`✅ Auto-created TwiML Application for user ${userId}: ${application.sid}`);
        
        // Refresh credentials to get the newly created TwiML App SID
        this.clearUserCache(userId);
        const refreshed = await this.getTwilioClient(userId);
        credentials = refreshed.credentials;
      } catch (error: any) {
        console.error(`❌ Failed to auto-create TwiML Application for user ${userId}:`, error.message);
        throw new Error(`TwiML Application SID is required for Voice SDK. Auto-creation failed: ${error.message}`);
      }
    } else if (shouldUpdateWebhooks) {
      // Verify and update existing TwiML App webhooks only if we have a reliable base URL
      try {
        await this.verifyAndUpdateTwiMLWebhooks(userId, effectiveBaseUrl);
      } catch (error: any) {
        console.error(`⚠️ Failed to verify TwiML App webhooks for user ${userId}:`, error.message);
        // Don't fail token generation if webhook update fails
      }
    }

    const cacheKey = `user_${userId}_${identity}`;
    const cached = this.tokenCache.get(cacheKey);

    if (cached && cached.expires > Date.now() + 300000) {
      return cached.token;
    }

    let accessToken: InstanceType<typeof AccessToken>;

    if (credentials.apiKeySid && credentials.apiKeySecret) {
      accessToken = new AccessToken(
        credentials.accountSid,
        credentials.apiKeySid,
        credentials.apiKeySecret,
        {
          identity: identity.toString(),
          ttl: 3600,
          nbf: Math.floor(Date.now() / 1000) - 60
        }
      );
    } else {
      accessToken = new AccessToken(
        credentials.accountSid,
        credentials.accountSid,
        credentials.authToken,
        {
          identity: identity.toString(),
          ttl: 3600,
          nbf: Math.floor(Date.now() / 1000) - 60
        }
      );
    }

    const voiceGrant = new VoiceGrant({
      incomingAllow: true,
      outgoingApplicationSid: credentials.twimlAppSid || undefined,
      pushCredentialSid: undefined,
    });

    accessToken.addGrant(voiceGrant);

    const token = accessToken.toJwt();

    this.tokenCache.set(cacheKey, {
      token,
      expires: Date.now() + 3600000,
    });

    console.log(`✅ Generated access token for user ${userId}, identity: ${identity}`);
    return token;
  }

  public async makeCall(userId: number, fromNumber: string, toNumber: string, twimlUrl: string): Promise<any> {
    const { client, credentials } = await this.getTwilioClient(userId);

    const call = await client.calls.create({
      from: fromNumber || credentials.phoneNumber,
      to: toNumber,
      url: twimlUrl,
    });

    console.log(`📞 Call initiated by user ${userId}: ${call.sid}`);
    return call;
  }

  public async sendSms(userId: number, to: string, message: string, from?: string): Promise<any> {
    const { client, credentials } = await this.getTwilioClient(userId);

    const sms = await client.messages.create({
      from: from || credentials.phoneNumber,
      to: to,
      body: message,
    });

    console.log(`📨 SMS sent by user ${userId}: ${sms.sid}`);
    return sms;
  }

  public async testConnection(userId: number): Promise<boolean> {
    try {
      const { client, credentials } = await this.getTwilioClient(userId);
      const account = await client.api.accounts(credentials.accountSid).fetch();
      return account.status === 'active';
    } catch (error) {
      console.error(`Twilio connection test failed for user ${userId}:`, error);
      return false;
    }
  }

  public generateTwiML(action: 'dial' | 'hangup' | 'redirect' | 'dial-client', params?: any): string {
    const { twiml } = twilio;
    const response = new twiml.VoiceResponse();

    switch (action) {
      case 'dial':
        if (params?.number) {
          if (params.number.startsWith('client:')) {
            const dial = response.dial();
            dial.client(params.number.replace('client:', ''));
          } else {
            response.dial(params.number);
          }
        } else {
          response.say('Invalid number provided');
        }
        break;
      case 'dial-client':
        if (params?.clientName) {
          const dial = response.dial();
          dial.client(params.clientName);
        } else {
          response.say('Client name not provided');
        }
        break;
      case 'hangup':
        response.hangup();
        break;
      case 'redirect':
        if (params?.url) {
          response.redirect(params.url);
        }
        break;
      default:
        response.say('Hello, this is a test call from your Twilio integration');
    }

    return response.toString();
  }

  public async verifyAndUpdateTwiMLWebhooks(userId: number, baseUrl: string): Promise<any> {
    const { client, credentials } = await this.getTwilioClient(userId);

    if (!credentials.twimlAppSid) {
      console.log(`No TwiML App SID for user ${userId}, will create new one`);
      return null;
    }

    try {
      const existingApp = await client.applications(credentials.twimlAppSid).fetch();
      
      const token = generateWebhookToken(userId);
      const webhookUrls = getUserTwilioWebhookUrls(token, baseUrl);
      
      const needsUpdate = 
        existingApp.voiceUrl !== webhookUrls.voiceUrl ||
        existingApp.statusCallback !== webhookUrls.statusCallbackUrl ||
        existingApp.voiceMethod !== 'POST' ||
        existingApp.statusCallbackMethod !== 'POST';

      if (needsUpdate) {
        console.log(`🔄 Updating TwiML App webhooks for user ${userId}...`);
        console.log(`  Current Voice URL: ${existingApp.voiceUrl}`);
        console.log(`  Expected Voice URL: ${webhookUrls.voiceUrl}`);
        console.log(`  Current Status URL: ${existingApp.statusCallback}`);
        console.log(`  Expected Status URL: ${webhookUrls.statusCallbackUrl}`);
        
        const updatedApp = await client.applications(credentials.twimlAppSid).update({
          voiceUrl: webhookUrls.voiceUrl,
          voiceMethod: 'POST',
          statusCallback: webhookUrls.statusCallbackUrl,
          statusCallbackMethod: 'POST'
        });

        console.log(`✅ TwiML App webhooks updated for user ${userId}`);
        return updatedApp;
      } else {
        console.log(`✓ TwiML App webhooks already correct for user ${userId}`);
        return existingApp;
      }
    } catch (error: any) {
      console.error(`❌ Failed to verify/update TwiML App for user ${userId}:`, error.message);
      throw error;
    }
  }

  public async createTwiMLApplication(userId: number, baseUrl: string): Promise<any> {
    const { client, credentials } = await this.getTwilioClient(userId);

    if (credentials.twimlAppSid) {
      try {
        const existingApp = await client.applications(credentials.twimlAppSid).fetch();
        
        const token = generateWebhookToken(userId);
        const webhookUrls = getUserTwilioWebhookUrls(token, baseUrl);
        
        const needsUpdate = 
          existingApp.voiceUrl !== webhookUrls.voiceUrl ||
          existingApp.statusCallback !== webhookUrls.statusCallbackUrl;

        if (needsUpdate) {
          console.log(`🔄 Existing TwiML App found but needs webhook update for user ${userId}`);
          return await this.verifyAndUpdateTwiMLWebhooks(userId, baseUrl);
        }
        
        return existingApp;
      } catch (error) {
        console.log(`Existing TwiML app not found for user ${userId}, creating new one...`);
      }
    }

    const token = generateWebhookToken(userId);
    const webhookUrls = getUserTwilioWebhookUrls(token, baseUrl);
    
    const application = await client.applications.create({
      friendlyName: `CRM Dialer WebRTC App - User ${userId}`,
      voiceUrl: webhookUrls.voiceUrl,
      voiceMethod: 'POST',
      statusCallback: webhookUrls.statusCallbackUrl,
      statusCallbackMethod: 'POST'
    });

    await storage.updateUserTwilioCredentials(userId, {
      twilioTwimlAppSid: application.sid
    });

    this.clearUserCache(userId);

    console.log(`✅ Created TwiML Application for user ${userId}:`, application.sid);
    return application;
  }

  public async getConnectionStatus(userId: number): Promise<{
    isConnected: boolean;
    lastCheck: Date;
    accountStatus?: string;
    diagnostics: {
      hasCredentials: boolean;
      hasClient: boolean;
      canMakeCalls: boolean;
      errorDetails?: string;
    };
  }> {
    const diagnostics = {
      hasCredentials: false,
      hasClient: false,
      canMakeCalls: false,
      errorDetails: undefined as string | undefined,
    };

    let isConnected = false;
    let accountStatus: string | undefined;

    try {
      const { client, credentials } = await this.getTwilioClient(userId);
      diagnostics.hasCredentials = true;
      diagnostics.hasClient = true;

      const account = await client.api.accounts(credentials.accountSid).fetch();
      isConnected = account.status === 'active';
      accountStatus = account.status;
      diagnostics.canMakeCalls = isConnected;
    } catch (error: any) {
      diagnostics.errorDetails = error.message;
      isConnected = false;
    }

    return {
      isConnected,
      lastCheck: new Date(),
      accountStatus,
      diagnostics,
    };
  }
}

export const userTwilioCache = new UserTwilioClientCache();

export function clearTwilioCacheOnLogout(userId: number): void {
  userTwilioCache.clearUserCache(userId);
}

export function clearAllTwilioCache(): void {
  userTwilioCache.clearAllCache();
}
