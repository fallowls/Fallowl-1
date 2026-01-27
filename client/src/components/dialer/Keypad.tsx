import { useStore } from "@/store/useStore";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { Delete, Phone, PhoneOff, CheckCircle, AlertTriangle, Settings } from "lucide-react";
import { useTwilioDeviceV2 } from "@/hooks/useTwilioDeviceV2";
import TwilioDeviceStatus from "@/components/TwilioDeviceStatus";
import { Link } from "wouter";
import { useState, useEffect, useRef } from "react";
import { formatForDialing, formatForDisplay, cleanPhoneNumber } from "@/utils/phoneNumber";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";

const keypadNumbers = [
  { number: '1', letters: '' },
  { number: '2', letters: 'ABC' },
  { number: '3', letters: 'DEF' },
  { number: '4', letters: 'GHI' },
  { number: '5', letters: 'JKL' },
  { number: '6', letters: 'MNO' },
  { number: '7', letters: 'PQRS' },
  { number: '8', letters: 'TUV' },
  { number: '9', letters: 'WXYZ' },
  { number: '*', letters: '' },
  { number: '0', letters: '' },
  { number: '#', letters: '' },
];

export default function Keypad() {
  const { 
    currentNumber, 
    setCurrentNumber, 
    callStatus, 
    setCallStatus,
    setCallStartTime,
    setCallerName,
    setIsMuted,
    setIsOnHold,
    setIsRecording,
    setIncomingCallInfo
  } = useStore();

  const inputRef = useRef<HTMLInputElement>(null);
  const [displayNumber, setDisplayNumber] = useState('');

  const {
    isReady,
    isConnecting,
    isConfigured: deviceIsConfigured,
    deviceStatus,
    activeCall,
    incomingCall,
    makeCall,
    acceptCall,
    rejectCall,
    hangupCall,
    sendDTMF,
    error,
    phoneNumber: devicePhoneNumber
  } = useTwilioDeviceV2();

  const twilioStatus = useQuery<{
    isConfigured: boolean;
    phoneNumber: string | null;
  }>({
    queryKey: ['/api/user/twilio/status'],
    refetchInterval: 5000,
  });

  const isConfigured = twilioStatus.data?.isConfigured ?? deviceIsConfigured;
  const phoneNumber = twilioStatus.data?.phoneNumber ?? devicePhoneNumber;

  // Update display number when currentNumber changes
  useEffect(() => {
    setDisplayNumber(formatForDisplay(currentNumber));
  }, [currentNumber]);

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle keypad if input is focused or no other input is focused
      if (document.activeElement?.tagName === 'INPUT' && document.activeElement !== inputRef.current) {
        return;
      }

      const key = event.key;
      
      // Handle numeric keys and special keypad characters
      if (/^[0-9*#]$/.test(key)) {
        event.preventDefault();
        handleKeyPress(key);
      }
      // Handle backspace
      else if (key === 'Backspace') {
        event.preventDefault();
        handleBackspace();
      }
      // Handle Enter to make call
      else if (key === 'Enter' && currentNumber && isReady && isConfigured) {
        event.preventDefault();
        handleCall();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentNumber, isReady, isConfigured]);

  const handleKeyPress = (key: string) => {
    setCurrentNumber(currentNumber + key);
    
    // If we're on an active call, send DTMF tones
    if (activeCall) {
      sendDTMF(key);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    
    // For direct typing, clean and format the input
    const cleaned = cleanPhoneNumber(input);
    setCurrentNumber(cleaned);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    
    // Format pasted number and add default country code if needed
    const formatted = formatForDialing(pastedText);
    setCurrentNumber(formatted);
  };

  const handleBackspace = () => {
    setCurrentNumber(currentNumber.slice(0, -1));
  };

  const handleCall = async () => {
    if (currentNumber && isReady && isConfigured) {
      // Format number for dialing (ensure E.164 format with country code)
      const dialableNumber = formatForDialing(currentNumber);
      
      // User interaction for audio context
      console.log('🔊 User initiated call - audio context activated');
      
      // Try to activate audio context first
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
          console.log('✅ Audio context activated');
        }
      } catch (error) {
        console.warn('⚠️ Audio context activation failed:', error);
      }
      
      // Reset all call states
      setIsMuted(false);
      setIsOnHold(false);
      setIsRecording(false);
      setCallStartTime(null);
      
      // Set caller name based on number (simulate contact lookup)
      const contacts = {
        '+1234567890': 'John Doe',
        '+1987654321': 'Jane Smith',
        '+1555123456': 'Mike Johnson',
      };
      setCallerName(contacts[dialableNumber as keyof typeof contacts] || 'Unknown Caller');
      
      setCallStatus('connecting');
      
      try {
        // Make call using Twilio with formatted number
        await makeCall(dialableNumber);
        setCallStatus('connected');
        setCallStartTime(new Date());
      } catch (error) {
        setCallStatus('failed');
        console.error('Call failed:', error);
      }
    }
  };

  const handleEndCall = () => {
    if (activeCall) {
      hangupCall();
    }
    setCallStatus('ended');
    setCallStartTime(null);
    setTimeout(() => {
      setCallStatus('ready');
    }, 1000);
  };



  const getStatusColor = () => {
    if (isReady && deviceStatus === 'registered') {
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    }
    
    return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  };

  const getStatusText = () => {
    if (isReady && deviceStatus === 'registered') {
      return 'Ready';
    }
    
    return null; // Don't show any status unless ready
  };

  return (
    <div className="max-w-xs mx-auto">
      {/* Configuration Alert */}
      {error && error.includes('TwiML') || (!isReady && isConfigured && deviceStatus !== 'registered') ? (
        <Alert className="mb-4 border-orange-200 bg-orange-50">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800">
            TwiML Application required for calling.{" "}
            <Link href="/settings" className="font-semibold underline hover:no-underline">
              Configure in Settings
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}
      
      <div className="text-center">
        {/* Number Display */}
        <div className="mb-6">
          <input
            ref={inputRef}
            type="text"
            value={displayNumber}
            onChange={handleInputChange}
            onPaste={handlePaste}
            onClick={() => inputRef.current?.focus()}
            className="w-full text-center text-2xl font-mono bg-transparent border-none outline-none text-foreground placeholder-muted-foreground cursor-text"
            placeholder="Enter number"
            autoComplete="tel"
            autoFocus
          />
          <div className="flex justify-center mt-2">
            {isConfigured && isReady ? (
              <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200 flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                Ready
              </Badge>
            ) : isConfigured ? (
              <Badge variant="secondary" className="bg-blue-100 text-blue-700 border-blue-200 flex items-center gap-1">
                <Settings className="h-3 w-3" />
                Configured
              </Badge>
            ) : (
              <Badge variant="outline" className="text-gray-500 flex items-center gap-1">
                <PhoneOff className="h-3 w-3" />
                Not Configured
              </Badge>
            )}
          </div>
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {keypadNumbers.map((key) => (
            <button
              key={key.number}
              className="w-14 h-14 bg-card border border-border rounded-full shadow-md hover:shadow-lg active:shadow-sm transition-all duration-200 flex flex-col items-center justify-center border-none outline-none focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => {
                handleKeyPress(key.number);
                inputRef.current?.focus();
              }}
              disabled={callStatus === 'connecting'}
            >
              <span className="text-lg font-semibold text-card-foreground">{key.number}</span>
              {key.letters && (
                <span className="text-xs text-muted-foreground leading-none">{key.letters}</span>
              )}
            </button>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-center space-x-4">
          {!activeCall ? (
            <button
              onClick={handleCall}
              disabled={!currentNumber || !isReady || isConnecting}
              className="w-16 h-16 bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-full shadow-lg hover:shadow-xl active:shadow-md transition-all duration-200 flex items-center justify-center border-none outline-none focus:outline-none"
            >
              <Phone className="w-6 h-6 text-white" />
            </button>
          ) : (
            <button
              onClick={handleEndCall}
              className="w-16 h-16 bg-red-500 hover:bg-red-600 rounded-full shadow-lg hover:shadow-xl active:shadow-md transition-all duration-200 flex items-center justify-center border-none outline-none focus:outline-none"
            >
              <Phone className="w-6 h-6 text-white" />
            </button>
          )}
          <button
            onClick={() => {
              handleBackspace();
              inputRef.current?.focus();
            }}
            className="w-16 h-16 bg-gray-500 hover:bg-gray-600 rounded-full shadow-lg hover:shadow-xl active:shadow-md transition-all duration-200 flex items-center justify-center border-none outline-none focus:outline-none"
          >
            <Delete className="w-6 h-6 text-white" />
          </button>
        </div>


      </div>
    </div>
  );
}
