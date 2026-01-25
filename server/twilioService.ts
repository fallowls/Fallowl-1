import twilio from 'twilio';
import jwt from 'jsonwebtoken';
const { AccessToken } = twilio.jwt;
const VoiceGrant = AccessToken.VoiceGrant;

interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  apiKeySid?: string;
  apiKeySecret?: string;
  phoneNumber: string;
  twimlAppSid?: string;
}

export class TwilioService {
  private client: twilio.Twilio | null = null;
  private credentials: TwilioCredentials | null = null;
  private connectionMonitor: NodeJS.Timeout | null = null;
  private tokenCache: Map<string, { token: string; expires: number }> = new Map();
  private isMonitoring = false;

  constructor() {
    // Note: Global TwilioService is deprecated - use userTwilioCache for per-user credentials
  }

  public async updateCredentials(credentials: TwilioCredentials): Promise<void> {
    this.credentials = credentials;
    
    // Only create client if credentials are valid
    if (this.isValidCredentials(credentials)) {
      this.client = twilio(credentials.accountSid, credentials.authToken);
      console.log('✅ Twilio credentials updated successfully');
      
      // Auto-create TwiML Application if not exists (await to avoid race condition)
      await this.autoCreateTwiMLApp();
      
      // Restart connection monitoring with new credentials
      this.stopConnectionMonitoring();
      this.startConnectionMonitoring();
    } else {
      this.client = null;
      console.warn('⚠️ Invalid Twilio credentials provided');
      
      // Stop monitoring if credentials are invalid
      this.stopConnectionMonitoring();
    }
  }

  public isConfigured(): boolean {
    return this.client !== null && this.credentials !== null;
  }

  public getCredentials(): TwilioCredentials | null {
    return this.credentials;
  }

  public getTwilioClient() {
    if (!this.client) {
      throw new Error("Twilio client not initialized. Please configure Twilio credentials first.");
    }
    return this.client;
  }

  public async updateAutoRecordingSetting(enabled: boolean, tenantId: number): Promise<{ success: boolean; message: string; autoRecordingEnabled: boolean }> {
    try {
      if (!this.client || !this.credentials) {
        throw new Error('Twilio client not configured');
      }

      // Update TwiML App with recording settings if needed
      const baseUrl = process.env.REPLIT_DOMAINS 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : process.env.REPLIT_DEV_DOMAIN
          ? `https://${process.env.REPLIT_DEV_DOMAIN}`
          : 'https://localhost:5000';
      
      await this.client.applications(this.credentials.twimlAppSid!).update({
        voiceUrl: `${baseUrl}/api/twilio/voice`,
        voiceMethod: 'POST',
        statusCallback: `${baseUrl}/api/twilio/status`,
        statusCallbackMethod: 'POST'
      });

      // Store the recording preference using storage
      const { storage } = await import('./storage');
      await storage.setSetting(tenantId, "auto_record_calls", enabled);

      return {
        success: true,
        message: `Auto-recording ${enabled ? 'enabled' : 'disabled'} successfully`,
        autoRecordingEnabled: enabled
      };
    } catch (error: any) {
      console.error('Auto-recording update error:', error);
      throw new Error(`Failed to update auto-recording: ${error.message}`);
    }
  }

  public async getAutoRecordingSetting(tenantId: number): Promise<boolean> {
    try {
      const { storage } = await import('./storage');
      const setting = await storage.getSetting(tenantId, "auto_record_calls");
      // Handle JSON-encoded values from database
      if (setting?.value === "true" || setting?.value === true) {
        return true;
      }
      if (setting?.value === "false" || setting?.value === false) {
        return false;
      }
      return true; // Default to true
    } catch (error) {
      console.error("Error getting auto-recording setting:", error);
      return true; // Default to true
    }
  }

  private isValidCredentials(credentials: TwilioCredentials): boolean {
    // Basic validation - account SID should start with AC, auth token should be present
    if (!credentials.accountSid || !credentials.authToken || !credentials.phoneNumber) {
      return false;
    }
    
    // Account SID must start with AC (Twilio account SID format)
    if (!credentials.accountSid.startsWith('AC')) {
      return false;
    }
    
    // Auth token should be a non-empty string (no arbitrary length requirement)
    // Twilio auth tokens can vary in length, so we just check it exists
    if (credentials.authToken.trim().length === 0) {
      return false;
    }
    
    // Phone number should be in E.164 format (starts with + followed by digits)
    // More flexible to accept international numbers
    if (!credentials.phoneNumber.match(/^\+[1-9]\d{1,14}$/)) {
      return false;
    }
    
    return true;
  }

