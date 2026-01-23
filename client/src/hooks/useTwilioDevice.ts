import { useEffect, useState, useCallback, useRef } from 'react';
import { Device, Call } from '@twilio/voice-sdk';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useMicrophonePermission } from './useMicrophonePermission';

export interface TwilioDeviceState {
  device: Device | null;
  isReady: boolean;
  isConnecting: boolean;
  activeCall: Call | null;
  incomingCall: Call | null;
  error: string | null;
  deviceStatus: 'unregistered' | 'registered' | 'registering' | 'destroyed' | 'error' | 'reconnecting';
  connectionQuality: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
  lastConnectionTest: Date | null;
  reconnectAttempts: number;
}

export interface TwilioCallInfo {
  callSid: string;
  direction: 'inbound' | 'outbound';
  from: string;
  to: string;
  status: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
}

export const useTwilioDevice = () => {
  const [state, setState] = useState<TwilioDeviceState>({
    device: null,
    isReady: false,
    isConnecting: false,
    activeCall: null,
    incomingCall: null,
    error: null,
    deviceStatus: 'unregistered',
    connectionQuality: 'unknown',
    lastConnectionTest: null,
    reconnectAttempts: 0,
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deviceRef = useRef<Device | null>(null);
  const initializationRef = useRef(false);
  const registrationRef = useRef(false);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const healthCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const maxReconnectAttempts = 5;
  
  const { hasPermission, requestPermission, checkPermission } = useMicrophonePermission();

  // Query to get Twilio status with enhanced monitoring
  const { data: twilioStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['/api/user/twilio/status'],
    refetchInterval: 60000, // Check status every 60 seconds (reduced from 30)
    staleTime: 30000, // Consider fresh for 30 seconds
  });

  // Query to get access token with error handling
  const { data: tokenData, error: tokenError, refetch: refetchToken } = useQuery({
    queryKey: ['/api/twilio/access-token'],
    enabled: twilioStatus?.isConfigured === true && hasPermission,
    refetchInterval: false, // Disable automatic refetch - use token refresh event instead
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  // Health check query for connection monitoring
  const { data: healthStatus } = useQuery({
    queryKey: ['/api/twilio/health'],
    enabled: false, // Disable background health checks - use local monitoring instead
    staleTime: 300000,
  });

  // Mutation to make calls
  const makeCallMutation = useMutation({
    mutationFn: async ({ to, from }: { to: string; from?: string }) => {
      const response = await apiRequest('POST', '/api/twilio/make-call', { to, from });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Call initiated',
        description: `Calling ${data.to}...`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Call failed',
        description: error.message || 'Failed to initiate call',
        variant: 'destructive',
      });
    },
  });

  // Single-instance device initialization with absolute call protection
  const initializeDevice = useCallback(async () => {
    console.log('=== DEVICE INITIALIZATION ATTEMPT ===');
    
    // Absolute blocks - never initialize during these conditions
    if (!tokenData?.accessToken) {
      console.log('BLOCKED: No access token');
      return;
    }
    
    if (initializationRef.current) {
      console.log('BLOCKED: Already initializing');
      return;
    }

    if (state.activeCall || state.incomingCall) {
      console.log('BLOCKED: Call in progress - NEVER destroy device during calls');
      return;
    }

    // If device exists and is working, don't recreate it
    if (deviceRef.current && deviceRef.current.state === 'registered') {
      console.log('BLOCKED: Device already exists and registered');
      setState(prev => ({
        ...prev,
        device: deviceRef.current,
        isReady: true,
        deviceStatus: 'registered'
      }));
      return;
    }

    // Check microphone permission first
    if (!hasPermission) {
      console.log('BLOCKED: Waiting for microphone permission...');
      setState(prev => ({ 
        ...prev, 
        error: 'Microphone permission required for voice calls',
        deviceStatus: 'error'
      }));
      return;
    }

    try {
      initializationRef.current = true;
      console.log('Initializing Twilio Device with enhanced configuration...');
      setState(prev => ({ 
        ...prev, 
        isConnecting: true, 
        error: null,
        deviceStatus: 'registering'
      }));

      // NEVER destroy device during calls - absolute protection
      if (deviceRef.current) {
        console.log('Existing device found, checking if safe to destroy...');
        
        // Absolute protection: NEVER destroy during calls
        if (state.activeCall || state.incomingCall) {
          console.log('CRITICAL: Preserving device - call in progress, aborting initialization');
          initializationRef.current = false;
          return;
        }
        
        // Check if device is already registered - skip if it is
        if (deviceRef.current.state === 'registered') {
          console.log('Device already registered, skipping re-initialization');
          initializationRef.current = false;
          return;
        }
        
        console.log('Safe to destroy existing device');
        try {
          deviceRef.current.destroy();
          deviceRef.current = null;
        } catch (e) {
          console.warn('Error destroying previous device:', e);
        }
      }

      console.log('Creating new Twilio Device with production configuration...');
      
      // Check if Device constructor is available
      if (typeof Device === 'undefined') {
        throw new Error('Twilio Voice SDK not available. Please refresh the page.');
      }
      
      // Production-ready device configuration with reduced logging
      const device = new Device(tokenData.accessToken, {
        logLevel: 'warn', // Reduced logging to minimize console noise
        answerOnBridge: true,
        foldDtmf: false,
        enableRingingState: true,
        enableImprovedSignalingErrorPrecision: true,
        allowIncomingWhileBusy: false,
        codecPreferences: ['opus', 'PCMU'],
        dscp: true,
        forceAggressiveIceNomination: true,
        sounds: {
          disconnect: false,
          incoming: false,
          outgoing: false,
        },
        // Enhanced audio settings for better quality
        rtcConstraints: {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000,
            channelCount: 1,
          }
        }
      });

      deviceRef.current = device;
      console.log('Device created with enhanced configuration');

      // Device event listeners
      device.on('registered', () => {
        console.log('Twilio Device registered successfully');
        setState(prev => ({
          ...prev,
          device,
          isReady: true,
          isConnecting: false,
          deviceStatus: 'registered',
          error: null,
          reconnectAttempts: 0,
          lastConnectionTest: new Date(),
          connectionQuality: 'excellent'
        }));
        
        // Register device with backend (only once)
        if (!registrationRef.current) {
          registrationRef.current = true;
          apiRequest('POST', '/api/twilio/device/register').catch(console.error);
        }
        
        // Start health monitoring
        startHealthMonitoring();
        
        toast({
          title: 'Phone ready',
          description: 'Connected to Twilio, ready to make and receive calls',
        });
      });

      device.on('unregistered', () => {
        console.log('Twilio Device unregistered');
        registrationRef.current = false; // Reset registration flag
        setState(prev => ({
          ...prev,
          isReady: false,
          deviceStatus: 'unregistered',
          connectionQuality: 'unknown'
        }));
        
        // Stop health monitoring
        stopHealthMonitoring();
      });

      device.on('error', (error) => {
        console.error('Twilio Device error:', error);
        setState(prev => ({
          ...prev,
          error: error.message,
          isReady: false,
          isConnecting: false,
          deviceStatus: 'error',
          connectionQuality: 'poor'
        }));
        
        // Attempt automatic reconnection for recoverable errors
        if (shouldAttemptReconnection(error)) {
          scheduleReconnection();
        }
        
        toast({
          title: 'Phone error',
          description: getErrorMessage(error),
          variant: 'destructive',
        });
      });

      device.on('incoming', (call) => {
        console.log('Incoming call:', call);
        
        if (!call) {
          console.error('Incoming call object is null');
          return;
        }

        setState(prev => ({
          ...prev,
          incomingCall: call,
        }));

        // Set up call event listeners
        setupCallListeners(call);

        const fromNumber = call.parameters?.From || 'Unknown';
        toast({
          title: 'Incoming call',
          description: `Call from ${fromNumber}`,
        });
      });

      device.on('tokenWillExpire', async () => {
        console.log('Token will expire, refreshing...');
        try {
          const response = await apiRequest('POST', '/api/twilio/refresh-token');
          const data = await response.json();
          if (data.accessToken && deviceRef.current) {
            deviceRef.current.updateToken(data.accessToken);
            console.log('Token refreshed successfully');
          }
        } catch (error) {
          console.error('Failed to refresh token:', error);
          // Fallback to query invalidation
          queryClient.invalidateQueries({ queryKey: ['/api/twilio/access-token'] });
        }
      });

      // Register the device with retry logic
      await registerDeviceWithRetry(device);

    } catch (error: any) {
      console.error('Failed to initialize device:', error);
      const errorMessage = error?.message || error?.toString() || 'Failed to initialize phone';
      setState(prev => ({
        ...prev,
        error: errorMessage,
        isReady: false,
        isConnecting: false,
        deviceStatus: 'error'
      }));
      toast({
        title: 'Phone initialization failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      initializationRef.current = false;
    }
  }, [tokenData, toast, queryClient, hasPermission]);

  // Helper function to register device with retry logic
  const registerDeviceWithRetry = useCallback(async (device: Device, maxAttempts = 3): Promise<void> => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await device.register();
        console.log('Device registered successfully');
        return;
      } catch (error: any) {
        console.error(`Registration attempt ${attempt} failed:`, error);
        if (attempt === maxAttempts) {
          throw error;
        }
        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }, []);

  // Helper to determine if error is recoverable and should trigger reconnection
  const shouldAttemptReconnection = useCallback((error: any): boolean => {
    const recoverableErrors = [
      31005, // Connection lost
      31008, // Media connection failed  
      31009, // Connection error
      53000, // Signaling connection disconnected
      53001, // Signaling connection failed
    ];
    return recoverableErrors.includes(error.code) || error.message?.includes('connection');
  }, []);

  // Enhanced error message generator
  const getErrorMessage = useCallback((error: any): string => {
    const errorMap: Record<number, string> = {
      31005: 'Connection lost. Attempting to reconnect...',
      31008: 'Media connection failed. Check your internet connection.',
      31009: 'Connection error. Please check your network.',
      31201: 'Microphone access denied. Please allow microphone permissions.',
      31208: 'Device not supported. Please use a modern browser.',
      53000: 'Signaling connection lost. Reconnecting...',
      53001: 'Failed to connect to Twilio. Please check your internet.',
    };
    
    return errorMap[error.code] || error.message || 'An unexpected error occurred';
  }, []);

  // Schedule automatic reconnection
  const scheduleReconnection = useCallback(() => {
    if (state.reconnectAttempts >= maxReconnectAttempts) {
      console.log('Max reconnection attempts reached');
      setState(prev => ({
        ...prev,
        deviceStatus: 'error',
        error: 'Connection failed after multiple attempts. Please refresh the page.'
      }));
      return;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    const delay = Math.min(1000 * Math.pow(2, state.reconnectAttempts), 30000);
    console.log(`Scheduling reconnection in ${delay}ms (attempt ${state.reconnectAttempts + 1})`);

    setState(prev => ({
      ...prev,
      deviceStatus: 'reconnecting',
      reconnectAttempts: prev.reconnectAttempts + 1
    }));

    reconnectTimeoutRef.current = setTimeout(() => {
      console.log('Attempting automatic reconnection...');
      initializeDevice();
    }, delay);
  }, [state.reconnectAttempts, initializeDevice]);

  // Health monitoring functions
  const startHealthMonitoring = useCallback(() => {
    if (healthCheckIntervalRef.current) return;
    
    healthCheckIntervalRef.current = setInterval(async () => {
      try {
        if (!deviceRef.current || !state.isReady) return;
        
        // Only update if quality has actually changed
        const quality = deviceRef.current.state === 'registered' ? 'excellent' : 'poor';
        if (state.connectionQuality !== quality) {
          setState(prev => ({
            ...prev,
            connectionQuality: quality,
            lastConnectionTest: new Date()
          }));
        }
        
      } catch (error) {
        console.error('Health check failed:', error);
        if (state.connectionQuality !== 'poor') {
          setState(prev => ({
            ...prev,
            connectionQuality: 'poor'
          }));
        }
      }
    }, 300000); // Check every 5 minutes (reduced from 1 minute)
  }, [state.isReady, state.connectionQuality]);

  const stopHealthMonitoring = useCallback(() => {
    if (healthCheckIntervalRef.current) {
      clearInterval(healthCheckIntervalRef.current);
      healthCheckIntervalRef.current = null;
    }
  }, []);

  // Cleanup audio elements
  const cleanupAudio = useCallback(() => {
    console.log('Cleaning up audio');
    
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.srcObject = null;
      if (audioElementRef.current.parentNode) {
        audioElementRef.current.parentNode.removeChild(audioElementRef.current);
      }
      audioElementRef.current = null;
    }

    if (ringtoneRef.current) {
      ringtoneRef.current.pause();
      ringtoneRef.current = null;
    }
  }, []);

  // Setup audio for call
  const setupAudioForCall = useCallback(async (call: Call) => {
    if (!call) {
      console.error('Cannot setup audio: call is null');
      return;
    }

    console.log('Setting up audio for call');
    
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      console.log('Microphone access granted');
      
      // Create audio element for call audio
      if (!audioElementRef.current) {
        audioElementRef.current = new Audio();
        audioElementRef.current.autoplay = true;
        audioElementRef.current.controls = false;
        audioElementRef.current.style.display = 'none';
        document.body.appendChild(audioElementRef.current);
      }

      // Set up audio handling for different call events
      const handleAudioSetup = () => {
        console.log('Setting up audio streams');
        
        try {
          // Get the remote audio stream
          const remoteStream = call.getRemoteStream && call.getRemoteStream();
          if (remoteStream && audioElementRef.current) {
            console.log('Setting remote audio stream');
            audioElementRef.current.srcObject = remoteStream;
            audioElementRef.current.play().catch(console.error);
          }
        } catch (error) {
          console.error('Error setting up audio streams:', error);
        }
      };

      // Handle audio immediately if call is already connected
      try {
        if (call.status && call.status() === 'open') {
          handleAudioSetup();
        }
      } catch (error) {
        console.error('Error checking call status:', error);
      }

      // Handle audio when call connects
      call.on('accept', handleAudioSetup);
      
      // Handle audio changes during call
      call.on('audio', (remoteAudio) => {
        console.log('Remote audio changed:', remoteAudio);
        if (remoteAudio && audioElementRef.current) {
          audioElementRef.current.srcObject = remoteAudio;
          audioElementRef.current.play().catch(console.error);
        }
      });

    } catch (error) {
      console.error('Failed to get microphone access:', error);
      toast({
        title: 'Microphone access denied',
        description: 'Please allow microphone access for voice calls',
        variant: 'destructive',
      });
    }
  }, [toast]);

  // Setup call event listeners
  const setupCallListeners = useCallback((call: Call) => {
    if (!call) {
      console.error('Cannot setup listeners: call is null');
      return;
    }

    console.log('Setting up call listeners for call:', call);

    call.on('accept', () => {
      console.log('Call accepted');
      setState(prev => ({
        ...prev,
        activeCall: call,
        incomingCall: null,
      }));
      
      // Setup audio for the call
      setupAudioForCall(call);
    });

    call.on('disconnect', () => {
      console.log('Call disconnected');
      setState(prev => ({
        ...prev,
        activeCall: null,
        incomingCall: null,
      }));
      
      // Clean up audio
      cleanupAudio();
    });

    call.on('cancel', () => {
      console.log('Call cancelled');
      setState(prev => ({
        ...prev,
        incomingCall: null,
      }));
    });

    call.on('error', (error) => {
      console.error('Call error:', error);
      toast({
        title: 'Call error',
        description: error?.message || 'Call error occurred',
        variant: 'destructive',
      });
    });
  }, [toast, setupAudioForCall, cleanupAudio]);

  // Enhanced make outbound call with comprehensive debugging
  const makeCall = useCallback(async (to: string, from?: string) => {
    console.log('=== MAKE CALL START ===');
    console.log('Call params:', { to, from });
    console.log('Device state:', {
      stateDevice: !!state.device,
      deviceRef: !!deviceRef.current,
      isReady: state.isReady,
      deviceStatus: state.deviceStatus,
      hasPermission,
      isInitializing: initializationRef.current
    });
    
    // Check microphone permission first
    if (!hasPermission) {
      console.log('Requesting microphone permission...');
      const granted = await requestPermission();
      if (!granted) {
        console.log('Microphone permission denied');
        return;
      }
      console.log('Microphone permission granted');
    }
    
    // Get device reference and validate
    const device = deviceRef.current;
    console.log('Device validation:', {
      deviceExists: !!device,
      deviceState: device?.state,
      deviceMethods: device ? {
        hasConnect: typeof device.connect === 'function',
        hasDestroy: typeof device.destroy === 'function',
        hasRegister: typeof device.register === 'function'
      } : null
    });
    
    if (!device) {
      console.error('Device reference is null');
      toast({
        title: 'Phone not ready',
        description: 'Device not available. Please refresh the page.',
        variant: 'destructive',
      });
      return;
    }

    if (!state.isReady || device.state !== 'registered') {
      console.error('Device not ready for calls:', {
        isReady: state.isReady,
        deviceState: device.state
      });
      toast({
        title: 'Phone not ready',
        description: `Device status: ${device.state}. Please wait for connection.`,
        variant: 'destructive',
      });
      return;
    }

    if (typeof device.connect !== 'function') {
      console.error('Device connect method not available');
      toast({
        title: 'Call failed',
        description: 'Device connection method not available',
        variant: 'destructive',
      });
      return;
    }

    try {
      console.log('=== STARTING CALL CONNECTION ===');
      
      // Lock initialization to prevent device destruction
      const wasInitializing = initializationRef.current;
      initializationRef.current = true;
      console.log('Locked device initialization, was:', wasInitializing);
      
      const callParams = {
        params: { 
          To: to, 
          From: from || twilioStatus?.phoneNumber || '',
        },
        rtcConstraints: {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000,
            channelCount: 1,
          }
        }
      };
      
      console.log('Call parameters:', callParams);
      console.log('Device before connect call:', {
        state: device.state,
        isDestroyed: device.isDestroyed,
        type: typeof device.connect
      });
      
      const call = await device.connect(callParams);
      console.log('Call object created:', {
        callExists: !!call,
        callType: typeof call,
        callMethods: call ? {
          hasAccept: typeof call.accept === 'function',
          hasDisconnect: typeof call.disconnect === 'function',
          hasStatus: typeof call.status === 'function'
        } : null
      });
      
      if (!call) {
        throw new Error('Call object is null after device.connect()');
      }

      // Update state immediately
      setState(prev => ({
        ...prev,
        activeCall: call,
      }));

      // Setup call event listeners
      console.log('Setting up call listeners...');
      setupCallListeners(call);
      setupAudioForCall(call);

      console.log('=== CALL CONNECTION SUCCESSFUL ===');
      toast({
        title: 'Call connecting',
        description: `Connecting to ${to}...`,
      });

    } catch (error: any) {
      console.error('=== CALL CONNECTION FAILED ===');
      console.error('Error details:', {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
        code: error?.code
      });
      
      // Restore initialization state
      initializationRef.current = false;
      
      const errorMessage = getErrorMessage(error);
      toast({
        title: 'Call failed',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  }, [state.device, state.isReady, state.deviceStatus, hasPermission, requestPermission, toast, setupCallListeners, setupAudioForCall, getErrorMessage, twilioStatus]);

  // Answer incoming call
  const acceptCall = useCallback(() => {
    if (state.incomingCall && typeof state.incomingCall.accept === 'function') {
      try {
        state.incomingCall.accept();
        setupAudioForCall(state.incomingCall);
      } catch (error) {
        console.error('Error accepting call:', error);
      }
    }
  }, [state.incomingCall, setupAudioForCall]);

  // Reject incoming call
  const rejectCall = useCallback(() => {
    if (state.incomingCall && typeof state.incomingCall.reject === 'function') {
      try {
        state.incomingCall.reject();
        setState(prev => ({
          ...prev,
          incomingCall: null,
        }));
      } catch (error) {
        console.error('Error rejecting call:', error);
      }
    }
  }, [state.incomingCall]);

  // Hangup active call
  const hangupCall = useCallback(() => {
    if (state.activeCall && typeof state.activeCall.disconnect === 'function') {
      try {
        state.activeCall.disconnect();
      } catch (error) {
        console.error('Error disconnecting call:', error);
      }
    }
  }, [state.activeCall]);

  // Mute/unmute call
  const toggleMute = useCallback(() => {
    if (state.activeCall && typeof state.activeCall.mute === 'function' && typeof state.activeCall.isMuted === 'function') {
      try {
        state.activeCall.mute(!state.activeCall.isMuted());
      } catch (error) {
        console.error('Error toggling mute:', error);
      }
    }
  }, [state.activeCall]);

  // Send DTMF tones
  const sendDTMF = useCallback((tone: string) => {
    if (state.activeCall && typeof state.activeCall.sendDigits === 'function') {
      try {
        state.activeCall.sendDigits(tone);
      } catch (error) {
        console.error('Error sending DTMF tone:', error);
      }
    }
  }, [state.activeCall]);

  // Destroy device (only if no active calls)
  const destroyDevice = useCallback(() => {
    // Don't destroy if there's an active call or incoming call
    if (state.activeCall || state.incomingCall) {
      console.log('Not destroying device - active call in progress');
      return;
    }
    
    if (deviceRef.current) {
      console.log('Destroying device');
      deviceRef.current.destroy();
      deviceRef.current = null;
    }
    setState(prev => ({
      ...prev,
      device: null,
      isReady: false,
      isConnecting: false,
      activeCall: null,
      incomingCall: null,
      error: null,
      deviceStatus: 'destroyed',
      connectionQuality: 'unknown',
      lastConnectionTest: null,
      reconnectAttempts: 0,
    }));
    initializationRef.current = false;
  }, [state.activeCall, state.incomingCall]);

  // Initialize device when token is available - with stricter controls
  useEffect(() => {
    console.log('Device initialization effect:', {
      hasToken: !!tokenData?.accessToken,
      isInitializing: initializationRef.current,
      twilioConfigured: twilioStatus?.isConfigured,
      deviceStatus: state.deviceStatus,
      hasActiveCall: !!state.activeCall,
      deviceExists: !!deviceRef.current,
      deviceState: deviceRef.current?.state
    });
    
    // NEVER reinitialize if there's an active call or incoming call
    if (state.activeCall || state.incomingCall) {
      console.log('BLOCKED: Device initialization blocked - call in progress');
      return;
    }

    // NEVER reinitialize if device is ready and functional
    if (deviceRef.current && state.isReady && state.deviceStatus === 'registered' && deviceRef.current.state === 'registered') {
      console.log('BLOCKED: Device already ready and functional, skipping initialization');
      return;
    }

    // NEVER reinitialize if already initializing
    if (initializationRef.current) {
      console.log('BLOCKED: Device initialization already in progress');
      return;
    }
    
    if (tokenData?.accessToken && twilioStatus?.isConfigured) {
      console.log('ALLOWED: Starting device initialization...');
      initializeDevice();
    }
  }, [tokenData?.accessToken, twilioStatus?.isConfigured]);

  // Update token when it changes
  useEffect(() => {
    if (tokenData?.accessToken && deviceRef.current && state.isReady) {
      deviceRef.current.updateToken(tokenData.accessToken);
    }
  }, [tokenData, state.isReady]);

  // Check microphone permission and show modal if needed
  const checkAndRequestMicPermission = useCallback(async (): Promise<boolean> => {
    if (hasPermission) return true;
    
    const granted = await requestPermission();
    if (!granted) {
      toast({
        title: 'Microphone Required',
        description: 'Please allow microphone access for voice calls',
        variant: 'destructive',
      });
    }
    return granted;
  }, [hasPermission, requestPermission, toast]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      stopHealthMonitoring();
      cleanupAudio();
      
      // Only destroy device if no active calls
      if (!state.activeCall && !state.incomingCall) {
        destroyDevice();
      }
    };
  }, [cleanupAudio, destroyDevice, stopHealthMonitoring, state.activeCall, state.incomingCall]);

  return {
    ...state,
    isConfigured: twilioStatus?.isConfigured || false,
    isLoading: statusLoading,
    phoneNumber: twilioStatus?.phoneNumber,
    healthStatus,
    hasPermission,
    makeCall,
    acceptCall,
    rejectCall,
    hangupCall,
    toggleMute,
    sendDTMF,
    destroyDevice,
    initializeDevice,
    makeCallMutation,
    checkAndRequestMicPermission,
    isMuted: (state.activeCall && typeof state.activeCall.isMuted === 'function') ? state.activeCall.isMuted() : false,
  };
};