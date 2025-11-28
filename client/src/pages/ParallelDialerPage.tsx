import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  Phone, PhoneCall, PhoneOff, Play, Pause, SkipForward, Settings,
  Activity, TrendingUp, Clock, CheckCircle, XCircle, Users,
  Zap, Target, BarChart3, Mic, MicOff, AlertCircle, Info, Mail, Building2, Briefcase,
  Radio, Sparkles, ChevronDown, ChevronUp, Save, Volume2, Timer
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

export default function ParallelDialerPage() {
  const [isDialing, setIsDialing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [parallelLines, setParallelLines] = useState(3);
  const [callsPerSecond, setCallsPerSecond] = useState(3);
  const [callLines, setCallLines] = useState<ParallelCallLine[]>([]);
  const [queuedContacts, setQueuedContacts] = useState<Contact[]>([]);
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
  
  // Refs
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
  
  // Debug: Log isReady state changes
  useEffect(() => {
    console.log('[ParallelDialerPage] Device state:', { isReady, deviceStatus, twilioError });
  }, [isReady, deviceStatus, twilioError]);
  
  // Keep refs in sync
  useEffect(() => { isDialingRef.current = isDialing; }, [isDialing]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { autoSkipVoicemailRef.current = autoSkipVoicemail; }, [autoSkipVoicemail]);
  useEffect(() => { toastRef.current = toast; }, [toast]);

  // Cleanup
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

  // Agent status updates
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

  // Placeholder functions - implement as needed
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
    setIsPaused(false);
    setSessionStartTime(Date.now());
    setQueuedContacts(filteredContacts);
    setCurrentContactIndex(0);
    dialedPhonesRef.current.clear();
    statsRecordedLinesRef.current.clear();
    
    toast({
      title: "Dialing started",
      description: `Starting parallel dialer with ${parallelLines} lines`,
    });
  };

  const stopDialing = () => {
    setIsDialing(false);
    setIsPaused(false);
    lineResetTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
    lineResetTimeoutsRef.current.clear();
    
    toast({
      title: "Dialing stopped",
      description: "All active calls will complete",
    });
  };

  const togglePause = () => {
    setIsPaused(!isPaused);
    toast({
      title: isPaused ? "Resumed" : "Paused",
      description: isPaused ? "Dialing resumed" : "Dialing paused",
    });
  };

  const skipToNext = () => {
    setCurrentContactIndex(prev => prev + 1);
  };

  const disconnectCall = (callSid: string, lineId: string) => {
    // Implement disconnect logic
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      idle: 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800',
      dialing: 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800',
      ringing: 'bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800',
      'human-detected': 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800',
      connected: 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800',
      'in-progress': 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800',
      'machine-detected': 'bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800',
      voicemail: 'bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800',
      failed: 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800',
      busy: 'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800',
      'no-answer': 'bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700',
      completed: 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800',
    };
    return colors[status] || colors.idle;
  };

  const getStatusIcon = (status: string) => {
    const iconClass = "w-5 h-5 flex-shrink-0";
    const icons: Record<string, JSX.Element> = {
      idle: <Radio className={cn(iconClass, "text-gray-400")} />,
      dialing: <Phone className={cn(iconClass, "text-blue-500 animate-pulse")} />,
      ringing: <PhoneCall className={cn(iconClass, "text-purple-500 animate-bounce")} />,
      'human-detected': <CheckCircle className={cn(iconClass, "text-green-500")} />,
      connected: <PhoneCall className={cn(iconClass, "text-green-500")} />,
      'in-progress': <PhoneCall className={cn(iconClass, "text-green-500")} />,
      'machine-detected': <Mic className={cn(iconClass, "text-orange-500")} />,
      voicemail: <MicOff className={cn(iconClass, "text-orange-500")} />,
      failed: <XCircle className={cn(iconClass, "text-red-500")} />,
      busy: <PhoneOff className={cn(iconClass, "text-yellow-500")} />,
      'no-answer': <PhoneOff className={cn(iconClass, "text-gray-500")} />,
      completed: <CheckCircle className={cn(iconClass, "text-blue-500")} />,
    };
    return icons[status] || icons.idle;
  };

  if (!isReady) {
    return <ParallelDialerSkeleton />;
  }

  return (
    <div className="min-h-full w-full bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-7xl">
        {/* Modern Header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 p-8 text-white shadow-2xl">
          <div className="absolute inset-0 bg-black/10" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3">
                  <Sparkles className="w-8 h-8" />
                  Parallel Dialer
                </h1>
                <p className="text-blue-100 text-sm md:text-base">
                  AI-powered multi-line outbound calling system
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-white/20 text-white border-white/30 backdrop-blur-sm px-4 py-2 text-sm">
                  <Radio className="w-4 h-4 mr-2 animate-pulse" />
                  {isReady ? 'Ready' : 'Connecting...'}
                </Badge>
              </div>
            </div>

            {/* Control Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* List Selection */}
              <div className="space-y-2">
                <Label className="text-white/90 text-xs font-medium uppercase tracking-wide">
                  Contact List
                </Label>
                <Select
                  value={selectedListId || "all"}
                  onValueChange={(value) => setSelectedListId(value === "all" ? "" : value)}
                  disabled={isDialing}
                >
                  <SelectTrigger 
                    className="bg-white/10 border-white/20 text-white backdrop-blur-sm hover:bg-white/20 transition-all"
                    data-testid="select-contact-list"
                  >
                    <SelectValue placeholder="Select a list..." />
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
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-white/90 text-xs font-medium uppercase tracking-wide">
                    Parallel Lines
                  </Label>
                  <span className="text-white font-bold text-lg">{parallelLines}</span>
                </div>
                <Slider
                  min={1}
                  max={10}
                  step={1}
                  value={[parallelLines]}
                  onValueChange={(value) => setParallelLines(value[0])}
                  disabled={isDialing}
                  className="bg-white/20"
                  data-testid="slider-parallel-lines"
                />
              </div>

              {/* Actions */}
              <div className="flex items-end gap-2">
                {!isDialing ? (
                  <Button
                    onClick={startDialing}
                    disabled={!isReady || filteredContacts.length === 0}
                    className="flex-1 bg-white text-blue-600 hover:bg-white/90 font-semibold shadow-lg h-12"
                    data-testid="button-start-dialing"
                  >
                    <Play className="w-5 h-5 mr-2" />
                    Start Dialing
                  </Button>
                ) : (
                  <>
                    <Button
                      onClick={togglePause}
                      variant="secondary"
                      className="flex-1 bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm border border-white/20 h-12"
                      data-testid="button-pause-resume"
                    >
                      {isPaused ? (
                        <>
                          <Play className="w-5 h-5 mr-2" />
                          Resume
                        </>
                      ) : (
                        <>
                          <Pause className="w-5 h-5 mr-2" />
                          Pause
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={stopDialing}
                      variant="destructive"
                      className="flex-1 bg-red-500 hover:bg-red-600 h-12"
                      data-testid="button-stop-dialing"
                    >
                      <PhoneOff className="w-5 h-5 mr-2" />
                      Stop
                    </Button>
                  </>
                )}
                <Button
                  onClick={() => setShowSettings(!showSettings)}
                  variant="secondary"
                  className="bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm border border-white/20 h-12 px-4"
                  data-testid="button-settings"
                >
                  <Settings className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Dashboard */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-none shadow-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <Phone className="w-8 h-8 opacity-80" />
                <Badge className="bg-white/20 text-white border-none">Total</Badge>
              </div>
              <div className="text-4xl font-bold mb-1">{stats.totalDialed}</div>
              <p className="text-sm text-blue-100">Calls Dialed</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-green-500 to-green-600 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <CheckCircle className="w-8 h-8 opacity-80" />
                <Badge className="bg-white/20 text-white border-none">
                  {stats.totalDialed > 0 ? Math.round((stats.connected / stats.totalDialed) * 100) : 0}%
                </Badge>
              </div>
              <div className="text-4xl font-bold mb-1">{stats.connected}</div>
              <p className="text-sm text-green-100">Connected</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-orange-500 to-orange-600 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <Volume2 className="w-8 h-8 opacity-80" />
                <Badge className="bg-white/20 text-white border-none">VM</Badge>
              </div>
              <div className="text-4xl font-bold mb-1">{stats.voicemails}</div>
              <p className="text-sm text-orange-100">Voicemails</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-purple-500 to-purple-600 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <Timer className="w-8 h-8 opacity-80" />
                <Badge className="bg-white/20 text-white border-none">Avg</Badge>
              </div>
              <div className="text-4xl font-bold mb-1">{stats.avgConnectTime}s</div>
              <p className="text-sm text-purple-100">Connect Time</p>
            </CardContent>
          </Card>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <Card className="border-none shadow-xl">
            <CardHeader className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Settings className="w-6 h-6" />
                  Advanced Settings
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSettings(false)}
                >
                  <ChevronUp className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* AMD Settings */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 border">
                    <div className="flex items-center gap-3">
                      <Mic className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      <div>
                        <Label className="font-semibold">Answering Machine Detection</Label>
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

                  {amdEnabled && (
                    <div className="pl-4 space-y-3 border-l-2 border-blue-200 dark:border-blue-800">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Timeout</Label>
                          <span className="text-sm font-bold">{amdTimeout}s</span>
                        </div>
                        <Slider
                          min={5}
                          max={60}
                          step={5}
                          value={[amdTimeout]}
                          onValueChange={(value) => setAmdTimeout(value[0])}
                          disabled={isDialing}
                          data-testid="slider-amd-timeout"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm">Sensitivity</Label>
                        <Select
                          value={amdSensitivity}
                          onValueChange={(value: 'standard' | 'high' | 'low') => setAmdSensitivity(value)}
                          disabled={isDialing}
                        >
                          <SelectTrigger data-testid="select-amd-sensitivity">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="standard">Standard</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Other Settings */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 border">
                    <div className="flex items-center gap-3">
                      <SkipForward className="w-5 h-5 text-green-600 dark:text-green-400" />
                      <div>
                        <Label className="font-semibold">Auto-Skip Voicemail</Label>
                        <p className="text-xs text-muted-foreground">Skip to next on VM</p>
                      </div>
                    </div>
                    <Switch
                      checked={autoSkipVoicemail}
                      onCheckedChange={setAutoSkipVoicemail}
                      disabled={isDialing}
                      data-testid="switch-auto-skip-voicemail"
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950 dark:to-pink-950 border">
                    <div className="flex items-center gap-3">
                      <Zap className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                      <div>
                        <Label className="font-semibold">Aggressive Mode (2x)</Label>
                        <p className="text-xs text-muted-foreground">Dial double contacts</p>
                      </div>
                    </div>
                    <Switch
                      checked={aggressiveDialing}
                      onCheckedChange={setAggressiveDialing}
                      disabled={isDialing}
                      data-testid="switch-aggressive-dialing"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Pre-recorded Greeting URL</Label>
                    <div className="flex gap-2">
                      <Input
                        value={greetingUrl}
                        onChange={(e) => setGreetingUrl(e.target.value)}
                        placeholder="https://your-cdn.com/greeting.mp3"
                        className="flex-1"
                        data-testid="input-greeting-url"
                      />
                      <Button
                        onClick={() => saveGreetingMutation.mutate(greetingUrl)}
                        disabled={saveGreetingMutation.isPending}
                        size="sm"
                        data-testid="button-save-greeting"
                      >
                        <Save className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Plays before connecting to agent. Leave empty to skip.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Active Call Lines */}
        <Card className="border-none shadow-xl">
          <CardHeader className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Activity className="w-6 h-6" />
                Active Lines
              </CardTitle>
              <Badge variant="secondary" className="text-sm px-3 py-1">
                {currentContactIndex}/{queuedContacts.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <TooltipProvider>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {callLines.map((line, index) => (
                  <Card
                    key={line.id}
                    className={cn(
                      "border-2 transition-all duration-300 hover:shadow-lg",
                      getStatusColor(line.status)
                    )}
                    data-testid={`call-line-${index}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(line.status)}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm">Line {index + 1}</span>
                              {line.isAnsweringMachine && (
                                <Badge variant="outline" className="text-xs bg-orange-100 dark:bg-orange-900">
                                  VM
                                </Badge>
                              )}
                            </div>
                            <Badge variant="outline" className="text-xs mt-1">
                              {line.status}
                            </Badge>
                          </div>
                        </div>
                        {line.duration > 0 && (
                          <span className="text-sm font-mono font-bold">
                            {formatDuration(line.duration)}
                          </span>
                        )}
                      </div>

                      {line.status !== 'idle' && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="space-y-1.5 cursor-help">
                              <div className="flex items-center gap-2">
                                <Users className="w-4 h-4 text-muted-foreground" />
                                <p className="font-semibold text-sm truncate">{line.name || 'Unknown'}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Phone className="w-4 h-4 text-muted-foreground" />
                                <p className="text-xs text-muted-foreground truncate">{line.phone}</p>
                              </div>
                              {line.company && (
                                <div className="flex items-center gap-2">
                                  <Building2 className="w-4 h-4 text-muted-foreground" />
                                  <p className="text-xs text-muted-foreground truncate">{line.company}</p>
                                </div>
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <div className="space-y-2">
                              <div className="font-semibold border-b pb-1 mb-2">Contact Details</div>
                              {line.name && <div><span className="text-muted-foreground text-xs">Name:</span> <span className="font-medium">{line.name}</span></div>}
                              {line.phone && <div><span className="text-muted-foreground text-xs">Phone:</span> <span className="font-medium">{line.phone}</span></div>}
                              {line.email && <div><span className="text-muted-foreground text-xs">Email:</span> <span className="font-medium break-all">{line.email}</span></div>}
                              {line.jobTitle && <div><span className="text-muted-foreground text-xs">Title:</span> <span className="font-medium">{line.jobTitle}</span></div>}
                              {line.company && <div><span className="text-muted-foreground text-xs">Company:</span> <span className="font-medium">{line.company}</span></div>}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      )}

                      {line.status === 'ringing' && (
                        <Progress value={33} className="mt-3 h-1.5" />
                      )}
                      {(line.status === 'connected' || line.status === 'in-progress') && (
                        <Progress value={100} className="mt-3 h-1.5 bg-green-200 dark:bg-green-900" />
                      )}

                      {line.status !== 'idle' && line.status !== 'completed' && line.status !== 'failed' && line.callSid && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => disconnectCall(line.callSid!, line.id)}
                          className="w-full mt-3"
                          data-testid={`button-disconnect-${line.id}`}
                        >
                          <PhoneOff className="w-4 h-4 mr-2" />
                          Disconnect
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TooltipProvider>
          </CardContent>
        </Card>

        {/* Performance Insights */}
        {sessionStartTime && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-none shadow-xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  Performance Metrics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border-2 border-blue-200 dark:border-blue-800">
                    <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-1">
                      {(() => {
                        const sessionDurationHours = (Date.now() - sessionStartTime) / (1000 * 60 * 60);
                        return sessionDurationHours > 0 ? Math.round(stats.connected / sessionDurationHours) : 0;
                      })()}
                    </div>
                    <div className="text-xs text-muted-foreground font-medium uppercase">Connects/Hour</div>
                  </div>
                  <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border-2 border-purple-200 dark:border-purple-800">
                    <div className="text-3xl font-bold text-purple-600 dark:text-purple-400 mb-1">
                      {firstConnectTime ? `${Math.round((firstConnectTime - sessionStartTime) / 1000)}s` : '-'}
                    </div>
                    <div className="text-xs text-muted-foreground font-medium uppercase">First Connect</div>
                  </div>
                  <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border-2 border-green-200 dark:border-green-800">
                    <div className="text-3xl font-bold text-green-600 dark:text-green-400 mb-1">
                      {stats.connected > 0 ? `${Math.round(stats.talkTime / stats.connected)}s` : '0s'}
                    </div>
                    <div className="text-xs text-muted-foreground font-medium uppercase">Avg Talk Time</div>
                  </div>
                  <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border-2 border-orange-200 dark:border-orange-800">
                    <div className="text-3xl font-bold text-orange-600 dark:text-orange-400 mb-1">
                      {(() => {
                        const sessionDurationMins = (Date.now() - sessionStartTime) / (1000 * 60);
                        return sessionDurationMins > 0 ? (stats.totalDialed / sessionDurationMins).toFixed(1) : '0';
                      })()}
                    </div>
                    <div className="text-xs text-muted-foreground font-medium uppercase">Dials/Minute</div>
                  </div>
                </div>

                {/* Insights */}
                {stats.totalDialed >= 10 && (
                  <div className="mt-4 space-y-2">
                    {stats.connected / stats.totalDialed < 0.15 && (
                      <div className="flex items-start gap-2 p-3 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
                        <AlertCircle className="w-4 h-4 mt-0.5 text-yellow-600 dark:text-yellow-400" />
                        <p className="text-sm text-yellow-700 dark:text-yellow-300">
                          Low connect rate. Consider adjusting call times or list quality.
                        </p>
                      </div>
                    )}
                    {stats.connected / stats.totalDialed >= 0.25 && (
                      <div className="flex items-start gap-2 p-3 bg-green-100 dark:bg-green-900 rounded-lg">
                        <CheckCircle className="w-4 h-4 mt-0.5 text-green-600 dark:text-green-400" />
                        <p className="text-sm text-green-700 dark:text-green-300">
                          Excellent connect rate! Keep up the momentum.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tips */}
            <Card className="border-none shadow-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  Quick Tips
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                    <Target className="w-5 h-5 mt-0.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-sm mb-1">Simultaneous Dialing</p>
                      <p className="text-xs text-muted-foreground">
                        Dials {parallelLines} contacts at the same time for maximum efficiency
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 bg-purple-50 dark:bg-purple-950 rounded-lg">
                    <Zap className="w-5 h-5 mt-0.5 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-sm mb-1">Smart Detection</p>
                      <p className="text-xs text-muted-foreground">
                        AMD automatically detects and skips voicemails
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                    <TrendingUp className="w-5 h-5 mt-0.5 text-green-600 dark:text-green-400 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-sm mb-1">Productivity Boost</p>
                      <p className="text-xs text-muted-foreground">
                        Up to {parallelLines}x more efficient than manual dialing
                      </p>
                    </div>
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
