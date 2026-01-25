import { Device, Call } from '@twilio/voice-sdk';

// Device status types
export type DeviceStatus = 'unregistered' | 'registering' | 'registered' | 'error' | 'reconnecting' | 'destroyed';

// Device state interface
export interface TwilioDeviceState {
  device: Device | null;
  isReady: boolean;
  isConnecting: boolean;
  activeCall: Call | null;
  incomingCall: Call | null;
  error: string | null;
  deviceStatus: DeviceStatus;
  connectionQuality: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
  microphonePermission: 'granted' | 'denied' | 'prompt' | 'unknown';
  lastConnectionTest: Date | null;
  reconnectAttempts: number;
}

// Event types for the device manager
export type DeviceManagerEvent = 
  | { type: 'state_change'; state: TwilioDeviceState }
  | { type: 'incoming_call'; call: Call }
  | { type: 'call_accepted'; call: Call }
  | { type: 'call_disconnected'; call: Call | null }
  | { type: 'call_rejected'; call: Call | null }
  | { type: 'call_error'; error: any };

export class TwilioDeviceManager {
  private static instance: TwilioDeviceManager;
  private device: Device | null = null;
  private isInitialized = false;
  private isInitializing = false;
  private accessToken: string | null = null;
  private currentUserId: number | null = null;
  private listeners: Set<(event: DeviceManagerEvent) => void> = new Set();
  
  private currentState: TwilioDeviceState = {
    device: null,
    isReady: false,
    isConnecting: false,
    activeCall: null,
    incomingCall: null,
    error: null,
    deviceStatus: 'unregistered',
    connectionQuality: 'unknown',
    microphonePermission: 'unknown',
    lastConnectionTest: null,
    reconnectAttempts: 0,
  };

  private constructor() {}

  static getInstance(): TwilioDeviceManager {
    if (!TwilioDeviceManager.instance) {
      TwilioDeviceManager.instance = new TwilioDeviceManager();
    }
    return TwilioDeviceManager.instance;
  }

  addListener(listener: (event: DeviceManagerEvent) => void): void {
    this.listeners.add(listener);
    // Send current state to new listener
    listener({ type: 'state_change', state: this.currentState });
  }

  removeListener(listener: (event: DeviceManagerEvent) => void): void {
    this.listeners.delete(listener);
  }

  private emit(event: DeviceManagerEvent): void {
    this.listeners.forEach(listener => listener(event));
  }

  private updateState(updates: Partial<TwilioDeviceState>): void {
    this.currentState = { ...this.currentState, ...updates };
    this.emit({ type: 'state_change', state: this.currentState });
  }

