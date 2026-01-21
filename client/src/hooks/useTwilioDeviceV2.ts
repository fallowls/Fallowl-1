import { useState, useEffect, useCallback, useRef } from 'react';
import { Device, Call } from '@twilio/voice-sdk';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useStore } from '@/store/useStore';
import { useAuth } from '@/hooks/use-auth';

// Type definitions for API responses
interface TwilioStatusResponse {
  isConfigured: boolean;
  phoneNumber?: string;
}

interface TwilioTokenResponse {
  accessToken: string;
  identity: string;
}

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

// Singleton device manager to ensure only one instance across the app
// BUT tracks userId to ensure device is destroyed when user changes
class TwilioDeviceManager {
  private static instance: TwilioDeviceManager;
  private device: Device | null = null;
  private isInitialized = false;
  private isInitializing = false;
  private accessToken: string | null = null;
  private currentUserId: number | null = null;
  private listeners: Set<(state: TwilioDeviceState) => void> = new Set();
  private globalStoreCallbacks: Set<(status: string, data?: any) => void> = new Set();
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

  addListener(listener: (state: TwilioDeviceState) => void): void {
    this.listeners.add(listener);
    // Send current state to new listener
    listener(this.currentState);
  }

  removeListener(listener: (state: TwilioDeviceState) => void): void {
    this.listeners.delete(listener);
  }

  addGlobalStoreCallback(callback: (status: string, data?: any) => void): void {
    this.globalStoreCallbacks.add(callback);
  }

  removeGlobalStoreCallback(callback: (status: string, data?: any) => void): void {
    this.globalStoreCallbacks.delete(callback);
  }

  private notifyGlobalStore(status: string, data?: any): void {
    this.globalStoreCallbacks.forEach(callback => callback(status, data));
  }

  private updateState(updates: Partial<TwilioDeviceState>): void {
    this.currentState = { ...this.currentState, ...updates };
    this.listeners.forEach(listener => listener(this.currentState));
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

      // Debug: Log token details
      const tokenInfo = {
        length: accessToken.length,
        preview: accessToken.substring(0, 50) + '...',
        isValid: this.isValidJWT(accessToken),
        isExpired: this.isTokenExpired(accessToken)
      };
      console.log('Initializing device with token:', tokenInfo);

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
      console.log('Device state before registration:', this.device?.state);
      
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
        console.log('Device state after registration failure:', this.device?.state);
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

  // Refresh access token method
  private async refreshAccessToken(): Promise<string> {
    try {
      console.log('Refreshing access token...');
      const response = await apiRequest('GET', '/api/twilio/access-token');
      
      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.accessToken) {
        throw new Error('No access token received from server');
      }

      // Validate the new token
      if (!this.isValidJWT(data.accessToken)) {
        throw new Error('Received invalid token format');
      }

      if (this.isTokenExpired(data.accessToken)) {
        throw new Error('Received expired token');
      }

      // Update device with new token
      if (this.device) {
        this.device.updateToken(data.accessToken);
        this.accessToken = data.accessToken;
        console.log('✅ Token refreshed successfully');
      }

      return data.accessToken;
    } catch (error: any) {
      console.error('Token refresh error:', error);
      throw error;
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
      console.log('Error details:', {
        message: error.message,
        code: error.code,
        causes: error.causes,
        originalError: error.originalError,
        twilioError: error.twilioError
      });
      this.updateState({
        error: error.message || 'Device error occurred',
        deviceStatus: 'error',
        isReady: false,
        isConnecting: false,
        connectionQuality: 'poor',
      });
    });

