import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, isWithinInterval, formatDistanceToNow } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { 
  Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, PhoneCall, PhoneOff,
  Clock, Star, Search, Download, FileText, AlertCircle, CheckCircle,
  RefreshCw, ChevronDown, ChevronUp, Copy, ExternalLink, PlayCircle,
  Calendar, UserPlus, MessageSquare, TrendingUp, TrendingDown, Minus,
  FileAudio, Play, Trash2, Eye, Activity, XCircle, Voicemail as VoicemailIcon,
  Filter, Users, PhoneForwarded, Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CallLogPageSkeleton } from '@/components/skeletons/CallLogPageSkeleton';
import { AdvancedFilters } from '@/components/filters/AdvancedFilters';
import { InlineAudioPlayer } from '@/components/InlineAudioPlayer';
import { useWebSocket } from '@/hooks/useWebSocket';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { Call, Recording } from '@shared/schema';

interface CallLogStats {
  totalCalls: number;
  completedCalls: number;
  missedCalls: number;
  totalDuration: number;
  averageDuration: number;
  totalCost: number;
  inboundCalls: number;
  outboundCalls: number;
  callSuccessRate: number;
  averageCallQuality: number;
}

interface CallStatusGroups {
  queued: Call[];
  initiated: Call[];
  ringing: Call[];
  inProgress: Call[];
  completed: Call[];
  busy: Call[];
  failed: Call[];
  noAnswer: Call[];
  voicemail: Call[];
  dropped: Call[];
  canceled: Call[];
}

interface CallSummary {
  totalCalls: number;
  active: number;
  connected: number;
  completed: number;
  failed: number;
  voicemail: number;
  dropped: number;
}

interface CallStatusData {
  grouped: CallStatusGroups;
  summary: CallSummary;
}

interface CallLogFilters {
  search: string;
  status: string;
  type: string;
  dateRange?: DateRange;
  disposition?: string;
  quickFilter: 'all' | 'active' | 'completed' | 'failed';
}

interface CallWithRecordings extends Call {
  recordings?: Recording[];
  agentName?: string | null;
  contactName?: string | null;
}

const getCallIcon = (type: string, status: string) => {
  if (status === 'in-progress' || status === 'ringing') {
    return PhoneCall;
  }
  if (type === 'incoming' || type === 'inbound') {
    return status === 'completed' ? PhoneIncoming : PhoneMissed;
  } else if (type === 'outgoing' || type === 'outbound') {
    return status === 'completed' ? PhoneOutgoing : PhoneMissed;
  }
  return Phone;
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    case 'in-progress': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
    case 'ringing': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
    case 'queued': 
    case 'initiated': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
    case 'missed':
    case 'no-answer': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
    case 'busy':
    case 'failed': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
    case 'voicemail': return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300';
    case 'cancelled': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  }
};

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const formatCost = (cost: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4
  }).format(cost);
};

const formatPhoneNumber = (phone: string) => {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    const areaCode = cleaned.substring(1, 4);
    const prefix = cleaned.substring(4, 7);
    const lineNumber = cleaned.substring(7);
    return `+1 (${areaCode}) ${prefix}-${lineNumber}`;
  }
  return phone;
};

