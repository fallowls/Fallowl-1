import { storage } from '../storage';
import twilio from 'twilio';
import { getBaseUrl, getTwilioWebhookUrls, logUrlConfiguration } from '../utils/urlConfig';

export class TwilioConfigService {
  private static instance: TwilioConfigService;
  
  static getInstance(): TwilioConfigService {
    if (!TwilioConfigService.instance) {
      TwilioConfigService.instance = new TwilioConfigService();
    }
    return TwilioConfigService.instance;
  }

  /**
   * Comprehensive Twilio configuration that runs whenever API keys change
   * This ensures all settings are properly configured for the dialer to work
   */
  async configureDialerSettings(credentials: {
    accountSid: string;
    authToken: string;
    apiKeySid?: string;
    apiKeySecret?: string;
    phoneNumber?: string;
    twimlAppSid?: string;
  }): Promise<{
    success: boolean;
    message: string;
    details: Record<string, any>;
  }> {
    console.log('🔧 Starting comprehensive dialer configuration...');
    
    try {
      const results: Record<string, any> = {};
      
      // 1. Validate Twilio credentials
      results.credentialsValidation = await this.validateTwilioCredentials(credentials);
      
      // 2. Create or update API Keys if needed
      if (!credentials.apiKeySid || !credentials.apiKeySecret) {
        results.apiKeyCreation = await this.createApiKey(credentials);
        credentials.apiKeySid = results.apiKeyCreation.keySid;
        credentials.apiKeySecret = results.apiKeyCreation.keySecret;
      }
      
      // 3. Create or update TwiML Application
      results.twimlAppConfiguration = await this.configureTwimlApplication(credentials);
      credentials.twimlAppSid = results.twimlAppConfiguration.applicationSid;
      
      // 4. Configure phone number with webhooks
      results.phoneNumberConfiguration = await this.configurePhoneNumber(credentials);
      
      // 5. Test token generation
      if (credentials.apiKeySid && credentials.apiKeySecret && credentials.twimlAppSid) {
        results.tokenGeneration = await this.testTokenGeneration({
          accountSid: credentials.accountSid,
          authToken: credentials.authToken,
          apiKeySid: credentials.apiKeySid,
          apiKeySecret: credentials.apiKeySecret,
          twimlAppSid: credentials.twimlAppSid
        });
      }
      
      // 6. Configure default call settings
      results.callSettingsConfiguration = await this.configureCallSettings();
      
      // 7. Save all settings to database
      if (credentials.apiKeySid && credentials.apiKeySecret && credentials.phoneNumber && credentials.twimlAppSid) {
        results.settingsSave = await this.saveCompleteConfiguration({
          accountSid: credentials.accountSid,
          authToken: credentials.authToken,
          apiKeySid: credentials.apiKeySid,
          apiKeySecret: credentials.apiKeySecret,
          phoneNumber: credentials.phoneNumber,
          twimlAppSid: credentials.twimlAppSid
        });
      }
      
      console.log('✅ Dialer configuration completed successfully');
      
      return {
        success: true,
        message: 'Dialer configured successfully with all required settings',
        details: results
      };
      
    } catch (error: any) {
      console.error('❌ Dialer configuration failed:', error);
      
      return {
        success: false,
        message: `Configuration failed: ${error.message}`,
        details: { error: error.message }
      };
    }
  }