  public async generateAccessToken(identity: string): Promise<string> {
    if (!this.credentials) {
      throw new Error('Twilio credentials not configured');
    }

    // Validate all required credentials
    if (!this.credentials.accountSid || !this.credentials.authToken) {
      throw new Error('Account SID and Auth Token are required');
    }

    if (!this.credentials.twimlAppSid) {
      throw new Error('TwiML Application SID is required for Voice SDK');
    }

    // Validate the Account SID format
    if (!this.credentials.accountSid.startsWith('AC')) {
      throw new Error('Invalid Account SID format');
    }

    // Always use Account SID/Auth Token since the API Key is failing authentication
    const keySid = this.credentials.accountSid;
    const keySecret = this.credentials.authToken;
    
    console.log(`Generating access token for identity: ${identity}`);

    try {
      // Try to create proper access token with explicit identity management
      // For Trial accounts, we need to handle the identity carefully
      let accessToken: InstanceType<typeof AccessToken>;
      
      if (this.credentials.apiKeySid && this.credentials.apiKeySecret) {
        // Use API Key if available (preferred method)
        console.log('Using API Key for token generation');
        accessToken = new AccessToken(
          this.credentials.accountSid,
          this.credentials.apiKeySid,
          this.credentials.apiKeySecret,
          { 
            identity: identity.toString(),
            ttl: 3600,
            nbf: Math.floor(Date.now() / 1000) - 60
          }
        );
      } else {
        // Fallback to Account SID/Auth Token (Trial account limitation)
        console.log('Using Account SID/Auth Token for token generation');
        accessToken = new AccessToken(
          this.credentials.accountSid,
          this.credentials.accountSid,
          this.credentials.authToken,
          { 
            identity: identity.toString(),
            ttl: 3600,
            nbf: Math.floor(Date.now() / 1000) - 60
          }
        );
      }

      // Create voice grant with comprehensive configuration
      const voiceGrant = new VoiceGrant({
        incomingAllow: true,
        outgoingApplicationSid: this.credentials.twimlAppSid,
        // Allow incoming calls for this identity
        pushCredentialSid: undefined, // Not needed for web applications
      });

      accessToken.addGrant(voiceGrant);

      const token = accessToken.toJwt();
      
      // Validate the token before returning
      if (!token || typeof token !== 'string' || token.length === 0) {
        throw new Error('Generated token appears to be invalid');
      }

      console.log(`✅ Generated access token for identity: ${identity}`);
      return token;

    } catch (error: any) {
      console.error('Token generation failed:', error);
      throw new Error(`Failed to generate access token: ${error.message}`);
    }
  }

  public async makeCall(fromNumber: string, toNumber: string, twimlUrl: string): Promise<any> {
    if (!this.client || !this.credentials) {
      throw new Error('Twilio client not configured');
    }

    try {
      const call = await this.client.calls.create({
        from: fromNumber || this.credentials.phoneNumber,
        to: toNumber,
        url: twimlUrl,
      });

      return call;
    } catch (error) {
      console.error('Error making call:', error);
      throw error;
    }
  }

  public async testConnection(): Promise<boolean> {
    if (!this.client || !this.credentials) {
      return false;
    }

    try {
      // Test by fetching account information
      const account = await this.client.api.accounts(this.credentials.accountSid).fetch();
      return account.status === 'active';
    } catch (error) {
      console.error('Twilio connection test failed:', error);
      return false;
    }
  }