  async checkMicrophonePermission(): Promise<boolean> {
    try {
      this.updateState({ microphonePermission: 'prompt' });
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
        }
      });
      
      // Stop the stream immediately - we just needed to check permission
      stream.getTracks().forEach(track => track.stop());
      
      this.updateState({ microphonePermission: 'granted' });
      return true;
    } catch (error: any) {
      console.error('Microphone permission check failed:', error);
      const permission = error.name === 'NotAllowedError' ? 'denied' : 'prompt';
      this.updateState({ microphonePermission: permission });
      return false;
    }
  }

  // Check if user has changed and destroy device if needed
  checkUserChange(userId: number | null): void {
    if (this.currentUserId !== null && userId !== this.currentUserId) {
      console.log(`🔄 User changed from ${this.currentUserId} to ${userId}, destroying device`);
      this.destroy();
    }
  }

  // Force destroy on logout
  destroyOnLogout(): void {
    console.log('🚪 User logging out, destroying Twilio device');
    this.destroy();
  }

  async initializeDevice(accessToken: string, userId: number | null = null): Promise<boolean> {
    // Check if user has changed
    this.checkUserChange(userId);
    
    // Store current user ID
    this.currentUserId = userId;

    // Validate token before proceeding
    if (!accessToken || typeof accessToken !== 'string') {
      console.error('Invalid access token provided');
      this.updateState({
        error: 'Invalid access token provided',
        deviceStatus: 'error',
        isConnecting: false,
      });
      return false;
    }

    // Basic JWT validation
    if (!this.isValidJWT(accessToken)) {
      console.error('Access token is not a valid JWT');
      this.updateState({
        error: 'Invalid token format',
        deviceStatus: 'error',
        isConnecting: false,
      });
      return false;
    }

    // Check if token is expired
    if (this.isTokenExpired(accessToken)) {
      console.error('Access token is expired');
      this.updateState({
        error: 'Access token has expired',
        deviceStatus: 'error',
        isConnecting: false,
      });
      return false;
    }

    // Prevent multiple initializations
    if (this.isInitialized && this.device?.state === 'registered') {
      console.log('Device already initialized and registered');
      return true;
    }

    if (this.isInitializing) {
      console.log('Device initialization already in progress');
      return false;
    }

    // Store access token
    this.accessToken = accessToken;
    this.isInitializing = true;

    try {
      // Check microphone permission first
      const hasPermission = await this.checkMicrophonePermission();
      if (!hasPermission) {
        throw new Error('Microphone permission is required for voice calls');
      }

      this.updateState({ 
        deviceStatus: 'registering', 
        isConnecting: true,
        error: null 
      });

      // Clean up existing device if present
      if (this.device) {
        console.log('Cleaning up existing device...');
        try {
          this.device.destroy();
        } catch (e) {
          console.warn('Error destroying previous device:', e);
        }
        this.device = null;
      }

      // Create new device with optimized settings for parallel dialer
      console.log('Creating new Twilio device...');
      this.device = new Device(accessToken, {
        logLevel: 'debug', // Enable debug logging to see what's happening
        enableImprovedSignalingErrorPrecision: true,
        allowIncomingWhileBusy: true, // CRITICAL: Allow conference join calls while dialing
        // BEST PRACTICE: Set edge locations for optimal call quality and latency
        // Device will auto-select closest edge from this list
        edge: ['ashburn', 'dublin', 'singapore', 'sydney', 'tokyo'],
        // Codec preferences for lower latency (OPUS preferred over PCMU/PCMA)
        codecPreferences: ['opus', 'pcmu'] as any // Type assertion needed for SDK compatibility
      });

      // Set up event listeners
      this.setupDeviceListeners();

      // Register device with timeout and detailed error handling
      console.log('Registering device...');
      
      try {
        await Promise.race([
          this.device.register(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Device registration timeout after 15 seconds')), 15000)
          )
        ]);

        console.log('Device registered successfully, state:', this.device?.state);
        this.isInitialized = true;
        console.log('✅ Device initialized successfully');
        return true;
      } catch (registrationError) {
        console.error('Device registration failed:', registrationError);
        throw registrationError;
      }

    } catch (error: any) {
      console.error('Device initialization failed:', error);
      
      // Robust error handling to prevent undefined access
      let userMessage = 'Device initialization failed';
      
      // Safely check error properties
      const errorMessage = error?.message || error?.toString() || '';
      
      if (errorMessage) {
        if (errorMessage.includes('AccessTokenInvalid')) {
          userMessage = 'Authentication failed. Please refresh the page and try again.';
        } else if (errorMessage.includes('timeout')) {
          userMessage = 'Connection timeout. Please check your internet connection.';
        } else if (errorMessage.includes('Microphone')) {
          userMessage = 'Microphone access is required for voice calls.';
        } else if (errorMessage.includes('NoValidAccountError')) {
          userMessage = 'Account validation failed. Please check your credentials.';
        } else {
          userMessage = `Connection error: ${errorMessage}`;
        }
      }
      
      this.updateState({
        error: userMessage,
        deviceStatus: 'error',
        isConnecting: false,
      });
      return false;
    } finally {
      this.isInitializing = false;
    }
  }

  // Helper method to validate JWT format
  private isValidJWT(token: string): boolean {
    try {
      const parts = token.split('.');
      return parts.length === 3 && parts.every(part => part.length > 0);
    } catch {
      return false;
    }
  }

  // Helper method to check if token is expired
  private isTokenExpired(token: string): boolean {
    try {
      const parts = token.split('.');
      const payload = JSON.parse(atob(parts[1]));
      const now = Math.floor(Date.now() / 1000);
      return payload.exp && payload.exp < now;
    } catch {
      return true; // If we can't parse it, consider it expired
    }
  }

  updateToken(token: string): void {
    if (this.device) {
      this.device.updateToken(token);
      this.accessToken = token;
      console.log('✅ Token refreshed successfully');
    }
  }

  private setupDeviceListeners(): void {
    if (!this.device) return;

    this.device.on('registered', () => {
      console.log('Device registered successfully');
      this.updateState({
        device: this.device,
        isReady: true,
        isConnecting: false,
        deviceStatus: 'registered',
        connectionQuality: 'excellent',
        lastConnectionTest: new Date(),
        reconnectAttempts: 0,
      });
    });

    this.device.on('unregistered', () => {
      console.log('Device unregistered');
      this.updateState({
        isReady: false,
        deviceStatus: 'unregistered',
        connectionQuality: 'unknown',
      });
    });

    this.device.on('error', (error) => {
      console.error('❌ Device error:', error);
      this.updateState({
        error: error.message || 'Device error occurred',
        deviceStatus: 'error',
        isReady: false,
        isConnecting: false,
        connectionQuality: 'poor',
      });
    });

    this.device.on('incoming', async (call) => {
      // Emit incoming call event so consumers can handle business logic (e.g. parallel dialer checks)
      this.emit({ type: 'incoming_call', call });
      
      // Default behavior: update state
      this.updateState({ incomingCall: call });
      this.setupCallListeners(call);
    });

    this.device.on('tokenWillExpire', async () => {
      console.log('Token will expire soon');
      // We don't handle refresh here directly to avoid circular dependencies
      // The hook should handle this by listening to state or using a callback
    });
  }

  private setupCallListeners(call: Call): void {
    call.on('accept', () => {
      console.log('Call accepted');
      this.updateState({ activeCall: call, incomingCall: null });
      this.emit({ type: 'call_accepted', call });
    });

    call.on('disconnect', () => {
      console.log('Call disconnected');
      this.updateState({ activeCall: null, incomingCall: null });
      this.emit({ type: 'call_disconnected', call });
    });

    call.on('reject', () => {
      console.log('Call rejected');
      this.updateState({ incomingCall: null });
      this.emit({ type: 'call_rejected', call });
    });

    call.on('error', (error) => {
      console.error('Call error:', error);
      this.updateState({ 
        error: error.message || 'Call error occurred',
        activeCall: null,
        incomingCall: null 
      });
      this.emit({ type: 'call_error', error });
    });
  }

  async makeCall(to: string): Promise<boolean> {
    if (!this.device || !this.isInitialized) {
      throw new Error('Device not initialized');
    }

    if (this.device.state !== 'registered') {
      throw new Error('Device not registered');
    }

    try {
      const call = await this.device.connect({ params: { To: to } });
      this.updateState({ activeCall: call });
      this.setupCallListeners(call);
      return true;
    } catch (error: any) {
      console.error('Failed to make call:', error);
      this.emit({ type: 'call_error', error });
      throw error;
    }
  }

  acceptCall(): void {
    if (this.currentState.incomingCall) {
      this.currentState.incomingCall.accept();
    }
  }

  rejectCall(): void {
    if (this.currentState.incomingCall) {
      this.currentState.incomingCall.reject();
    }
  }

  hangupCall(): void {
    if (this.currentState.activeCall) {
      this.currentState.activeCall.disconnect();
    }
  }

  sendDTMF(tone: string): void {
    if (this.currentState.activeCall) {
      this.currentState.activeCall.sendDigits(tone);
    }
  }

  muteCall(mute: boolean): void {
    if (this.currentState.activeCall) {
      this.currentState.activeCall.mute(mute);
    }
  }

  holdCall(hold: boolean): void {
    if (this.currentState.activeCall) {
      // Twilio doesn't have native hold - we simulate it with mute
      this.currentState.activeCall.mute(hold);
    }
  }

  isMuted(): boolean {
    if (this.currentState.activeCall && typeof this.currentState.activeCall.isMuted === 'function') {
      return this.currentState.activeCall.isMuted();
    }
    return false;
  }

  destroy(): void {
    if (this.device) {
      try {
        this.device.destroy();
      } catch (e) {
        console.warn('Error destroying device:', e);
      }
      this.device = null;
    }
    this.isInitialized = false;
    this.isInitializing = false;
    this.accessToken = null;
    this.currentUserId = null; // Clear user ID on destroy
    this.updateState({
      device: null,
      isReady: false,
      isConnecting: false,
      activeCall: null,
      incomingCall: null,
      deviceStatus: 'destroyed',
      connectionQuality: 'unknown',
    });
  }

  getState(): TwilioDeviceState {
    return this.currentState;
  }

  isDeviceReady(): boolean {
    return this.isInitialized && this.device?.state === 'registered';
  }

  isDeviceInitializing(): boolean {
    return this.isInitializing;
  }
}