  /**
   * Validate Twilio credentials by making a test API call
   */
  private async validateTwilioCredentials(credentials: {
    accountSid: string;
    authToken: string;
  }): Promise<{ valid: boolean; accountInfo?: any; error?: string }> {
    try {
      const client = twilio(credentials.accountSid, credentials.authToken);
      const account = await client.api.v2010.accounts(credentials.accountSid).fetch();
      
      return {
        valid: true,
        accountInfo: {
          friendlyName: account.friendlyName,
          status: account.status,
          type: account.type
        }
      };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Create a new API Key for Voice SDK
   */
  private async createApiKey(credentials: {
    accountSid: string;
    authToken: string;
  }): Promise<{ keySid: string; keySecret: string }> {
    try {
      const client = twilio(credentials.accountSid, credentials.authToken);
      const key = await client.newKeys.create({
        friendlyName: `DialPax Voice SDK Key - ${new Date().toISOString().split('T')[0]}`
      });
      
      console.log('✅ Created new API Key for Voice SDK');
      
      return {
        keySid: key.sid,
        keySecret: key.secret
      };
    } catch (error: any) {
      console.error('❌ Failed to create API Key:', error);
      throw new Error(`API Key creation failed: ${error.message}`);
    }
  }

  /**
   * Configure TwiML Application with proper webhooks
   */
  private async configureTwimlApplication(credentials: {
    accountSid: string;
    authToken: string;
    twimlAppSid?: string;
  }): Promise<{ applicationSid: string; created: boolean }> {
    try {
      const client = twilio(credentials.accountSid, credentials.authToken);
      const baseUrl = getBaseUrl();
      const webhookUrls = getTwilioWebhookUrls(baseUrl);
      
      logUrlConfiguration();
      
      const webhookConfig = {
        friendlyName: 'DialPax Voice Application',
        voiceUrl: webhookUrls.voiceUrl,
        voiceMethod: 'POST' as const,
        statusCallback: webhookUrls.statusCallbackUrl,
        statusCallbackMethod: 'POST' as const
      };
      
      let applicationSid = credentials.twimlAppSid;
      let created = false;
      
      if (applicationSid) {
        // Update existing application
        try {
          await client.applications(applicationSid).update(webhookConfig);
          console.log('✅ Updated existing TwiML Application:', applicationSid);
        } catch (error) {
          console.log('⚠️ Failed to update existing application, creating new one');
          applicationSid = undefined;
        }
      }
      
      if (!applicationSid) {
        // Create new application
        const application = await client.applications.create(webhookConfig);
        applicationSid = application.sid;
        created = true;
        console.log('✅ Created new TwiML Application:', applicationSid);
      }
      
      return { applicationSid, created };
    } catch (error: any) {
      console.error('❌ TwiML Application configuration failed:', error);
      throw new Error(`TwiML Application configuration failed: ${error.message}`);
    }
  }

  /**
   * Configure phone number with proper webhooks
   */
  private async configurePhoneNumber(credentials: {
    accountSid: string;
    authToken: string;
    phoneNumber?: string;
  }): Promise<{ phoneNumber: string; configured: boolean }> {
    try {
      const client = twilio(credentials.accountSid, credentials.authToken);
      
      // Get available phone numbers
      const phoneNumbers = await client.incomingPhoneNumbers.list({ limit: 1 });
      
      if (phoneNumbers.length === 0) {
        throw new Error('No phone numbers available in this account');
      }
      
      const phoneNumber = phoneNumbers[0];
      const baseUrl = getBaseUrl();
      const webhookUrls = getTwilioWebhookUrls(baseUrl);
      
      // Configure phone number webhooks
      await client.incomingPhoneNumbers(phoneNumber.sid).update({
        voiceUrl: webhookUrls.voiceUrl,
        voiceMethod: 'POST',
        statusCallback: webhookUrls.statusCallbackUrl,
        statusCallbackMethod: 'POST'
      });
      
      console.log('✅ Configured phone number webhooks:', phoneNumber.phoneNumber);
      
      return {
        phoneNumber: phoneNumber.phoneNumber,
        configured: true
      };
    } catch (error: any) {
      console.error('❌ Phone number configuration failed:', error);
      return {
        phoneNumber: credentials.phoneNumber || '',
        configured: false
      };
    }
  }

  /**
   * Test token generation with new credentials
   */
  private async testTokenGeneration(credentials: {
    accountSid: string;
    authToken: string;
    apiKeySid: string;
    apiKeySecret: string;
    twimlAppSid: string;
  }): Promise<{ success: boolean; tokenLength?: number; error?: string }> {
    try {
      const { AccessToken } = twilio.jwt;
      const VoiceGrant = AccessToken.VoiceGrant;
      
      const accessToken = new AccessToken(
        credentials.accountSid,
        credentials.apiKeySid,
        credentials.apiKeySecret,
        { 
          identity: 'test-user',
          ttl: 3600
        }
      );
      
      const voiceGrant = new VoiceGrant({
        outgoingApplicationSid: credentials.twimlAppSid,
        incomingAllow: true
      });
      
      accessToken.addGrant(voiceGrant);
      const token = accessToken.toJwt();
      
      return {
        success: true,
        tokenLength: token.length
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Configure default call settings
   */
  private async configureCallSettings(tenantId: number = 1): Promise<{ configured: boolean }> {
    try {
      const defaultCallSettings = {
        autoRecord: true,
        callTimeout: 120,
        enableCallWaiting: true,
        enableConferencing: true,
        enableTransfer: true,
        enableRecording: true,
        enableVoicemail: true,
        voicemailTimeout: 30,
        callQualityReporting: true
      };
      
      await storage.setSetting(tenantId, 'call-settings', defaultCallSettings);
      console.log(`✅ Configured default call settings for tenant ${tenantId}`);
      
      return { configured: true };
    } catch (error: any) {
      console.error('❌ Call settings configuration failed:', error);
      return { configured: false };
    }
  }

  /**
   * Save complete configuration to database
   */
  private async saveCompleteConfiguration(credentials: {
    accountSid: string;
    authToken: string;
    apiKeySid: string;
    apiKeySecret: string;
    phoneNumber: string;
    twimlAppSid: string;
  }, tenantId: number = 1): Promise<{ saved: boolean }> {
    try {
      await storage.setSetting(tenantId, 'twilio', {
        accountSid: credentials.accountSid,
        authToken: credentials.authToken,
        apiKeySid: credentials.apiKeySid,
        apiKeySecret: credentials.apiKeySecret,
        phoneNumber: credentials.phoneNumber,
        twimlAppSid: credentials.twimlAppSid,
        configured: true,
        configuredAt: new Date().toISOString()
      });
      
      console.log(`✅ Saved complete Twilio configuration for tenant ${tenantId}`);
      return { saved: true };
    } catch (error: any) {
      console.error('❌ Failed to save configuration:', error);
      return { saved: false };
    }
  }

}

export const twilioConfigService = TwilioConfigService.getInstance();