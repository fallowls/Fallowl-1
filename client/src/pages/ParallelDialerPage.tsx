import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  Phone, PhoneCall, PhoneOff, Play, Pause, Settings,
  CheckCircle, XCircle, Users, ListOrdered,
  Zap, BarChart3, Mic, MicOff, AlertCircle, Building2,
  ChevronDown, ChevronUp, Save, Volume2, Timer, Clock,
  ArrowRight, SkipForward, PhoneOutgoing, PhoneIncoming,
  CircleDot, Loader2, CheckCircle2, XOctagon, Voicemail
} from "lucide-react";
import { ParallelDialerSkeleton } from "@/components/skeletons/ParallelDialerSkeleton";
import { useTwilioDeviceV2 } from "@/hooks/useTwilioDeviceV2";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { Contact, ContactList } from "@shared/schema";

interface ParallelCallLine {
  id: string;
  contactId?: number;
  phone: string;
  name: string;
  company?: string;
  jobTitle?: string;
  email?: string;
  status: 'idle' | 'dialing' | 'ringing' | 'answered' | 'failed' | 'busy' | 'voicemail' | 'connected' | 'in-progress' | 'completed' | 'no-answer' | 'canceled' | 'human-detected' | 'machine-detected' | 'paused' | 'on-hold';
  duration: number;
  callSid?: string;
  callId?: number;
  startTime?: number;
  isAnsweringMachine?: boolean;
  answeredBy?: 'human' | 'machine' | 'fax' | 'unknown';
  statsRecorded?: boolean;
  disposition?: string;
}

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

interface DialedContact {
  contact: Contact;
  status: 'connected' | 'voicemail' | 'no-answer' | 'busy' | 'failed';
  duration: number;
  dialedAt: Date;
}