export default function CallLogPage() {
  const [selectedCall, setSelectedCall] = useState<CallWithRecordings | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<CallLogFilters>({
    search: '',
    status: 'all',
    type: 'all',
    dateRange: undefined,
    disposition: 'all',
    quickFilter: 'all',
  });
  const [expandedCallId, setExpandedCallId] = useState<number | null>(null);
  const [playingRecording, setPlayingRecording] = useState<{ recording: Recording; audioUrl: string } | null>(null);
  const [liveTimers, setLiveTimers] = useState<Record<number, number>>({});
  const { isConnected } = useWebSocket();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch call logs
  const { data: calls = [], isLoading: callsLoading, refetch: refetchCalls } = useQuery<CallWithRecordings[]>({
    queryKey: ['/api/calls'],
  });

  // Fetch call status for live updates
  const { data: statusData, refetch: refetchStatus } = useQuery<CallStatusData>({
    queryKey: ['/api/calls/by-status'],
    refetchInterval: 3000
  });

  // Fetch stats
  const { data: stats, isLoading: statsLoading } = useQuery<CallLogStats>({
    queryKey: ['/api/calls/stats'],
  });

  // Fetch recordings
  const { data: allRecordings = [] } = useQuery<Recording[]>({
    queryKey: ['/api/recordings?limit=1000'],
    select: (data: any) => data?.recordings || [],
  });

  // Live timer effect for active calls
  useEffect(() => {
    const activeCalls = calls.filter(call => 
      call.status === 'in-progress' || call.status === 'ringing'
    );

    if (activeCalls.length === 0) return;

    const interval = setInterval(() => {
      setLiveTimers(prev => {
        const newTimers = { ...prev };
        activeCalls.forEach(call => {
          newTimers[call.id] = (newTimers[call.id] || call.duration || 0) + 1;
        });
        return newTimers;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [calls]);

  // WebSocket event listeners for live updates
  useEffect(() => {
    const handleCallUpdate = () => {
      refetchCalls();
      refetchStatus();
    };

    window.addEventListener('call_update', handleCallUpdate);
    window.addEventListener('new_call', handleCallUpdate);
    window.addEventListener('parallel_call_status', handleCallUpdate);
    window.addEventListener('parallel_call_connected', handleCallUpdate);
    window.addEventListener('parallel_call_ended', handleCallUpdate);

    return () => {
      window.removeEventListener('call_update', handleCallUpdate);
      window.removeEventListener('new_call', handleCallUpdate);
      window.removeEventListener('parallel_call_status', handleCallUpdate);
      window.removeEventListener('parallel_call_connected', handleCallUpdate);
      window.removeEventListener('parallel_call_ended', handleCallUpdate);
    };
  }, [refetchCalls, refetchStatus]);

  useEffect(() => {
    return () => {
      if (playingRecording?.audioUrl) {
        URL.revokeObjectURL(playingRecording.audioUrl);
      }
    };
  }, [playingRecording]);

  const deleteRecordingMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/recordings/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recordings?limit=1000"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calls"] });
      toast({
        title: "Recording deleted",
        description: "Recording has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete recording",
        variant: "destructive",
      });
    },
  });

  // Merge recordings with calls
  const callsWithRecordings = calls.map(call => ({
    ...call,
    recordings: allRecordings.filter((rec: Recording) => rec.callId === call.id)
  }));

  // Apply filters
  const filteredCalls = callsWithRecordings.filter(call => {
    // Quick filter
    if (filters.quickFilter === 'active') {
      if (!['queued', 'initiated', 'ringing', 'in-progress'].includes(call.status)) return false;
    } else if (filters.quickFilter === 'completed') {
      if (call.status !== 'completed') return false;
    } else if (filters.quickFilter === 'failed') {
      if (!['failed', 'busy', 'no-answer', 'missed', 'voicemail', 'dropped'].includes(call.status)) return false;
    }

    const matchesSearch = !filters.search || 
      call.phone.includes(filters.search) || 
      call.location?.toLowerCase().includes(filters.search.toLowerCase()) ||
      call.summary?.toLowerCase().includes(filters.search.toLowerCase());
    const matchesStatus = !filters.status || filters.status === 'all' || call.status === filters.status;
    const matchesType = !filters.type || filters.type === 'all' || call.type === filters.type;
    const matchesDisposition = !filters.disposition || filters.disposition === 'all' || call.disposition === filters.disposition;
    
    const matchesDateRange = !filters.dateRange?.from || (
      call.createdAt && isWithinInterval(new Date(call.createdAt), {
        start: filters.dateRange.from,
        end: filters.dateRange.to || filters.dateRange.from,
      })
    );
    
    return matchesSearch && matchesStatus && matchesType && matchesDisposition && matchesDateRange;
  });

  // Calculate quick stats from status data
  const { grouped = {} as CallStatusGroups, summary = {} as CallSummary } = statusData || {};
  const activeCalls = [
    ...(grouped.queued || []),
    ...(grouped.initiated || []),
    ...(grouped.ringing || []),
    ...(grouped.inProgress || [])
  ];

  const handlePlay = async (recording: Recording) => {
    try {
      if (playingRecording?.audioUrl) {
        URL.revokeObjectURL(playingRecording.audioUrl);
      }
      const response = await apiRequest("GET", `/api/recordings/${recording.id}/play`);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      setPlayingRecording({ recording, audioUrl: blobUrl });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to play recording",
        variant: "destructive",
      });
    }
  };

  const handleClosePlayer = () => {
    if (playingRecording?.audioUrl) {
      URL.revokeObjectURL(playingRecording.audioUrl);
    }
    setPlayingRecording(null);
  };

  const handleDownload = async (recording: Recording) => {
    try {
      const response = await apiRequest("GET", `/api/recordings/${recording.id}/download`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `recording_${recording.twilioRecordingSid}_${recording.phone}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to download recording",
        variant: "destructive",
      });
    }
  };

  const handleDeleteRecording = (recording: Recording) => {
    if (window.confirm("Are you sure you want to delete this recording?")) {
      deleteRecordingMutation.mutate(recording.id);
    }
  };

  const formatRecordingDuration = (duration: number) => {
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const seconds = duration % 60;
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const toggleCallExpanded = (callId: number) => {
    setExpandedCallId(expandedCallId === callId ? null : callId);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: `${label} copied to clipboard`,
    });
  };

  if (callsLoading || statsLoading) {
    return <CallLogPageSkeleton />;
  }

  return (
    <div className="space-y-4 p-6">
      {/* Header with live status badge */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Call Logs</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Real-time call monitoring and historical logs
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isConnected && (
            <Badge variant="outline" className="gap-2">
              <Activity className="w-3 h-3 animate-pulse text-green-500" />
              Live Updates
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => { refetchCalls(); refetchStatus(); }} data-testid="button-refresh">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Quick Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Card className="p-3" data-testid="card-total-calls">
          <div className="flex items-center gap-2 mb-1">
            <Phone className="w-4 h-4 text-gray-500" />
            <div className="text-xs text-gray-600 dark:text-gray-400">Total</div>
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats?.totalCalls || 0}</div>
        </Card>
        
        <Card className="p-3 border-blue-200 dark:border-blue-800" data-testid="card-active-calls">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-blue-500" />
            <div className="text-xs text-gray-600 dark:text-gray-400">Active</div>
          </div>
          <div className="text-2xl font-bold text-blue-500">{summary.active || 0}</div>
          <div className="text-[10px] text-gray-500">{summary.connected || 0} connected</div>
        </Card>

        <Card className="p-3 border-green-200 dark:border-green-800" data-testid="card-completed">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <div className="text-xs text-gray-600 dark:text-gray-400">Completed</div>
          </div>
          <div className="text-2xl font-bold text-green-500">{summary.completed || 0}</div>
        </Card>

        <Card className="p-3 border-red-200 dark:border-red-800" data-testid="card-failed">
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="w-4 h-4 text-red-500" />
            <div className="text-xs text-gray-600 dark:text-gray-400">Failed</div>
          </div>
          <div className="text-2xl font-bold text-red-500">{summary.failed || 0}</div>
          <div className="text-[10px] text-gray-500">{summary.voicemail || 0} VM</div>
        </Card>

        <Card className="p-3" data-testid="card-success-rate">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-gray-500" />
            <div className="text-xs text-gray-600 dark:text-gray-400">Success</div>
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {stats?.callSuccessRate ? `${Number(stats.callSuccessRate).toFixed(0)}%` : '0%'}
          </div>
        </Card>

        <Card className="p-3" data-testid="card-avg-duration">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-gray-500" />
            <div className="text-xs text-gray-600 dark:text-gray-400">Avg Time</div>
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {stats?.averageDuration ? formatDuration(Math.round(stats.averageDuration)) : '0:00'}
          </div>
        </Card>

        <Card className="p-3" data-testid="card-total-cost">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-gray-500" />
            <div className="text-xs text-gray-600 dark:text-gray-400">Cost</div>
          </div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
            ${stats?.totalCost ? Number(stats.totalCost).toFixed(2) : '0.00'}
          </div>
        </Card>
      </div>

      {/* Quick Filter Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant={filters.quickFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilters(prev => ({ ...prev, quickFilter: 'all' }))}
          data-testid="filter-all"
        >
          All Calls
        </Button>
        <Button
          variant={filters.quickFilter === 'active' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilters(prev => ({ ...prev, quickFilter: 'active' }))}
          data-testid="filter-active"
          className={filters.quickFilter === 'active' ? 'bg-blue-500 hover:bg-blue-600' : ''}
        >
          <Zap className="w-3 h-3 mr-1" />
          Active ({activeCalls.length})
        </Button>
        <Button
          variant={filters.quickFilter === 'completed' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilters(prev => ({ ...prev, quickFilter: 'completed' }))}
          data-testid="filter-completed"
          className={filters.quickFilter === 'completed' ? 'bg-green-500 hover:bg-green-600' : ''}
        >
          <CheckCircle className="w-3 h-3 mr-1" />
          Completed
        </Button>
        <Button
          variant={filters.quickFilter === 'failed' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilters(prev => ({ ...prev, quickFilter: 'failed' }))}
          data-testid="filter-failed"
          className={filters.quickFilter === 'failed' ? 'bg-red-500 hover:bg-red-600' : ''}
        >
          <XCircle className="w-3 h-3 mr-1" />
          Failed
        </Button>
        
        <div className="flex-1" />
        
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search phone, location, notes..."
            value={filters.search}
            onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
            className="pl-9 h-9"
            data-testid="input-search"
          />
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          data-testid="button-toggle-filters"
        >
          <Filter className="w-4 h-4 mr-1" />
          {showFilters ? 'Hide' : 'More'} Filters
        </Button>
      </div>

      {/* Advanced Filters (collapsible) */}
      {showFilters && (
        <Card className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Status</label>
              <Select value={filters.status} onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}>
                <SelectTrigger className="h-9" data-testid="select-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="ringing">Ringing</SelectItem>
                  <SelectItem value="missed">Missed</SelectItem>
                  <SelectItem value="busy">Busy</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="voicemail">Voicemail</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-xs font-medium mb-1 block">Type</label>
              <Select value={filters.type} onValueChange={(value) => setFilters(prev => ({ ...prev, type: value }))}>
                <SelectTrigger className="h-9" data-testid="select-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="inbound">Inbound</SelectItem>
                  <SelectItem value="outbound">Outbound</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-xs font-medium mb-1 block">Disposition</label>
              <Select value={filters.disposition || 'all'} onValueChange={(value) => setFilters(prev => ({ ...prev, disposition: value }))}>
                <SelectTrigger className="h-9" data-testid="select-disposition">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Dispositions</SelectItem>
                  <SelectItem value="answered">Answered</SelectItem>
                  <SelectItem value="voicemail">Voicemail</SelectItem>
                  <SelectItem value="no-answer">No Answer</SelectItem>
                  <SelectItem value="human">Human</SelectItem>
                  <SelectItem value="machine">Machine</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFilters({
                  search: '',
                  status: 'all',
                  type: 'all',
                  disposition: 'all',
                  quickFilter: 'all',
                })}
                className="w-full"
                data-testid="button-clear-filters"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Compact Call Log Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 dark:bg-gray-900/50">
                  <TableHead className="w-[30px]"></TableHead>
                  <TableHead className="w-[40px]">
                    <Tooltip>
                      <TooltipTrigger>
                        <Activity className="w-4 h-4 text-gray-500" />
                      </TooltipTrigger>
                      <TooltipContent>Status</TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead className="min-w-[180px]">Contact / Phone</TableHead>
                  <TableHead className="w-[80px]">Time</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[70px]">Type</TableHead>
                  <TableHead className="w-[80px]">Recording</TableHead>
                  <TableHead className="w-[100px]">When</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCalls.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-gray-500 dark:text-gray-400">
                      <PhoneMissed className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p>No calls found</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCalls.map((call) => {
                    const CallIcon = getCallIcon(call.type, call.status);
                    const isExpanded = expandedCallId === call.id;
                    const hasRecordings = call.recordings && call.recordings.length > 0;
                    const isActive = ['in-progress', 'ringing', 'queued', 'initiated'].includes(call.status);
                    const displayDuration = isActive ? (liveTimers[call.id] || call.duration || 0) : (call.duration || 0);
                    
                    return (
                      <>
                        <TableRow 
                          key={call.id} 
                          data-testid={`row-call-${call.id}`}
                          className={cn(
                            "cursor-pointer hover:bg-muted/50 transition-colors",
                            isExpanded && "bg-muted/30",
                            isActive && "bg-blue-50/50 dark:bg-blue-950/20"
                          )}
                        >
                          <TableCell className="p-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleCallExpanded(call.id)}
                              className="h-6 w-6 p-0"
                              data-testid={`button-expand-${call.id}`}
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-3 w-3" />
                              ) : (
                                <ChevronDown className="h-3 w-3" />
                              )}
                            </Button>
                          </TableCell>
                          
                          <TableCell className="p-2" onClick={() => toggleCallExpanded(call.id)}>
                            <CallIcon className={cn(
                              "w-4 h-4",
                              call.status === 'completed' ? 'text-green-500' :
                              isActive ? 'text-blue-500 animate-pulse' :
                              call.status === 'missed' ? 'text-red-500' : 'text-gray-400'
                            )} />
                          </TableCell>
                          
                          <TableCell className="p-2" onClick={() => toggleCallExpanded(call.id)}>
                            <div className="min-w-0">
                              <div className="font-medium text-sm truncate text-gray-900 dark:text-gray-100">
                                {call.contactName || formatPhoneNumber(call.phone)}
                              </div>
                              {call.location && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{call.location}</div>
                              )}
                            </div>
                          </TableCell>
                          
                          <TableCell className="p-2" onClick={() => toggleCallExpanded(call.id)}>
                            <div className={cn(
                              "text-sm font-mono",
                              isActive && "text-blue-600 dark:text-blue-400 font-semibold"
                            )}>
                              {formatDuration(displayDuration)}
                            </div>
                          </TableCell>
                          
                          <TableCell className="p-2" onClick={() => toggleCallExpanded(call.id)}>
                            <Badge className={cn("text-xs", getStatusColor(call.status))} data-testid={`badge-status-${call.status}`}>
                              {call.status}
                            </Badge>
                          </TableCell>
                          
                          <TableCell className="p-2" onClick={() => toggleCallExpanded(call.id)}>
                            <span className="text-xs text-gray-600 dark:text-gray-400 capitalize">{call.type}</span>
                          </TableCell>
                          
                          <TableCell className="p-2" onClick={() => toggleCallExpanded(call.id)}>
                            {hasRecordings ? (
                              <div className="flex items-center gap-1">
                                <Badge variant="default" className="text-xs h-5 px-1.5">
                                  <FileAudio className="h-3 w-3 mr-0.5" />
                                  {call.recordings!.length}
                                </Badge>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </TableCell>
                          
                          <TableCell className="p-2 text-xs text-gray-600 dark:text-gray-400" onClick={() => toggleCallExpanded(call.id)}>
                            {call.createdAt ? formatDistanceToNow(new Date(call.createdAt), { addSuffix: true }) : '-'}
                          </TableCell>
                          
                          <TableCell className="p-2">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => setSelectedCall(call)}
                              className="h-7 text-xs px-2"
                              data-testid={`button-view-call-${call.id}`}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              View
                            </Button>
                          </TableCell>
                        </TableRow>

                        {/* Expanded Row Details */}
                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={9} className="p-0 bg-muted/10 border-l-4 border-primary">
                              <div className="p-4 space-y-3">
                                {/* Quick Info Grid */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                  {call.sipCallId && (
                                    <div>
                                      <span className="text-gray-500">SIP Call ID:</span>
                                      <div className="font-mono text-gray-900 dark:text-gray-100 truncate" title={call.sipCallId}>
                                        {call.sipCallId.substring(0, 20)}...
                                      </div>
                                    </div>
                                  )}
                                  {call.cost && (
                                    <div>
                                      <span className="text-gray-500">Cost:</span>
                                      <div className="font-semibold text-gray-900 dark:text-gray-100">{formatCost(Number(call.cost))}</div>
                                    </div>
                                  )}
                                  {call.disposition && (
                                    <div>
                                      <span className="text-gray-500">Disposition:</span>
                                      <Badge variant="outline" className="text-xs capitalize">{call.disposition}</Badge>
                                    </div>
                                  )}
                                  {call.outcome && (
                                    <div>
                                      <span className="text-gray-500">Outcome:</span>
                                      <Badge variant="outline" className="text-xs capitalize">{call.outcome}</Badge>
                                    </div>
                                  )}
                                </div>

                                {/* Recordings */}
                                {hasRecordings && (
                                  <div className="border-t pt-3">
                                    <div className="flex items-center gap-2 mb-2">
                                      <FileAudio className="h-4 w-4 text-primary" />
                                      <span className="font-medium text-sm">
                                        Recording{call.recordings!.length > 1 ? 's' : ''}
                                      </span>
                                    </div>
                                    
                                    <div className="space-y-2">
                                      {call.recordings!.map((recording, idx) => (
                                        <div key={recording.id} className="bg-background rounded border p-2 flex items-center justify-between">
                                          <div className="flex items-center gap-2 text-xs">
                                            <span className="font-medium">#{idx + 1}</span>
                                            <Badge variant="outline" className="text-xs">{recording.direction}</Badge>
                                            <span className="font-mono">{formatRecordingDuration(recording.duration)}</span>
                                            {recording.transcript && (
                                              <MessageSquare className="h-3 w-3 text-green-500" />
                                            )}
                                          </div>
                                          
                                          <div className="flex items-center gap-1">
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => handlePlay(recording)}
                                              className="h-7 w-7 p-0"
                                              data-testid={`button-play-${recording.id}`}
                                            >
                                              <Play className="h-3 w-3" />
                                            </Button>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => handleDownload(recording)}
                                              className="h-7 w-7 p-0"
                                              data-testid={`button-download-${recording.id}`}
                                            >
                                              <Download className="h-3 w-3" />
                                            </Button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Summary/Notes */}
                                {call.summary && (
                                  <div className="border-t pt-3">
                                    <span className="text-xs font-medium text-gray-500">Summary:</span>
                                    <p className="text-sm text-gray-900 dark:text-gray-100 mt-1">{call.summary}</p>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Audio Player Modal */}
      {playingRecording && (
        <InlineAudioPlayer
          recording={playingRecording.recording}
          audioUrl={playingRecording.audioUrl}
          onClose={handleClosePlayer}
        />
      )}

      {/* Call Details Dialog */}
      {selectedCall && (
        <Dialog open={!!selectedCall} onOpenChange={() => setSelectedCall(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Call Details</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              {/* Basic Info */}
              <Card className="p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Phone:</span>
                    <div className="font-semibold text-gray-900 dark:text-gray-100">{formatPhoneNumber(selectedCall.phone)}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Status:</span>
                    <div><Badge className={getStatusColor(selectedCall.status)}>{selectedCall.status}</Badge></div>
                  </div>
                  <div>
                    <span className="text-gray-500">Duration:</span>
                    <div className="font-semibold text-gray-900 dark:text-gray-100">{formatDuration(selectedCall.duration || 0)}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Cost:</span>
                    <div className="font-semibold text-gray-900 dark:text-gray-100">{selectedCall.cost ? formatCost(Number(selectedCall.cost)) : 'N/A'}</div>
                  </div>
                  {selectedCall.location && (
                    <div>
                      <span className="text-gray-500">Location:</span>
                      <div className="font-semibold text-gray-900 dark:text-gray-100">{selectedCall.location}</div>
                    </div>
                  )}
                  {selectedCall.carrier && (
                    <div>
                      <span className="text-gray-500">Carrier:</span>
                      <div className="font-semibold text-gray-900 dark:text-gray-100">{selectedCall.carrier}</div>
                    </div>
                  )}
                </div>
              </Card>

              {/* Summary */}
              {selectedCall.summary && (
                <Card className="p-4">
                  <div className="text-sm font-semibold mb-2">Summary</div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{selectedCall.summary}</p>
                </Card>
              )}

              {/* Recordings in dialog */}
              {selectedCall.recordings && selectedCall.recordings.length > 0 && (
                <Card className="p-4">
                  <div className="text-sm font-semibold mb-3">Recordings</div>
                  <div className="space-y-2">
                    {selectedCall.recordings.map((recording, idx) => (
                      <div key={recording.id} className="bg-muted/50 rounded p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3 text-sm">
                          <span className="font-medium">Recording #{idx + 1}</span>
                          <Badge variant="outline">{recording.direction}</Badge>
                          <span className="font-mono">{formatRecordingDuration(recording.duration)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePlay(recording)}
                            data-testid={`button-play-dialog-${recording.id}`}
                          >
                            <Play className="h-3 w-3 mr-1" />
                            Play
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownload(recording)}
                            data-testid={`button-download-dialog-${recording.id}`}
                          >
                            <Download className="h-3 w-3 mr-1" />
                            Download
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Technical Details */}
              {(selectedCall.sipCallId || selectedCall.codec || selectedCall.hangupReason) && (
                <Card className="p-4">
                  <div className="text-sm font-semibold mb-3">Technical Details</div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {selectedCall.sipCallId && (
                      <div className="col-span-2">
                        <span className="text-gray-500">SIP Call ID:</span>
                        <div className="font-mono text-xs bg-muted p-2 rounded mt-1 break-all">
                          {selectedCall.sipCallId}
                        </div>
                      </div>
                    )}
                    {selectedCall.codec && (
                      <div>
                        <span className="text-gray-500">Codec:</span>
                        <Badge variant="outline" className="mt-1">{selectedCall.codec}</Badge>
                      </div>
                    )}
                    {selectedCall.hangupReason && (
                      <div>
                        <span className="text-gray-500">Hangup Reason:</span>
                        <Badge variant="outline" className="mt-1">{selectedCall.hangupReason}</Badge>
                      </div>
                    )}
                  </div>
                </Card>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