  public generateTwiML(action: 'dial' | 'hangup' | 'redirect' | 'dial-client', params?: any): string {
    const { twiml } = twilio;
    const response = new twiml.VoiceResponse();

    switch (action) {
      case 'dial':
        if (params?.number) {
          // Check if the number is a client (starts with 'client:')
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
        // Route call to browser client instead of external number
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

  // Enhanced connection monitoring and management
  private startConnectionMonitoring(): void {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.connectionMonitor = setInterval(async () => {
      try {
        // Only monitor if we have valid credentials
        if (this.credentials && this.isValidCredentials(this.credentials)) {
          const isConnected = await this.testConnection();
          if (!isConnected) {
            console.warn('Twilio connection lost, attempting to reconnect...');
            this.attemptReconnection();
          }
        }
      } catch (error) {
        console.error('Connection monitoring error:', error);
      }
    }, 30000); // Check every 30 seconds
  }

  private stopConnectionMonitoring(): void {
    if (this.connectionMonitor) {
      clearInterval(this.connectionMonitor);
      this.connectionMonitor = null;
    }
    this.isMonitoring = false;
  }

  private async attemptReconnection(): Promise<void> {
    try {
      if (this.credentials && this.isValidCredentials(this.credentials)) {
        this.client = twilio(this.credentials.accountSid, this.credentials.authToken);
        const isConnected = await this.testConnection();
        if (isConnected) {
          console.log('Twilio reconnection successful');
        }
      }
    } catch (error) {
      console.error('Reconnection failed:', error);
    }
  }

  // Auto-create TwiML Application if needed or update URLs if it exists
  private async autoCreateTwiMLApp(): Promise<void> {
    try {
      if (!this.client || !this.credentials) {
        throw new Error('Twilio client not configured');
      }

      // Get base URL from environment
      const baseUrl = process.env.REPLIT_DOMAINS 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : process.env.REPLIT_DEV_DOMAIN
          ? `https://${process.env.REPLIT_DEV_DOMAIN}`
          : 'https://localhost:5000';
      
      const voiceUrl = `${baseUrl}/api/twilio/voice`;
      const statusCallbackUrl = `${baseUrl}/api/twilio/status`;

      // If TwiML App SID doesn't exist, create a new one
      if (!this.credentials.twimlAppSid) {
        console.log('📱 No TwiML Application SID found, auto-creating...');
        
        const application = await this.createTwiMLApplication(baseUrl);
        
        // Update credentials with new TwiML App SID
        if (application && application.sid && this.credentials) {
          const updatedCredentials: TwilioCredentials = {
            accountSid: this.credentials.accountSid,
            authToken: this.credentials.authToken,
            phoneNumber: this.credentials.phoneNumber,
            apiKeySid: this.credentials.apiKeySid,
            apiKeySecret: this.credentials.apiKeySecret,
            twimlAppSid: application.sid
          };
          
          // Update database
          const { storage } = await import('./storage');
          await storage.setSetting(Number(this.credentials.accountSid), 'twilio', updatedCredentials);
          
          // Update current credentials
          this.credentials = updatedCredentials;
          
          console.log('✅ TwiML Application created and saved:', {
            sid: application.sid,
            voiceUrl: application.voiceUrl,
            statusCallback: application.statusCallback
          });
        }
      } else {
        // TwiML App exists - update its URLs to ensure they're correct
        console.log('🔄 TwiML Application exists, updating URLs...');
        
        try {
          const updatedApp = await this.client.applications(this.credentials.twimlAppSid).update({
            voiceUrl: voiceUrl,
            voiceMethod: 'POST',
            smsUrl: `${baseUrl}/api/twilio/sms`,
            smsMethod: 'POST',
            statusCallback: statusCallbackUrl,
            statusCallbackMethod: 'POST'
          });

          console.log('✅ TwiML Application URLs updated successfully:', {
            sid: updatedApp.sid,
            friendlyName: updatedApp.friendlyName,
            voiceUrl: updatedApp.voiceUrl,
            smsUrl: updatedApp.smsUrl,
            statusCallback: updatedApp.statusCallback
          });
        } catch (updateError: any) {
          // If update fails (e.g., app was deleted), try to create a new one
          if (updateError.status === 404 || updateError.code === 20404) {
            console.log('⚠️ TwiML Application not found, creating new one...');
            
            const application = await this.createTwiMLApplication(baseUrl);
            
            if (application && application.sid && this.credentials) {
              const updatedCredentials: TwilioCredentials = {
                accountSid: this.credentials.accountSid,
                authToken: this.credentials.authToken,
                phoneNumber: this.credentials.phoneNumber,
                apiKeySid: this.credentials.apiKeySid,
                apiKeySecret: this.credentials.apiKeySecret,
                twimlAppSid: application.sid
              };
              
              // Update database
              const { storage } = await import('./storage');
              await storage.setSetting(Number(this.credentials.accountSid), 'twilio', updatedCredentials);
              
              // Update current credentials
              this.credentials = updatedCredentials;
              
              console.log('✅ TwiML Application recreated and saved:', {
                sid: application.sid,
                voiceUrl: application.voiceUrl,
                statusCallback: application.statusCallback
              });
            }
          } else {
            throw updateError;
          }
        }
      }
    } catch (error) {
      console.error('❌ Failed to auto-create/update TwiML Application:', error);
    }
  }

  // Create or get TwiML Application for WebRTC calling
  public async createTwiMLApplication(baseUrl: string): Promise<any> {
    if (!this.client || !this.credentials) {
      throw new Error('Twilio client not configured');
    }

    try {
      // Check if TwiML app already exists
      if (this.credentials.twimlAppSid) {
        try {
          const existingApp = await this.client.applications(this.credentials.twimlAppSid).fetch();
          return existingApp;
        } catch (error) {
          console.log('Existing TwiML app not found, creating new one...');
        }
      }

      // Create new TwiML application
      const application = await this.client.applications.create({
        friendlyName: 'CRM Dialer WebRTC App',
        voiceUrl: `${baseUrl}/api/twilio/voice`,
        voiceMethod: 'POST',
        statusCallback: `${baseUrl}/api/twilio/status`,
        statusCallbackMethod: 'POST'
      });

      console.log('Created TwiML Application:', {
        sid: application.sid,
        friendlyName: application.friendlyName,
        voiceUrl: application.voiceUrl
      });

      return application;
    } catch (error) {
      console.error('Error creating TwiML application:', error);
      throw error;
    }
  }

  // Enhanced token management with caching and expiration
  public async generateAccessTokenWithCache(identity: string): Promise<string> {
    const cacheKey = identity;
    const cached = this.tokenCache.get(cacheKey);
    
    // Return cached token if still valid (with 5 minute buffer)
    if (cached && cached.expires > Date.now() + 300000) {
      return cached.token;
    }

    const token = await this.generateAccessToken(identity);
    
    // Cache token with 1 hour expiration
    this.tokenCache.set(cacheKey, {
      token,
      expires: Date.now() + 3600000, // 1 hour
    });

    return token;
  }

  // Clear token cache for user (useful for forced refresh)
  public clearTokenCache(identity?: string): void {
    if (identity) {
      this.tokenCache.delete(identity);
    } else {
      this.tokenCache.clear();
    }
  }

  // Get connection status and diagnostics
  public async getConnectionStatus(): Promise<{
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
      hasCredentials: !!this.credentials,
      hasClient: !!this.client,
      canMakeCalls: false,
      errorDetails: undefined as string | undefined,
    };

    let isConnected = false;
    let accountStatus: string | undefined;

    try {
      if (this.client && this.credentials) {
        const account = await this.client.api.accounts(this.credentials.accountSid).fetch();
        isConnected = account.status === 'active';
        accountStatus = account.status;
        diagnostics.canMakeCalls = isConnected;
      }
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

  // Enhanced error handling for calls
  public async makeCallWithRetry(
    fromNumber: string, 
    toNumber: string, 
    twimlUrl: string,
    retries: number = 2
  ): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.makeCall(fromNumber, toNumber, twimlUrl);
      } catch (error: any) {
        lastError = error;
        console.error(`Call attempt ${attempt + 1} failed:`, error);

        // Don't retry for certain errors
        if (error.code === 21217 || error.code === 21218) { // Invalid phone numbers
          throw error;
        }

        if (attempt < retries) {
          // Wait before retry with exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          
          // Try to reconnect if connection issue
          if (error.code >= 20000 && error.code < 30000) {
            await this.attemptReconnection();
          }
        }
      }
    }

    throw lastError;
  }

  // Cleanup method
  public cleanup(): void {
    this.stopConnectionMonitoring();
    this.tokenCache.clear();
  }

  // Device registration tracking
  private registeredDevices: Set<string> = new Set();

  public registerDevice(identity: string): void {
    this.registeredDevices.add(identity);
    console.log(`Device registered for ${identity}`);
  }

  public unregisterDevice(identity: string): void {
    this.registeredDevices.delete(identity);
    this.clearTokenCache(identity);
    console.log(`Device unregistered for ${identity}`);
  }

  public getRegisteredDevices(): string[] {
    return Array.from(this.registeredDevices);
  }

  // Voice quality monitoring
  public logCallQuality(callSid: string, quality: {
    jitter?: number;
    packetLoss?: number;
    rtt?: number;
    audioLevel?: number;
  }): void {
    console.log(`Call quality for ${callSid}:`, quality);
    // Could store in database for analytics
  }
}

export const twilioService = new TwilioService();