export default function ParallelDialerPage() {
  const [isDialing, setIsDialing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [parallelLines, setParallelLines] = useState(3);
  const [callsPerSecond, setCallsPerSecond] = useState(3);
  const [callLines, setCallLines] = useState<ParallelCallLine[]>([]);
  const [queuedContacts, setQueuedContacts] = useState<Contact[]>([]);
  const [dialedContacts, setDialedContacts] = useState<DialedContact[]>([]);
  const [currentContactIndex, setCurrentContactIndex] = useState(0);
  const [amdEnabled, setAmdEnabled] = useState(true);
  const [amdTimeout, setAmdTimeout] = useState(5);
  const [amdSensitivity, setAmdSensitivity] = useState<'standard' | 'high' | 'low'>('high');
  const [autoSkipVoicemail, setAutoSkipVoicemail] = useState(true);
  const [useConferenceMode, setUseConferenceMode] = useState(true);
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
  const [conferenceActive, setConferenceActive] = useState(false);
  const [conferenceReady, setConferenceReady] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [firstConnectTime, setFirstConnectTime] = useState<number | null>(null);
  
  const isDialingBatchRef = useRef(false);
  const dialRequestedRef = useRef(false);
  const lineResetTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const statsRecordedLinesRef = useRef<Set<string>>(new Set());
  const dialedPhonesRef = useRef<Set<string>>(new Set());
  const toastRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isDialingRef = useRef(isDialing);
  const isPausedRef = useRef(isPaused);
  const autoSkipVoicemailRef = useRef(autoSkipVoicemail);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { makeCall, isReady, deviceStatus, error: twilioError } = useTwilioDeviceV2();
  
  useEffect(() => {
    console.log('[ParallelDialerPage] Device state:', { isReady, deviceStatus, twilioError });
  }, [isReady, deviceStatus, twilioError]);
  
  useEffect(() => { isDialingRef.current = isDialing; }, [isDialing]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { autoSkipVoicemailRef.current = autoSkipVoicemail; }, [autoSkipVoicemail]);
  useEffect(() => { toastRef.current = toast; }, [toast]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      lineResetTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
      lineResetTimeoutsRef.current.clear();
      statsRecordedLinesRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const updateAgentStatus = async () => {
      try {
        await apiRequest('POST', '/api/settings', {
          key: 'agent_webrtc_status',
          value: { isReady, lastUpdate: Date.now() }
        });
      } catch (error) {
        console.error('Failed to update agent status:', error);
      }
    };
    
    updateAgentStatus();
    let heartbeatInterval: NodeJS.Timeout | null = null;
    if (isReady) {
      heartbeatInterval = setInterval(updateAgentStatus, 30000);
    }
    
    return () => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
    };
  }, [isReady]);

  const { data: contactLists = [] } = useQuery<ContactList[]>({
    queryKey: ["/api/lists"],
  });

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const { data: listContacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/lists", selectedListId, "contacts"],
    enabled: !!selectedListId,
  });

  const { data: greetingSetting } = useQuery<{ id: number; key: string; value: string; updatedAt: string }>({
    queryKey: ["/api/settings", "parallel_dialer_greeting"],
  });

  useEffect(() => {
    if (greetingSetting?.value) {
      setGreetingUrl(greetingSetting.value as string);
    }
  }, [greetingSetting]);

  const saveGreetingMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await apiRequest("POST", "/api/settings", {
        key: "parallel_dialer_greeting",
        value: url,
        global: true,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings", "parallel_dialer_greeting"] });
      toast({
        title: "Greeting saved",
        description: "Pre-recorded greeting URL has been updated.",
      });
    },
  });

  const filteredContacts = selectedListId ? listContacts : contacts;

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

  // Handle WebSocket events for parallel call status updates
  useEffect(() => {
    const handleCallStarted = (event: CustomEvent) => {
      const { lineId, phone, contactId, callSid } = event.detail;
      console.log('[ParallelDialer] Call started:', event.detail);
      
      const contact = filteredContacts.find(c => c.id === contactId);
      
      setCallLines(prev => prev.map(line => 
        line.id === lineId ? {
          ...line,
          phone,
          name: contact?.name || 'Unknown',
          company: contact?.company || undefined,
          email: contact?.email || undefined,
          contactId,
          callSid,
          status: 'dialing',
          startTime: Date.now()
        } : line
      ));
      
      // Update stats
      setStats(prev => ({ ...prev, totalDialed: prev.totalDialed + 1 }));
    };

    const handleCallStatus = (event: CustomEvent) => {
      const { lineId, status, callSid, answeredBy, duration } = event.detail;
      console.log('[ParallelDialer] Call status update:', event.detail);
      
      setCallLines(prev => prev.map(line => {
        if (line.id === lineId || (callSid && line.callSid === callSid)) {
          const newLine = { 
            ...line, 
            status: status as ParallelCallLine['status'],
            duration: duration || line.duration,
            answeredBy
          };
          
          // Handle terminal states - add to dialed contacts
          if (['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(status)) {
            const contact = filteredContacts.find(c => c.id === line.contactId);
            if (contact) {
              const dialedStatus: DialedContact['status'] = 
                status === 'completed' ? 'connected' :
                status === 'failed' ? 'failed' :
                status === 'busy' ? 'busy' :
                'no-answer';
              
              setDialedContacts(prev => {
                if (prev.find(d => d.contact.id === contact.id)) return prev;
                return [...prev, {
                  contact,
                  status: dialedStatus,
                  duration: duration || line.duration,
                  dialedAt: new Date()
                }];
              });
              
              // Update stats based on outcome
              setStats(prev => {
                const updates = { ...prev };
                if (status === 'completed' && answeredBy === 'human') {
                  updates.connected = prev.connected + 1;
                  updates.talkTime = prev.talkTime + (duration || 0);
                } else if (answeredBy === 'machine' || status === 'voicemail') {
                  updates.voicemails = prev.voicemails + 1;
                } else if (['failed', 'busy', 'no-answer'].includes(status)) {
                  updates.failed = prev.failed + 1;
                }
                return updates;
              });
            }
            
            // Reset line after a short delay
            setTimeout(() => {
              setCallLines(prev => prev.map(l => 
                l.id === lineId ? { ...l, status: 'idle', phone: '', name: '', callSid: undefined, contactId: undefined, duration: 0 } : l
              ));
            }, 3000);
          }
          
          return newLine;
        }
        return line;
      }));
    };

    const handleCallConnected = (event: CustomEvent) => {
      const { lineId, callSid, answeredBy, duration } = event.detail;
      console.log('[ParallelDialer] Call connected:', event.detail);
      
      if (!firstConnectTime) {
        setFirstConnectTime(Date.now());
      }
      
      setCallLines(prev => prev.map(line => {
        if (line.id === lineId || (callSid && line.callSid === callSid)) {
          return { 
            ...line, 
            status: answeredBy === 'machine' ? 'machine-detected' : 'human-detected',
            answeredBy,
            duration: duration || line.duration
          };
        }
        return line;
      }));
    };

    const handleCallEnded = (event: CustomEvent) => {
      const { lineId, callSid, status, duration, answeredBy } = event.detail;
      console.log('[ParallelDialer] Call ended:', event.detail);
      
      setCallLines(prev => prev.map(line => {
        if (line.id === lineId || (callSid && line.callSid === callSid)) {
          const contact = filteredContacts.find(c => c.id === line.contactId);
          if (contact) {
            const dialedStatus: DialedContact['status'] = 
              answeredBy === 'human' ? 'connected' :
              answeredBy === 'machine' ? 'voicemail' :
              status === 'busy' ? 'busy' :
              status === 'no-answer' ? 'no-answer' :
              'failed';
            
            setDialedContacts(prev => {
              if (prev.find(d => d.contact.id === contact.id)) return prev;
              return [...prev, {
                contact,
                status: dialedStatus,
                duration: duration || line.duration,
                dialedAt: new Date()
              }];
            });
            
            // Update stats
            setStats(prev => {
              const updates = { ...prev };
              if (answeredBy === 'human') {
                updates.connected = prev.connected + 1;
                updates.talkTime = prev.talkTime + (duration || 0);
              } else if (answeredBy === 'machine') {
                updates.voicemails = prev.voicemails + 1;
              } else {
                updates.failed = prev.failed + 1;
              }
              return updates;
            });
          }
          
          // Reset line after delay
          setTimeout(() => {
            setCallLines(prev => prev.map(l => 
              l.id === lineId ? { ...l, status: 'idle', phone: '', name: '', callSid: undefined, contactId: undefined, duration: 0 } : l
            ));
          }, 3000);
          
          return { ...line, status: 'completed', duration: duration || line.duration };
        }
        return line;
      }));
    };

    window.addEventListener('parallel_call_started', handleCallStarted as EventListener);
    window.addEventListener('parallel_call_status', handleCallStatus as EventListener);
    window.addEventListener('parallel_call_connected', handleCallConnected as EventListener);
    window.addEventListener('parallel_call_ended', handleCallEnded as EventListener);

    return () => {
      window.removeEventListener('parallel_call_started', handleCallStarted as EventListener);
      window.removeEventListener('parallel_call_status', handleCallStatus as EventListener);
      window.removeEventListener('parallel_call_connected', handleCallConnected as EventListener);
      window.removeEventListener('parallel_call_ended', handleCallEnded as EventListener);
    };
  }, [filteredContacts, firstConnectTime]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startDialing = () => {
    if (!selectedListId && filteredContacts.length === 0) {
      toast({
        title: "No contacts",
        description: "Please select a contact list to start dialing.",
        variant: "destructive",
      });
      return;
    }
    setIsDialing(true);
    setSessionStartTime(Date.now());
    setQueuedContacts([...filteredContacts]);
    toast({
      title: "Dialer started",
      description: `Starting to dial ${filteredContacts.length} contacts.`,
    });
  };

  const stopDialing = () => {
    setIsDialing(false);
    setIsPaused(false);
    setQueuedContacts([]);
    setCurrentContactIndex(0);
    dialedPhonesRef.current.clear();
    toast({
      title: "Dialer stopped",
      description: "All dialing activity has been stopped.",
    });
  };

  const togglePause = () => {
    setIsPaused(!isPaused);
    toast({
      title: isPaused ? "Dialer resumed" : "Dialer paused",
      description: isPaused ? "Dialing has resumed." : "Dialing is paused.",
    });
  };

  const addToDialedContacts = useCallback((line: ParallelCallLine, status: DialedContact['status']) => {
    if (!line.contactId) return;
    
    const contact = filteredContacts.find(c => c.id === line.contactId);
    if (!contact) return;
    
    setDialedContacts(prev => {
      const existing = prev.find(d => d.contact.id === contact.id);
      if (existing) return prev;
      
      return [...prev, {
        contact,
        status,
        duration: line.duration,
        dialedAt: new Date()
      }];
    });
  }, [filteredContacts]);

  const markLineCompleted = useCallback((lineId: string, status: DialedContact['status'] = 'connected') => {
    setCallLines(prev => prev.map(line => {
      if (line.id === lineId) {
        addToDialedContacts(line, status);
        return { ...line, status: 'completed' };
      }
      return line;
    }));
  }, [addToDialedContacts]);

  const disconnectCall = async (callSid: string, lineId: string) => {
    try {
      await apiRequest('POST', '/api/twilio/parallel-dialer/disconnect', { callSid });
      markLineCompleted(lineId, 'connected');
    } catch (error) {
      console.error('Failed to disconnect call:', error);
    }
  };

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { bg: string; border: string; icon: JSX.Element; label: string }> = {
      idle: { 
        bg: 'bg-gray-50 dark:bg-gray-900/50', 
        border: 'border-gray-200 dark:border-gray-800',
        icon: <CircleDot className="w-4 h-4 text-gray-400" />,
        label: 'Ready'
      },
      dialing: { 
        bg: 'bg-blue-50 dark:bg-blue-950/50', 
        border: 'border-blue-300 dark:border-blue-700',
        icon: <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />,
        label: 'Dialing'
      },
      ringing: { 
        bg: 'bg-purple-50 dark:bg-purple-950/50', 
        border: 'border-purple-300 dark:border-purple-700',
        icon: <PhoneOutgoing className="w-4 h-4 text-purple-500 animate-pulse" />,
        label: 'Ringing'
      },
      'human-detected': { 
        bg: 'bg-teal-50 dark:bg-teal-950/50', 
        border: 'border-teal-400 dark:border-teal-600',
        icon: <CheckCircle2 className="w-4 h-4 text-teal-600" />,
        label: 'Human'
      },
      connected: { 
        bg: 'bg-emerald-50 dark:bg-emerald-950/50', 
        border: 'border-emerald-400 dark:border-emerald-600',
        icon: <PhoneCall className="w-4 h-4 text-emerald-600" />,
        label: 'Connected'
      },
      'in-progress': { 
        bg: 'bg-emerald-50 dark:bg-emerald-950/50', 
        border: 'border-emerald-400 dark:border-emerald-600',
        icon: <PhoneCall className="w-4 h-4 text-emerald-600" />,
        label: 'In Progress'
      },
      'machine-detected': { 
        bg: 'bg-amber-50 dark:bg-amber-950/50', 
        border: 'border-amber-400 dark:border-amber-600',
        icon: <Voicemail className="w-4 h-4 text-amber-600" />,
        label: 'Machine'
      },
      voicemail: { 
        bg: 'bg-amber-50 dark:bg-amber-950/50', 
        border: 'border-amber-400 dark:border-amber-600',
        icon: <Volume2 className="w-4 h-4 text-amber-600" />,
        label: 'Voicemail'
      },
      failed: { 
        bg: 'bg-red-50 dark:bg-red-950/50', 
        border: 'border-red-400 dark:border-red-600',
        icon: <XOctagon className="w-4 h-4 text-red-600" />,
        label: 'Failed'
      },
      busy: { 
        bg: 'bg-yellow-50 dark:bg-yellow-950/50', 
        border: 'border-yellow-400 dark:border-yellow-600',
        icon: <PhoneOff className="w-4 h-4 text-yellow-600" />,
        label: 'Busy'
      },
      'no-answer': { 
        bg: 'bg-gray-100 dark:bg-gray-800', 
        border: 'border-gray-300 dark:border-gray-700',
        icon: <XCircle className="w-4 h-4 text-gray-500" />,
        label: 'No Answer'
      },
      completed: { 
        bg: 'bg-sky-50 dark:bg-sky-950/50', 
        border: 'border-sky-300 dark:border-sky-700',
        icon: <CheckCircle className="w-4 h-4 text-sky-600" />,
        label: 'Completed'
      },
    };
    return configs[status] || configs.idle;
  };

  if (!isReady) {
    return <ParallelDialerSkeleton />;
  }

  const remainingContacts = queuedContacts.slice(currentContactIndex);
  const connectRate = stats.totalDialed > 0 ? Math.round((stats.connected / stats.totalDialed) * 100) : 0;

  return (
    <div className="min-h-full w-full bg-background">
      <div className="p-4 md:p-6 space-y-4 max-w-[1800px] mx-auto">
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-[16px] bg-gradient-to-br from-teal-500 to-teal-600 shadow-lg shadow-teal-500/25">
              <Phone className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Parallel Dialer</h1>
              <p className="text-sm text-muted-foreground">Multi-line outbound calling system</p>
            </div>
            <Badge 
              className={cn(
                "ml-2 px-3 py-1",
                isReady 
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400" 
                  : "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400"
              )}
            >
              <span className={cn(
                "w-2 h-2 rounded-full mr-2",
                isReady ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
              )} />
              {isReady ? 'Ready' : 'Connecting'}
            </Badge>
          </div>

          {/* Quick Stats */}
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Phone className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <span className="font-bold text-lg text-gray-900 dark:text-white">{stats.totalDialed}</span>
                <span className="text-muted-foreground ml-1">dialed</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <span className="font-bold text-lg text-gray-900 dark:text-white">{stats.connected}</span>
                <span className="text-muted-foreground ml-1">connected</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-teal-100 dark:bg-teal-900/30">
                <BarChart3 className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              </div>
              <div>
                <span className="font-bold text-lg text-gray-900 dark:text-white">{connectRate}%</span>
                <span className="text-muted-foreground ml-1">rate</span>
              </div>
            </div>
          </div>
        </div>

        {/* Control Bar */}
        <Card className="rounded-[16px] border border-gray-200 dark:border-gray-800 shadow-[0_4px_14px_rgba(0,0,0,0.06)]">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              {/* List Selection */}
              <div className="flex items-center gap-2 min-w-[200px]">
                <Label className="text-xs font-medium text-muted-foreground whitespace-nowrap">List:</Label>
                <Select
                  value={selectedListId || "all"}
                  onValueChange={(value) => setSelectedListId(value === "all" ? "" : value)}
                  disabled={isDialing}
                >
                  <SelectTrigger className="h-9" data-testid="select-contact-list">
                    <SelectValue placeholder="Select list..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Contacts ({contacts.length})</SelectItem>
                    {contactLists.map((list) => (
                      <SelectItem key={list.id} value={list.id.toString()}>
                        {list.name} ({list.contactCount || 0})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Lines Control */}
              <div className="flex items-center gap-3 min-w-[180px]">
                <Label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Lines:</Label>
                <Slider
                  min={1}
                  max={10}
                  step={1}
                  value={[parallelLines]}
                  onValueChange={(value) => setParallelLines(value[0])}
                  disabled={isDialing}
                  className="w-24"
                  data-testid="slider-parallel-lines"
                />
                <Badge variant="secondary" className="min-w-[28px] justify-center">{parallelLines}</Badge>
              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Actions */}
              <div className="flex items-center gap-2">
                {!isDialing ? (
                  <Button
                    onClick={startDialing}
                    disabled={!isReady || filteredContacts.length === 0}
                    className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white shadow-lg shadow-teal-500/25 px-6"
                    data-testid="button-start-dialing"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Start Dialing
                  </Button>
                ) : (
                  <>
                    <Button
                      onClick={togglePause}
                      variant="outline"
                      className={cn(
                        "px-4",
                        isPaused && "bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-400"
                      )}
                      data-testid="button-pause-resume"
                    >
                      {isPaused ? (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          Resume
                        </>
                      ) : (
                        <>
                          <Pause className="w-4 h-4 mr-2" />
                          Pause
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={stopDialing}
                      variant="destructive"
                      className="px-4"
                      data-testid="button-stop-dialing"
                    >
                      <PhoneOff className="w-4 h-4 mr-2" />
                      Stop
                    </Button>
                  </>
                )}
                <Button
                  onClick={() => setShowSettings(!showSettings)}
                  variant="outline"
                  size="icon"
                  className={cn(showSettings && "bg-gray-100 dark:bg-gray-800")}
                  data-testid="button-settings"
                >
                  <Settings className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Settings Panel (Collapsible) */}
        {showSettings && (
          <Card className="rounded-[16px] border border-gray-200 dark:border-gray-800 shadow-[0_4px_14px_rgba(0,0,0,0.06)] animate-in slide-in-from-top-2 duration-200">
            <CardHeader className="pb-3 px-4 pt-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2 font-bold text-gray-900 dark:text-white">
                  <div className="p-2 rounded-[12px] bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900">
                    <Settings className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                  </div>
                  Dialer Settings
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowSettings(false)}>
                  <ChevronUp className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* AMD Toggle */}
                <div className="flex items-center justify-between p-3 rounded-[12px] border bg-card">
                  <div className="flex items-center gap-2">
                    <Mic className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <div>
                      <Label className="text-sm font-medium">AMD Detection</Label>
                      <p className="text-xs text-muted-foreground">Auto-detect voicemails</p>
                    </div>
                  </div>
                  <Switch
                    checked={amdEnabled}
                    onCheckedChange={setAmdEnabled}
                    disabled={isDialing}
                    data-testid="switch-amd-enabled"
                  />
                </div>

                {/* Auto-Skip Voicemail */}
                <div className="flex items-center justify-between p-3 rounded-[12px] border bg-card">
                  <div className="flex items-center gap-2">
                    <SkipForward className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <div>
                      <Label className="text-sm font-medium">Auto-Skip VM</Label>
                      <p className="text-xs text-muted-foreground">Skip voicemails</p>
                    </div>
                  </div>
                  <Switch
                    checked={autoSkipVoicemail}
                    onCheckedChange={setAutoSkipVoicemail}
                    disabled={isDialing}
                    data-testid="switch-auto-skip-voicemail"
                  />
                </div>

                {/* Aggressive Mode */}
                <div className="flex items-center justify-between p-3 rounded-[12px] border bg-card">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <div>
                      <Label className="text-sm font-medium">Aggressive (2x)</Label>
                      <p className="text-xs text-muted-foreground">Double dial rate</p>
                    </div>
                  </div>
                  <Switch
                    checked={aggressiveDialing}
                    onCheckedChange={setAggressiveDialing}
                    disabled={isDialing}
                    data-testid="switch-aggressive-dialing"
                  />
                </div>

                {/* AMD Sensitivity */}
                {amdEnabled && (
                  <div className="p-3 rounded-[12px] border bg-card">
                    <Label className="text-sm font-medium mb-2 block">AMD Sensitivity</Label>
                    <Select
                      value={amdSensitivity}
                      onValueChange={(value: 'standard' | 'high' | 'low') => setAmdSensitivity(value)}
                      disabled={isDialing}
                    >
                      <SelectTrigger className="h-8" data-testid="select-amd-sensitivity">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Greeting URL */}
              <div className="mt-4 p-3 rounded-[12px] border bg-card">
                <Label className="text-sm font-medium mb-2 block">Pre-recorded Greeting URL</Label>
                <div className="flex gap-2">
                  <Input
                    value={greetingUrl}
                    onChange={(e) => setGreetingUrl(e.target.value)}
                    placeholder="https://your-cdn.com/greeting.mp3"
                    className="flex-1 h-9"
                    data-testid="input-greeting-url"
                  />
                  <Button
                    onClick={() => saveGreetingMutation.mutate(greetingUrl)}
                    disabled={saveGreetingMutation.isPending}
                    size="sm"
                    className="px-4"
                    data-testid="button-save-greeting"
                  >
                    <Save className="w-4 h-4 mr-1" />
                    Save
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content - Three Panel Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Queue Panel */}
          <Card className="lg:col-span-3 rounded-[16px] border border-gray-200 dark:border-gray-800 shadow-[0_4px_14px_rgba(0,0,0,0.06)]">
            <CardHeader className="pb-3 px-4 pt-4 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2 font-bold text-gray-900 dark:text-white">
                  <div className="p-2 rounded-[12px] bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/30 dark:to-blue-800/20">
                    <ListOrdered className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  Queue
                </CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {remainingContacts.length} waiting
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[400px]">
                {remainingContacts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                    <div className="p-3 rounded-full bg-gray-100 dark:bg-gray-800 mb-3">
                      <Users className="h-6 w-6 text-gray-400" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {isDialing ? "All contacts have been dialed" : "Select a list and start dialing"}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {remainingContacts.slice(0, 50).map((contact, idx) => (
                      <div 
                        key={contact.id} 
                        className={cn(
                          "px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors",
                          idx === 0 && isDialing && "bg-blue-50 dark:bg-blue-950/30"
                        )}
                        data-testid={`queue-contact-${contact.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                            idx === 0 && isDialing 
                              ? "bg-blue-500 text-white" 
                              : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                          )}>
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate text-gray-900 dark:text-white">
                              {contact.name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {contact.phone}
                            </p>
                          </div>
                          {idx === 0 && isDialing && (
                            <Badge className="bg-blue-500 text-white text-xs">Next</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                    {remainingContacts.length > 50 && (
                      <div className="px-4 py-3 text-center text-sm text-muted-foreground">
                        +{remainingContacts.length - 50} more contacts
                      </div>
                    )}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Active Lines Panel */}
          <Card className="lg:col-span-6 rounded-[16px] border border-gray-200 dark:border-gray-800 shadow-[0_4px_14px_rgba(0,0,0,0.06)]">
            <CardHeader className="pb-3 px-4 pt-4 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2 font-bold text-gray-900 dark:text-white">
                  <div className="p-2 rounded-[12px] bg-gradient-to-br from-teal-100 to-teal-50 dark:from-teal-900/30 dark:to-teal-800/20">
                    <Phone className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  </div>
                  Active Lines
                </CardTitle>
                <div className="flex items-center gap-2">
                  {isDialing && (
                    <Badge className={cn(
                      "text-xs",
                      isPaused 
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400" 
                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400"
                    )}>
                      {isPaused ? 'Paused' : 'Active'}
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <TooltipProvider>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {callLines.map((line, index) => {
                    const config = getStatusConfig(line.status);
                    return (
                      <Card
                        key={line.id}
                        className={cn(
                          "border-2 transition-all duration-300",
                          config.border,
                          config.bg
                        )}
                        data-testid={`call-line-${index}`}
                      >
                        <CardContent className="p-3">
                          {/* Line Header */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {config.icon}
                              <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                                Line {index + 1}
                              </span>
                            </div>
                            <Badge variant="outline" className="text-[10px] font-medium px-2 py-0.5">
                              {config.label}
                            </Badge>
                          </div>

                          {/* Contact Info */}
                          {line.status !== 'idle' ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="space-y-1 cursor-help">
                                  <p className="text-sm font-semibold truncate text-gray-900 dark:text-white">
                                    {line.name || 'Unknown'}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {line.phone}
                                  </p>
                                  {line.company && (
                                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                                      <Building2 className="w-3 h-3" />
                                      {line.company}
                                    </p>
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <div className="space-y-1">
                                  <div className="font-semibold border-b pb-1 mb-1">Contact Details</div>
                                  {line.name && <div className="text-xs"><span className="text-muted-foreground">Name:</span> {line.name}</div>}
                                  {line.phone && <div className="text-xs"><span className="text-muted-foreground">Phone:</span> {line.phone}</div>}
                                  {line.email && <div className="text-xs"><span className="text-muted-foreground">Email:</span> {line.email}</div>}
                                  {line.jobTitle && <div className="text-xs"><span className="text-muted-foreground">Title:</span> {line.jobTitle}</div>}
                                  {line.company && <div className="text-xs"><span className="text-muted-foreground">Company:</span> {line.company}</div>}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <div className="py-4 text-center">
                              <p className="text-xs text-muted-foreground">Waiting for call...</p>
                            </div>
                          )}

                          {/* Duration & Progress */}
                          {line.duration > 0 && (
                            <div className="flex items-center justify-between mt-2 pt-2 border-t">
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Timer className="w-3 h-3" />
                                Duration
                              </span>
                              <span className="text-sm font-mono font-bold text-gray-900 dark:text-white">
                                {formatDuration(line.duration)}
                              </span>
                            </div>
                          )}

                          {/* Progress Indicator */}
                          {(line.status === 'ringing' || line.status === 'dialing') && (
                            <Progress value={line.status === 'ringing' ? 60 : 30} className="mt-2 h-1" />
                          )}
                          {(line.status === 'connected' || line.status === 'in-progress' || line.status === 'human-detected') && (
                            <Progress value={100} className="mt-2 h-1 bg-emerald-200 dark:bg-emerald-900" />
                          )}

                          {/* Disconnect Button */}
                          {line.status !== 'idle' && line.status !== 'completed' && line.status !== 'failed' && line.callSid && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => disconnectCall(line.callSid!, line.id)}
                              className="w-full mt-2 h-7 text-xs border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:hover:bg-red-950"
                              data-testid={`button-disconnect-${line.id}`}
                            >
                              <PhoneOff className="w-3 h-3 mr-1" />
                              End Call
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </TooltipProvider>
            </CardContent>
          </Card>

          {/* Completed Panel */}
          <Card className="lg:col-span-3 rounded-[16px] border border-gray-200 dark:border-gray-800 shadow-[0_4px_14px_rgba(0,0,0,0.06)]">
            <CardHeader className="pb-3 px-4 pt-4 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2 font-bold text-gray-900 dark:text-white">
                  <div className="p-2 rounded-[12px] bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-900/30 dark:to-emerald-800/20">
                    <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  Completed
                </CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {stats.totalDialed} total
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[400px]">
                {dialedContacts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                    <div className="p-3 rounded-full bg-gray-100 dark:bg-gray-800 mb-3">
                      <Phone className="h-6 w-6 text-gray-400" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Dialed contacts will appear here
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {dialedContacts.slice(-50).reverse().map((item, idx) => {
                      const statusColors: Record<string, string> = {
                        connected: "bg-emerald-500",
                        voicemail: "bg-amber-500",
                        'no-answer': "bg-gray-400",
                        busy: "bg-yellow-500",
                        failed: "bg-red-500"
                      };
                      return (
                        <div 
                          key={`${item.contact.id}-${idx}`} 
                          className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-2 h-2 rounded-full flex-shrink-0",
                              statusColors[item.status] || "bg-gray-400"
                            )} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate text-gray-900 dark:text-white">
                                {item.contact.name}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {item.status} • {formatDuration(item.duration)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <Card className="rounded-[16px] border border-gray-200 dark:border-gray-800 shadow-[0_4px_14px_rgba(0,0,0,0.06)]">
            <CardContent className="p-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-[12px] bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/30 dark:to-blue-800/20">
                  <Phone className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Total Dialed</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.totalDialed}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[16px] border border-gray-200 dark:border-gray-800 shadow-[0_4px_14px_rgba(0,0,0,0.06)]">
            <CardContent className="p-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-[12px] bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-900/30 dark:to-emerald-800/20">
                  <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Connected</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.connected}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[16px] border border-gray-200 dark:border-gray-800 shadow-[0_4px_14px_rgba(0,0,0,0.06)]">
            <CardContent className="p-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-[12px] bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-900/30 dark:to-amber-800/20">
                  <Volume2 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Voicemails</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.voicemails}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[16px] border border-gray-200 dark:border-gray-800 shadow-[0_4px_14px_rgba(0,0,0,0.06)]">
            <CardContent className="p-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-[12px] bg-gradient-to-br from-red-100 to-red-50 dark:from-red-900/30 dark:to-red-800/20">
                  <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Failed</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.failed}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[16px] border border-gray-200 dark:border-gray-800 shadow-[0_4px_14px_rgba(0,0,0,0.06)]">
            <CardContent className="p-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-[12px] bg-gradient-to-br from-teal-100 to-teal-50 dark:from-teal-900/30 dark:to-teal-800/20">
                  <BarChart3 className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Connect Rate</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{connectRate}%</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[16px] border border-gray-200 dark:border-gray-800 shadow-[0_4px_14px_rgba(0,0,0,0.06)]">
            <CardContent className="p-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-[12px] bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-900/30 dark:to-purple-800/20">
                  <Timer className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Avg Connect</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.avgConnectTime}s</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Performance Insights - Only shown during active session */}
        {sessionStartTime && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="rounded-[16px] border border-gray-200 dark:border-gray-800 shadow-[0_4px_14px_rgba(0,0,0,0.06)]">
              <CardHeader className="pb-3 px-4 pt-4">
                <CardTitle className="text-base flex items-center gap-2 font-bold text-gray-900 dark:text-white">
                  <div className="p-2 rounded-[12px] bg-gradient-to-br from-teal-100 to-teal-50 dark:from-teal-900/30 dark:to-teal-800/20">
                    <BarChart3 className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  </div>
                  Performance Metrics
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-[12px] border bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {(() => {
                        const sessionDurationHours = (Date.now() - sessionStartTime) / (1000 * 60 * 60);
                        return sessionDurationHours > 0 ? Math.round(stats.connected / sessionDurationHours) : 0;
                      })()}
                    </div>
                    <div className="text-xs text-muted-foreground font-medium">Connects/Hour</div>
                  </div>
                  <div className="p-3 rounded-[12px] border bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800">
                    <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                      {firstConnectTime ? `${Math.round((firstConnectTime - sessionStartTime) / 1000)}s` : '-'}
                    </div>
                    <div className="text-xs text-muted-foreground font-medium">First Connect</div>
                  </div>
                  <div className="p-3 rounded-[12px] border bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800">
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      {stats.connected > 0 ? `${Math.round(stats.talkTime / stats.connected)}s` : '0s'}
                    </div>
                    <div className="text-xs text-muted-foreground font-medium">Avg Talk Time</div>
                  </div>
                  <div className="p-3 rounded-[12px] border bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                    <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                      {(() => {
                        const sessionDurationMins = (Date.now() - sessionStartTime) / (1000 * 60);
                        return sessionDurationMins > 0 ? (stats.totalDialed / sessionDurationMins).toFixed(1) : '0';
                      })()}
                    </div>
                    <div className="text-xs text-muted-foreground font-medium">Dials/Minute</div>
                  </div>
                </div>

                {/* Performance Insights */}
                {stats.totalDialed >= 10 && (
                  <div className="mt-3 space-y-2">
                    {stats.connected / stats.totalDialed < 0.15 && (
                      <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-[12px] border border-amber-200 dark:border-amber-800">
                        <AlertCircle className="w-4 h-4 mt-0.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          Low connect rate. Consider adjusting call times or list quality.
                        </p>
                      </div>
                    )}
                    {stats.connected / stats.totalDialed >= 0.25 && (
                      <div className="flex items-start gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-[12px] border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle className="w-4 h-4 mt-0.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                        <p className="text-xs text-emerald-700 dark:text-emerald-300">
                          Excellent connect rate! Keep up the momentum.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-[16px] border border-gray-200 dark:border-gray-800 shadow-[0_4px_14px_rgba(0,0,0,0.06)]">
              <CardHeader className="pb-3 px-4 pt-4">
                <CardTitle className="text-base flex items-center gap-2 font-bold text-gray-900 dark:text-white">
                  <div className="p-2 rounded-[12px] bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-900/30 dark:to-purple-800/20">
                    <Zap className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  Quick Tips
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                <div className="flex items-start gap-3 p-3 rounded-[12px] border bg-blue-50/50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900">
                  <Phone className="w-4 h-4 mt-0.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Simultaneous Dialing</p>
                    <p className="text-xs text-muted-foreground">
                      Dials {parallelLines} contacts at the same time for maximum efficiency
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-[12px] border bg-purple-50/50 dark:bg-purple-950/20 border-purple-100 dark:border-purple-900">
                  <Mic className="w-4 h-4 mt-0.5 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Smart Detection</p>
                    <p className="text-xs text-muted-foreground">
                      AMD automatically detects and skips voicemails
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-[12px] border bg-teal-50/50 dark:bg-teal-950/20 border-teal-100 dark:border-teal-900">
                  <BarChart3 className="w-4 h-4 mt-0.5 text-teal-600 dark:text-teal-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Productivity Boost</p>
                    <p className="text-xs text-muted-foreground">
                      Up to {parallelLines}x more efficient than manual dialing
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