    this.device.on('incoming', async (call) => {
      // Check if this is a parallel dialer call by looking at custom parameters
      const isParallelDialer = call.customParameters?.get('isParallelDialer') === 'true';
      
      if (isParallelDialer) {
        // CRITICAL: Check if agent is already on an active call to prevent race condition
        // If two customers answer simultaneously, reject the second call
        if (this.currentState.activeCall) {
          console.warn('⚠️ Rejecting parallel dialer call - agent already on active call');
          const lineId = call.customParameters?.get('lineId');
          const contactPhone = call.customParameters?.get('contactPhone');
          
          // Reject the call
          call.reject();
          
          // Notify backend to mark this line as busy/failed so it can dial next contact
          if (lineId) {
            const notifyRejection = async (retries = 3) => {
              for (let i = 0; i < retries; i++) {
                try {
                  const response = await fetch('/api/dialer/call-rejected', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                      callSid: call.parameters.CallSid,
                      lineId,
                      phone: contactPhone,
                      reason: 'agent_busy'
                    })
                  });
                  
                  if (response.ok) {
                    console.log(`✅ Backend notified of call rejection for line ${lineId}`);
                    return;
                  } else {
                    console.warn(`⚠️ Failed to notify backend (attempt ${i + 1}/${retries}): ${response.status}`);
                  }
                } catch (err) {
                  console.error(`❌ Error notifying backend of rejection (attempt ${i + 1}/${retries}):`, err);
                }
                
                // Wait before retry (exponential backoff)
                if (i < retries - 1) {
                  await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 500));
                }
              }
              console.error(`❌ Failed to notify backend after ${retries} attempts - line may be stuck`);
            };
            
