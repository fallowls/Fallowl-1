import { useState, useRef, useCallback, useEffect } from 'react';
import type { Contact } from "@shared/schema";
import type { ParallelCallLine } from "@shared/parallelDialerTypes";

interface DialerStats {
  totalDialed: number;
  connected: number;
  voicemails: number;
  failed: number;
  avgConnectTime: number;
  connectRate: number;
  talkTime: number;
  skippedDnc: number;
  skippedMaxAttempts: number;
}

export interface DialedContact {
  contact: Contact;
  status: 'connected' | 'voicemail' | 'no-answer' | 'busy' | 'failed';
  duration: number;
  dialedAt: Date;
}

export function useParallelDialerState(initialParallelLines = 3) {
  const [isDialing, setIsDialing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [parallelLines, setParallelLines] = useState(initialParallelLines);
  const [callLines, setCallLines] = useState<ParallelCallLine[]>([]);
  const [queuedContacts, setQueuedContacts] = useState<Contact[]>([]);
  const [dialedContacts, setDialedContacts] = useState<DialedContact[]>([]);
  const [currentContactIndex, setCurrentContactIndex] = useState(0);
  const [amdEnabled, setAmdEnabled] = useState(true);
  const [amdSensitivity, setAmdSensitivity] = useState<'standard' | 'high' | 'low'>('high');
  const [autoSkipVoicemail, setAutoSkipVoicemail] = useState(true);
  const [aggressiveDialing, setAggressiveDialing] = useState(false);
  const [greetingUrl, setGreetingUrl] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);
  const [stats, setStats] = useState<DialerStats>({
    totalDialed: 0,
    connected: 0,
    voicemails: 0,
    failed: 0,
    avgConnectTime: 0,
    connectRate: 0,
    talkTime: 0,
    skippedDnc: 0,
    skippedMaxAttempts: 0
  });
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [firstConnectTime, setFirstConnectTime] = useState<number | null>(null);

  const processedCallSidsRef = useRef<Set<string>>(new Set());
  const dialedPhonesRef = useRef<Set<string>>(new Set());

  const initializeDialer = useCallback(() => {
    const lines: ParallelCallLine[] = Array.from({ length: parallelLines }, (_, i) => ({
      id: `line-${i}`,
      phone: '',
      name: '',
      status: 'idle',
      duration: 0
    }));
    setCallLines(lines);
  }, [parallelLines]);

  useEffect(() => {
    initializeDialer();
  }, [initializeDialer]);

  const recordCompletedCall = useCallback((
    callSid: string,
    contact: Contact,
    status: DialedContact['status'],
    duration: number,
    answeredBy?: 'human' | 'machine' | 'fax' | 'unknown'
  ) => {
    if (processedCallSidsRef.current.has(callSid)) {
      return;
    }
    processedCallSidsRef.current.add(callSid);
    
    setDialedContacts(prev => [...prev, {
      contact,
      status,
      duration,
      dialedAt: new Date()
    }]);
    
    setStats(prev => {
      const updates = { ...prev };
      if (status === 'connected' || answeredBy === 'human') {
        updates.connected = prev.connected + 1;
        updates.talkTime = prev.talkTime + duration;
      } else if (status === 'voicemail' || answeredBy === 'machine') {
        updates.voicemails = prev.voicemails + 1;
      } else {
        updates.failed = prev.failed + 1;
      }
      return updates;
    });
    
    setCurrentContactIndex(prev => prev + 1);
  }, []);

  const startDialing = useCallback((contacts: Contact[]) => {
    setIsDialing(true);
    setSessionStartTime(Date.now());
    setQueuedContacts([...contacts]);
  }, []);

  const stopDialing = useCallback(() => {
    setIsDialing(false);
    setIsPaused(false);
    setQueuedContacts([]);
    setCurrentContactIndex(0);
    dialedPhonesRef.current.clear();
  }, []);

  const togglePause = useCallback(() => {
    setIsPaused(prev => !prev);
  }, []);

  return {
    isDialing,
    isPaused,
    selectedListId,
    parallelLines,
    callLines,
    queuedContacts,
    dialedContacts,
    currentContactIndex,
    amdEnabled,
    amdSensitivity,
    autoSkipVoicemail,
    aggressiveDialing,
    greetingUrl,
    showSettings,
    stats,
    sessionStartTime,
    firstConnectTime,
    processedCallSidsRef,
    dialedPhonesRef,
    setIsDialing,
    setIsPaused,
    setSelectedListId,
    setParallelLines,
    setCallLines,
    setQueuedContacts,
    setDialedContacts,
    setCurrentContactIndex,
    setAmdEnabled,
    setAmdSensitivity,
    setAutoSkipVoicemail,
    setAggressiveDialing,
    setGreetingUrl,
    setShowSettings,
    setStats,
    setSessionStartTime,
    setFirstConnectTime,
    recordCompletedCall,
    startDialing,
    stopDialing,
    togglePause
  };
}
