import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useStore } from '@/store/useStore';
import { useAuth } from '@/hooks/use-auth';
import { TwilioDeviceManager, TwilioDeviceState, DeviceManagerEvent } from '@/lib/twilio/DeviceManager';

// Type definitions for API responses
interface TwilioStatusResponse {
  isConfigured: boolean;
  phoneNumber?: string;
}

interface TwilioCredentialsResponse {
  configured?: boolean;
  isConfigured?: boolean;
  phoneNumber?: string | null;
  credentials?: {
    phoneNumber?: string | null;
  } | null;
}

interface TwilioTokenResponse {
  accessToken: string;
  identity: string;
}

// Custom hook that uses the singleton device manager
export const useTwilioDeviceV2 = () => {
  const [state, setState] = useState<TwilioDeviceState>(TwilioDeviceManager.getInstance().getState());

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deviceManager = useRef(TwilioDeviceManager.getInstance());
  const globalStore = useStore();
  const { user } = useAuth();

  const { data: twilioStatus } = useQuery<TwilioStatusResponse>({
    queryKey: ['/api/user/twilio/status'],
    enabled: !!user,
    staleTime: 2000,
    refetchInterval: 5000,
  });

  const { data: twilioCredentials } = useQuery<TwilioCredentialsResponse>({
    queryKey: ['/api/user/twilio/credentials'],
    enabled: !!user,
    staleTime: 5000,
    refetchInterval: 15000,
  });

  const isConfiguredFromStatus = !!twilioStatus?.isConfigured;
  const isConfiguredFromCredentials = !!(twilioCredentials?.configured || twilioCredentials?.isConfigured);
  const isConfigured = isConfiguredFromStatus || isConfiguredFromCredentials;

  const phoneNumber =
    twilioStatus?.phoneNumber ||
    twilioCredentials?.phoneNumber ||
    twilioCredentials?.credentials?.phoneNumber;

  // Query to get access token - only when needed
  const { data: tokenData } = useQuery<TwilioTokenResponse>({
    queryKey: ['/api/twilio/access-token'],
    enabled: isConfigured,
    staleTime: 50 * 60 * 1000, // 50 minutes
    refetchInterval: 55 * 60 * 1000, // 55 minutes
  });

  // Set up device manager listener
  useEffect(() => {
    const manager = deviceManager.current;
    
    const handleEvent = (event: DeviceManagerEvent) => {
      if (event.type === 'state_change') {
        setState(event.state);
      } else if (event.type === 'incoming_call') {
        handleIncomingCall(event.call);
      } else if (event.type === 'call_accepted') {
        handleCallAccepted(event.call);
      } else if (event.type === 'call_disconnected') {
        handleCallDisconnected();
      } else if (event.type === 'call_rejected') {
        handleCallRejected();
      } else if (event.type === 'call_error') {
        handleCallError(event.error);
      }
    };

    manager.addListener(handleEvent);

    return () => {
      manager.removeListener(handleEvent);
    };
  }, []);

  // Handle business logic for events
  const handleIncomingCall = async (call: any) => {
    // Check if this is a parallel dialer call by looking at custom parameters
    const isParallelDialer = call.customParameters?.get('isParallelDialer') === 'true';
    
    if (isParallelDialer) {
      // CRITICAL: Check if agent is already on an active call to prevent race condition
      if (state.activeCall) {
        console.warn('⚠️ Rejecting parallel dialer call - agent already on active call');
        const lineId = call.customParameters?.get('lineId');
        const contactPhone = call.customParameters?.get('contactPhone');
        
        // Reject the call
        call.reject();
        
        // Notify backend to mark this line as busy/failed so it can dial next contact
        if (lineId) {
          notifyRejection(call.parameters.CallSid, lineId, contactPhone);
        }
        return;
      }
      
      // Auto-accept parallel dialer calls IMMEDIATELY before any other processing
      call.accept();
      console.log('🤖 Auto-accepting parallel dialer call');
      
      // Notify global store
      const contactName = call.customParameters?.get('contactName') || 'Unknown';
      const contactPhone = call.customParameters?.get('contactPhone') || '';
      globalStore.setCallStatus('connected');
      globalStore.setCallStartTime(new Date());
      globalStore.setCallerName(contactName);
      globalStore.setCurrentNumber(contactPhone);
      
      // CRITICAL FIX: Notify backend that call connected
      const lineId = call.customParameters?.get('lineId');
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
      
      try {
        const response = await fetch(`/api/dialer/conference/check-join/${callSid}`, {
          method: 'GET',
          credentials: 'include'
        });
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.isConferenceJoin) {
            // Auto-accept conference join call
            console.log('🎯 Auto-accepting conference join call:', callSid);
            call.accept();
            globalStore.setCallStatus('connected');
            globalStore.setCallStartTime(new Date());
            globalStore.setCurrentNumber(call.parameters.From || 'Unknown');
            globalStore.setCallerName('Conference Call');
            globalStore.setIncomingCallInfo(null);
            return;
          }
        }
      } catch (err) {
        console.error('❌ Failed to check conference join status:', err);
      }
      
      // Regular incoming call - show incoming call UI
      console.log('📞 Regular incoming call - showing UI for manual accept');
      const callerNumber = call.parameters?.From || 'Unknown';
      globalStore.setCallStatus('incoming');
      globalStore.setIncomingCallInfo({
        name: 'Unknown Caller',
        phone: callerNumber,
      });
    }
  };

  const notifyRejection = async (callSid: string, lineId: string, phone: string, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch('/api/dialer/call-rejected', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            callSid,
            lineId,
            phone,
            reason: 'agent_busy'
          })
        });
        
        if (response.ok) {
          console.log(`✅ Backend notified of call rejection for line ${lineId}`);
          return;
        }
      } catch (err) {
        console.error(`❌ Error notifying backend of rejection (attempt ${i + 1}/${retries}):`, err);
      }
      
      // Wait before retry (exponential backoff)
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 500));
      }
    }
  };

  const handleCallAccepted = (call: any) => {
    const callerPhone = call.parameters?.From || globalStore.currentNumber || 'Unknown';
    const callerName = globalStore.callerName || 'Unknown Caller';
    globalStore.setCallStatus('connected');
    globalStore.setCallStartTime(new Date());
    globalStore.setCurrentNumber(callerPhone);
    globalStore.setCallerName(callerName);
    globalStore.setIncomingCallInfo(null);
  };

  const handleCallDisconnected = () => {
    globalStore.setCallStatus('ready');
    globalStore.setCallStartTime(null);
    globalStore.setIsMuted(false);
    globalStore.setIsOnHold(false);
    globalStore.setIsRecording(false);
    globalStore.setCallNotes('');
    globalStore.setCallerName('');
    globalStore.setCurrentNumber('');
    globalStore.setIncomingCallInfo(null);
  };

  const handleCallRejected = () => {
    globalStore.setCallStatus('ready');
    globalStore.setIncomingCallInfo(null);
  };

  const handleCallError = (error: any) => {
    globalStore.setCallStatus('failed');
    globalStore.setCallStartTime(null);
    globalStore.setIsMuted(false);
    globalStore.setIsOnHold(false);
    globalStore.setIsRecording(false);
    globalStore.setCallNotes('');
    globalStore.setCallerName('');
    globalStore.setCurrentNumber('');
    globalStore.setIncomingCallInfo(null);
  };

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

  // On-demand initialization for cases where the device hasn't registered yet
  const initializeDeviceNow = useCallback(async (): Promise<boolean> => {
    if (!user) {
      toast({
        title: 'Not authenticated',
        description: 'Please log in again and try.',
        variant: 'destructive',
      });
      return false;
    }

    if (!isConfigured) {
      toast({
        title: 'Not configured',
        description: 'Twilio credentials are not configured yet.',
        variant: 'destructive',
      });
      return false;
    }

    const manager = deviceManager.current;

    if (manager.isDeviceReady() || manager.isDeviceInitializing()) {
      return manager.isDeviceReady();
    }

    try {
      let accessToken = tokenData?.accessToken;

      if (!accessToken) {
        const res = await apiRequest('GET', '/api/twilio/access-token');
        const data = await res.json();
        accessToken = data?.accessToken;
      }

      if (!accessToken) {
        throw new Error('Failed to retrieve access token');
      }

      const success = await manager.initializeDevice(accessToken, user.id);
      if (!success) {
        throw new Error('Device initialization failed');
      }
      return true;
    } catch (error: any) {
      toast({
        title: 'Phone not ready',
        description: error?.message || 'Unable to initialize phone',
        variant: 'destructive',
      });
      return false;
    }
  }, [user, isConfigured, tokenData?.accessToken, toast]);

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
      globalStore.setCallStatus('connecting');
      globalStore.setCurrentNumber(to);
      
      await manager.makeCall(to);
      
      toast({
        title: 'Call initiated',
        description: `Calling ${to}...`,
      });
    } catch (error: any) {
      globalStore.setCallStatus('failed');
      toast({
        title: 'Call failed',
        description: error.message || 'Unable to make call',
        variant: 'destructive',
      });
      throw error;
    }
  }, [toast, globalStore]);

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
    isConfigured,
    hasToken: !!tokenData?.accessToken,
    
    // Functions
    requestMicrophonePermission,
    initializeDeviceNow,
    makeCall,
    acceptCall,
    rejectCall,
    hangupCall,
    sendDTMF,
    muteCall,
    holdCall,
    isMuted,
    
    // Utility
    phoneNumber: phoneNumber || '',
  };
};