            notifyRejection();
          }
          return;
        }
        
        // Auto-accept parallel dialer calls IMMEDIATELY before any other processing
        call.accept();
        console.log('🤖 Auto-accepting parallel dialer call');
        this.setupCallListeners(call);
        this.updateState({ activeCall: call });
        this.notifyGlobalStore('parallel_call_accepted', { call });
        
        // CRITICAL FIX: Notify backend that call connected
        // Since Twilio status callbacks are unreliable in Replit, the browser notifies backend
        const lineId = call.customParameters?.get('lineId');
        const contactPhone = call.customParameters?.get('contactPhone');
        if (lineId && call.parameters.CallSid) {
          console.log(`📞 Notifying backend: call connected on line ${lineId}`);
          fetch('/api/dialer/call-connected', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              callSid: call.parameters.CallSid,
              lineId,
              phone: contactPhone
            })
          }).catch(err => console.error('Failed to notify backend:', err));
        }
      } else {
        // Check if this is a conference join call
        const callSid = call.parameters.CallSid;
        console.log('📞 Non-parallel-dialer incoming call detected:', {
          CallSid: callSid,
          From: call.parameters.From,
          To: call.parameters.To
        });
        
        try {
          console.log(`🔍 Checking if ${callSid} is a conference join call...`);
          const response = await fetch(`/api/dialer/conference/check-join/${callSid}`, {
            method: 'GET',
            credentials: 'include'
          });
          
          console.log('🔍 Conference join check response status:', response.status);
          
          if (response.ok) {
            const data = await response.json();
            console.log('🔍 Conference join check result:', data);
            
            if (data.isConferenceJoin) {
              // Auto-accept conference join call
              console.log('🎯 Auto-accepting conference join call:', callSid);
              call.accept();
              this.setupCallListeners(call);
              this.updateState({ activeCall: call });
              this.notifyGlobalStore('call_accepted', { call });
              console.log('✅ Conference join call accepted and active');
              return;
            } else {
              console.log('ℹ️ Call is NOT a conference join, showing incoming UI');
            }
          }
        } catch (err) {
          console.error('❌ Failed to check conference join status:', err);
          // Continue to regular incoming call handling on error
        }
        
        // Regular incoming call - show incoming call UI
        console.log('📞 Regular incoming call - showing UI for manual accept');
        this.updateState({ incomingCall: call });
        this.setupCallListeners(call);
        this.notifyGlobalStore('incoming_call', { call });
      }
    });

    this.device.on('tokenWillExpire', async () => {
      console.log('Token will expire, refreshing...');
      try {
        await this.refreshAccessToken();
      } catch (error) {
        console.error('Token refresh failed:', error);
        this.updateState({
          error: 'Token refresh failed. Please refresh the page.',
          deviceStatus: 'error',
        });
      }
    });
  }

  private setupCallListeners(call: Call): void {
    call.on('accept', () => {
      console.log('Call accepted');
      this.updateState({ activeCall: call, incomingCall: null });
      this.notifyGlobalStore('call_accepted', { call });
    });

    call.on('disconnect', () => {
      console.log('Call disconnected');
      this.updateState({ activeCall: null, incomingCall: null });
      this.notifyGlobalStore('call_disconnected');
    });

    call.on('reject', () => {
      console.log('Call rejected');
      this.updateState({ incomingCall: null });
      this.notifyGlobalStore('call_rejected');
    });

    call.on('error', (error) => {
      console.error('Call error:', error);
      this.updateState({ 
        error: error.message || 'Call error occurred',
        activeCall: null,
        incomingCall: null 
      });
      this.notifyGlobalStore('call_error', { error });
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
      this.notifyGlobalStore('call_started', { to });
      const call = await this.device.connect({ params: { To: to } });
      this.updateState({ activeCall: call });
      this.setupCallListeners(call);
      return true;
    } catch (error: any) {
      console.error('Failed to make call:', error);
      this.notifyGlobalStore('call_error', { error });
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

// Custom hook that uses the singleton device manager
export const useTwilioDeviceV2 = () => {
  const [state, setState] = useState<TwilioDeviceState>({
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
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deviceManager = useRef(TwilioDeviceManager.getInstance());
  const globalStore = useStore();
  const { user } = useAuth();

  // Query to get Twilio status
  const { data: twilioStatus } = useQuery<TwilioStatusResponse>({
    queryKey: ['/api/twilio/status'],
    refetchInterval: 60000, // Check every minute
    staleTime: 30000,
  });

  // Query to get access token - only when needed
  const { data: tokenData } = useQuery<TwilioTokenResponse>({
    queryKey: ['/api/twilio/access-token'],
    enabled: twilioStatus?.isConfigured === true,
    staleTime: 50 * 60 * 1000, // 50 minutes
    refetchInterval: 55 * 60 * 1000, // 55 minutes
  });

  // Set up device manager listener
  useEffect(() => {
    const manager = deviceManager.current;
    manager.addListener(setState);

    return () => {
      manager.removeListener(setState);
    };
  }, []);

  // Set up global store callback
  useEffect(() => {
    const manager = deviceManager.current;
    
    const handleGlobalStoreUpdate = (status: string, data?: any) => {
      switch (status) {
        case 'call_started':
          globalStore.setCallStatus('connecting');
          globalStore.setCurrentNumber(data?.to || '');
          break;
        case 'parallel_call_accepted':
          // Parallel dialer call auto-accepted
          const parallelCall = data?.call;
          const contactName = parallelCall?.customParameters?.get('contactName') || 'Unknown';
          const contactPhone = parallelCall?.customParameters?.get('contactPhone') || '';
          globalStore.setCallStatus('connected');
          globalStore.setCallStartTime(new Date());
          globalStore.setCallerName(contactName);
          globalStore.setCurrentNumber(contactPhone);
          console.log('✅ Parallel dialer call connected:', contactName, contactPhone);
          break;
        case 'incoming_call':
          // Regular incoming call - set up incoming call info to show UI
          const incomingCall = data?.call;
          const callerNumber = incomingCall?.parameters?.From || 'Unknown';
          globalStore.setCallStatus('incoming');
          globalStore.setIncomingCallInfo({
            name: 'Unknown Caller',
            phone: callerNumber,
          });
          console.log('📞 Incoming call from:', callerNumber);
          break;
        case 'call_accepted':
          // Regular incoming call accepted - extract caller info from call object
          const acceptedCall = data?.call;
          const callerPhone = acceptedCall?.parameters?.From || globalStore.currentNumber || 'Unknown';
          const callerName = globalStore.callerName || 'Unknown Caller';
          globalStore.setCallStatus('connected');
          globalStore.setCallStartTime(new Date());
          globalStore.setCurrentNumber(callerPhone);
          globalStore.setCallerName(callerName);
          globalStore.setIncomingCallInfo(null);
          break;
        case 'call_disconnected':
          globalStore.setCallStatus('ready');
          globalStore.setCallStartTime(null);
          globalStore.setIsMuted(false);
          globalStore.setIsOnHold(false);
          globalStore.setIsRecording(false);
          globalStore.setCallNotes('');
          globalStore.setCallerName('');
          globalStore.setCurrentNumber('');
          globalStore.setIncomingCallInfo(null);
          break;
        case 'call_rejected':
          globalStore.setCallStatus('ready');
          globalStore.setIncomingCallInfo(null);
          break;
        case 'call_error':
          globalStore.setCallStatus('failed');
          globalStore.setCallStartTime(null);
          globalStore.setIsMuted(false);
          globalStore.setIsOnHold(false);
          globalStore.setIsRecording(false);
          globalStore.setCallNotes('');
          globalStore.setCallerName('');
          globalStore.setCurrentNumber('');
          globalStore.setIncomingCallInfo(null);
          break;
      }
    };

    manager.addGlobalStoreCallback(handleGlobalStoreUpdate);

    return () => {
      manager.removeGlobalStoreCallback(handleGlobalStoreUpdate);
    };
  }, [globalStore]);

  // Initialize device when token is available
  useEffect(() => {
    const initializeDeviceWithValidation = async () => {
      if (!tokenData?.accessToken || !twilioStatus?.isConfigured) {
        return;
      }

      const manager = deviceManager.current;
      
      // Skip if device is already ready or currently initializing
      if (manager.isDeviceReady() || manager.isDeviceInitializing()) {
        return;
      }

      try {
        console.log('Initializing device with fresh token for user:', user?.id);
        const success = await manager.initializeDevice(tokenData.accessToken, user?.id || null);
        
        if (success) {
          toast({
            title: 'Phone ready',
            description: 'You can now make and receive calls',
          });
        }
      } catch (error: any) {
        console.error('Device initialization failed:', error);
        
        // Provide specific error messages
        let errorMessage = 'Unable to initialize phone';
        if (error.message?.includes('AccessTokenInvalid')) {
          errorMessage = 'Authentication failed. Please refresh the page.';
          // Invalidate token queries to force refresh
          queryClient.invalidateQueries({ queryKey: ['/api/twilio/access-token'] });
        } else if (error.message?.includes('timeout')) {
          errorMessage = 'Connection timeout. Please check your internet.';
        } else if (error.message?.includes('Microphone')) {
          errorMessage = 'Microphone access required for calls.';
        } else if (error.message) {
          errorMessage = error.message;
        }
        
        toast({
          title: 'Phone initialization failed',
          description: errorMessage,
          variant: 'destructive',
        });
      }
    };

    initializeDeviceWithValidation();
  }, [tokenData?.accessToken, twilioStatus?.isConfigured, toast, queryClient, user?.id]);

  // Destroy device on logout or user change
  useEffect(() => {
    const manager = deviceManager.current;
    
    // If user becomes null (logout), destroy the device
    if (!user) {
      manager.destroyOnLogout();
    }
  }, [user]);

  // Request microphone permission
  const requestMicrophonePermission = useCallback(async () => {
    const manager = deviceManager.current;
    const hasPermission = await manager.checkMicrophonePermission();
    
    if (hasPermission) {
      toast({
        title: 'Microphone permission granted',
        description: 'You can now make and receive calls',
      });
    } else {
      toast({
        title: 'Microphone permission required',
        description: 'Please allow microphone access to use voice features',
        variant: 'destructive',
      });
    }
    
    return hasPermission;
  }, [toast]);

  // Call functions
  const makeCall = useCallback(async (to: string) => {
    const manager = deviceManager.current;
    
    if (!manager.isDeviceReady()) {
      throw new Error('Phone not ready. Please wait for initialization.');
    }

    try {
      await manager.makeCall(to);
      toast({
        title: 'Call initiated',
        description: `Calling ${to}...`,
      });
    } catch (error: any) {
      toast({
        title: 'Call failed',
        description: error.message || 'Unable to make call',
        variant: 'destructive',
      });
      throw error;
    }
  }, [toast]);

  const acceptCall = useCallback(() => {
    deviceManager.current.acceptCall();
  }, []);

  const rejectCall = useCallback(() => {
    deviceManager.current.rejectCall();
  }, []);

  const hangupCall = useCallback(() => {
    deviceManager.current.hangupCall();
  }, []);

  const sendDTMF = useCallback((tone: string) => {
    deviceManager.current.sendDTMF(tone);
  }, []);

  const muteCall = useCallback((mute: boolean) => {
    deviceManager.current.muteCall(mute);
  }, []);

  const holdCall = useCallback((hold: boolean) => {
    deviceManager.current.holdCall(hold);
  }, []);

  const isMuted = useCallback(() => {
    return deviceManager.current.isMuted();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Don't destroy device on unmount - keep it alive for the session
      console.log('Component unmounting, but keeping device alive');
    };
  }, []);

  return {
    // State
    ...state,
    
    // Computed properties
    isConfigured: twilioStatus?.isConfigured === true,
    hasToken: !!tokenData?.accessToken,
    
    // Functions
    requestMicrophonePermission,
    makeCall,
    acceptCall,
    rejectCall,
    hangupCall,
    sendDTMF,
    muteCall,
    holdCall,
    isMuted,
    
    // Utility
    phoneNumber: twilioStatus?.phoneNumber || '',
  };
};