import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { format, isWithinInterval, formatDistanceToNow } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { 
  Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, PhoneCall,
  Clock, Search, Download, CheckCircle, RefreshCw, ChevronDown, 
  ChevronUp, Play, Eye, Activity, XCircle, Filter, ChevronRight,
  FileAudio, ArrowUpDown, Mic, Trash2, DollarSign, Calendar
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CallLogPageSkeleton } from '@/components/skeletons/CallLogPageSkeleton';
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

const getStatusStyle = (status: string) => {
  switch (status) {
    case 'completed': return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800';
    case 'in-progress': return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-800';
    case 'ringing': return 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/50 dark:text-violet-400 dark:border-violet-800';
    case 'queued': 
    case 'initiated': return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800';
    case 'missed':
    case 'no-answer': return 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-400 dark:border-orange-800';
    case 'busy':
    case 'failed': return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800';
    case 'voicemail': return 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-400 dark:border-indigo-800';
    case 'canceled':
    case 'cancelled': return 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700';
    default: return 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700';
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
    minimumFractionDigits: 2
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
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const {
    data: paginatedData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: callsLoading,
    refetch: refetchCalls
  } = useInfiniteQuery({
    queryKey: ['/api/calls'],
    queryFn: async ({ pageParam = 1 }) => {
      console.log(`🔄 Fetching calls page ${pageParam}`);
      try {
        const res = await apiRequest('GET', `/api/calls?page=${pageParam}&limit=50`);
        console.log('📡 /api/calls response', {
          pageParam,
          status: res.status,
          statusText: res.statusText,
          contentType: res.headers.get('content-type')
        });
        const data = await res.json();
        console.log('📦 /api/calls payload', {
          keys: data ? Object.keys(data) : null,
          callsLength: Array.isArray(data?.calls) ? data.calls.length : 'not-array',
          page: data?.page,
          totalPages: data?.totalPages,
          total: data?.total
        });
        console.log(`✅ Fetched ${data.calls?.length || 0} calls for page ${pageParam}`);
        return data;
      } catch (error) {
        console.error(`❌ Error fetching calls page ${pageParam}:`, error);
        throw error;
      }
    },
    getNextPageParam: (lastPage: any) => {
      console.log('📌 getNextPageParam lastPage', {
        hasLastPage: !!lastPage,
        keys: lastPage ? Object.keys(lastPage) : null,
        callsLength: Array.isArray(lastPage?.calls) ? lastPage.calls.length : 'not-array'
      });
      if (!lastPage || !Array.isArray(lastPage.calls)) return undefined;
      // Use the pagination metadata from the backend if available
      if (lastPage.page && lastPage.totalPages) {
        return lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined;
      }
      // Fallback to calculating based on count if metadata is missing (backward compatibility)
      const loadedCount = (lastPage.page || 1) * 50;
      return loadedCount < (lastPage.total || 0) ? (lastPage.page || 1) + 1 : undefined;
    },
    initialPageParam: 1,
  });

  const { data: stats, isLoading: statsLoading } = useQuery<CallLogStats>({
    queryKey: ['/api/calls/stats'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/calls/stats`);
      return res.json();
    },
  });

  const calls = useMemo(() => {
    if (!paginatedData?.pages) return [];
    try {
      return paginatedData.pages.flatMap(page => (page && Array.isArray(page.calls)) ? page.calls : []) || [];
    } catch (err) {
      console.error("Error flattening calls:", err);
      return [];
    }
  }, [paginatedData]);

  useEffect(() => {
    console.log("[CallLog] paginatedData snapshot", {
      hasData: !!paginatedData,
      pagesIsArray: Array.isArray(paginatedData?.pages),
      pagesLength: paginatedData?.pages?.length,
      pageParams: paginatedData?.pageParams,
      hasNextPage,
      isFetchingNextPage
    });
  }, [paginatedData, hasNextPage, isFetchingNextPage]);

  const { data: statusData, refetch: refetchStatus } = useQuery<any>({
    queryKey: ['/api/calls/by-status'],
    refetchInterval: 10000 
  });

  const summary = useMemo(() => statusData?.summary || {
    totalCalls: 0,
    active: 0,
    connected: 0,
    completed: 0,
    failed: 0,
    voicemail: 0,
    dropped: 0
  }, [statusData]);

  const activeCalls = useMemo(() => {
    if (!Array.isArray(calls)) return [];
    return calls.filter((call: any) => 
      call && (call.status === 'in-progress' || call.status === 'ringing')
    );
  }, [calls]);

  const filteredCalls = useMemo(() => {
    if (!Array.isArray(calls)) return [];
    return calls.filter((call: any) => {
      if (!call) return false;
      if (filters.quickFilter === 'active') return call.status === 'in-progress' || call.status === 'ringing';
      if (filters.quickFilter === 'completed') return call.status === 'completed';
      if (filters.quickFilter === 'failed') return ['failed', 'busy', 'no-answer', 'canceled'].includes(call.status);
      return true;
    });
  }, [calls, filters.quickFilter]);

  const toggleCallExpanded = (id: number) => {
    setExpandedCallId(expandedCallId === id ? null : id);
  };

  const handlePlay = (recording: Recording) => {
    setPlayingRecording({ recording, audioUrl: `/api/recordings/${recording.id}/play` });
  };

  const handleDownload = (recording: Recording) => {
    window.open(`/api/recordings/${recording.id}/download`, '_blank');
  };

  const deleteRecordingMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/recordings/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recordings'] });
      toast({ title: "Recording deleted" });
    }
  });

  const handleClosePlayer = () => setPlayingRecording(null);
  const formatRecordingDuration = (s: number) => formatDuration(s);

  useEffect(() => {
    const handleCallUpdate = (event: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/calls'], exact: false });
      refetchStatus();
    };

    window.addEventListener('call_update', handleCallUpdate);
    window.addEventListener('new_call', handleCallUpdate);
    window.addEventListener('parallel_call_status', handleCallUpdate);

    return () => {
      window.removeEventListener('call_update', handleCallUpdate);
      window.removeEventListener('new_call', handleCallUpdate);
      window.removeEventListener('parallel_call_status', handleCallUpdate);
    };
  }, [queryClient, refetchStatus]);

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchNextPage();
        }
      },
      { threshold: 0.1, rootMargin: '200px' }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    if (activeCalls.length === 0) return;

    const interval = setInterval(() => {
      setLiveTimers(prev => {
        const newTimers = { ...prev };
        activeCalls.forEach((call: any) => {
          newTimers[call.id] = (newTimers[call.id] || call.duration || 0) + 1;
        });
        return newTimers;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [activeCalls]);

  if (callsLoading) {
    return <CallLogPageSkeleton />;
  }

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950">
      <div className="w-full px-4 sm:px-6 py-3 space-y-3">
        
        {/* Action Bar */}
        <div className="flex items-center justify-end gap-2">
          {isConnected && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-full">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Live</span>
            </div>
          )}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => { refetchCalls(); refetchStatus(); }}
            className="h-8"
            data-testid="button-refresh"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm" data-testid="card-total-calls">
            <CardContent className="p-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Total</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-white">{stats?.totalCalls || 0}</p>
                </div>
                <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  <Phone className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-900 border-blue-200 dark:border-blue-900 shadow-sm" data-testid="card-active-calls">
            <CardContent className="p-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Active</p>
                  <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{summary.active || 0}</p>
                  <p className="text-[9px] text-slate-400">{summary.connected || 0} connected</p>
                </div>
                <div className="p-2 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-900 border-emerald-200 dark:border-emerald-900 shadow-sm" data-testid="card-completed">
            <CardContent className="p-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Completed</p>
                  <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{summary.completed || 0}</p>
                </div>
                <div className="p-2 bg-emerald-50 dark:bg-emerald-950 rounded-lg">
                  <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-900 border-red-200 dark:border-red-900 shadow-sm" data-testid="card-failed">
            <CardContent className="p-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Failed</p>
                  <p className="text-xl font-bold text-red-600 dark:text-red-400">{summary.failed || 0}</p>
                  <p className="text-[9px] text-slate-400">{summary.voicemail || 0} voicemail</p>
                </div>
                <div className="p-2 bg-red-50 dark:bg-red-950 rounded-lg">
                  <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm" data-testid="card-avg-duration">
            <CardContent className="p-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Avg Time</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-white">
                    {stats?.averageDuration ? formatDuration(Math.round(stats.averageDuration)) : '0:00'}
                  </p>
                </div>
                <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  <Clock className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm" data-testid="card-success-rate">
            <CardContent className="p-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Success</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-white">
                    {stats?.callSuccessRate ? `${Number(stats.callSuccessRate).toFixed(0)}%` : '0%'}
                  </p>
                </div>
                <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  <ArrowUpDown className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm" data-testid="card-total-cost">
            <CardContent className="p-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Cost</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-white">
                    ${stats?.totalCost ? Number(stats.totalCost).toFixed(2) : '0.00'}
                  </p>
                </div>
                <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  <DollarSign className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters & Search */}
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
          <CardContent className="p-3">
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
              {/* Tab Filters */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <button
                  onClick={() => setFilters(prev => ({ ...prev, quickFilter: 'all' }))}
                  className={cn(
                    "px-3 py-1.5 text-sm font-medium rounded-md transition-all",
                    filters.quickFilter === 'all' 
                      ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" 
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                  data-testid="filter-all"
                >
                  All
                </button>
                <button
                  onClick={() => setFilters(prev => ({ ...prev, quickFilter: 'active' }))}
                  className={cn(
                    "px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-1.5",
                    filters.quickFilter === 'active' 
                      ? "bg-blue-500 text-white shadow-sm" 
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                  data-testid="filter-active"
                >
                  <Activity className="w-3.5 h-3.5" />
                  Active
                  {activeCalls.length > 0 && (
                    <span className={cn(
                      "px-1.5 py-0.5 text-xs rounded-full",
                      filters.quickFilter === 'active' ? "bg-blue-400" : "bg-slate-200 dark:bg-slate-700"
                    )}>
                      {activeCalls.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setFilters(prev => ({ ...prev, quickFilter: 'completed' }))}
                  className={cn(
                    "px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-1.5",
                    filters.quickFilter === 'completed' 
                      ? "bg-emerald-500 text-white shadow-sm" 
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                  data-testid="filter-completed"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Completed
                </button>
                <button
                  onClick={() => setFilters(prev => ({ ...prev, quickFilter: 'failed' }))}
                  className={cn(
                    "px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-1.5",
                    filters.quickFilter === 'failed' 
                      ? "bg-red-500 text-white shadow-sm" 
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                  data-testid="filter-failed"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Failed
                </button>
              </div>

              <div className="flex-1" />

              {/* Search */}
              <div className="relative w-full lg:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search calls..."
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  className="pl-9 h-9 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                  data-testid="input-search"
                />
              </div>

              {/* Filter Toggle */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className={cn("h-9", showFilters && "bg-slate-100 dark:bg-slate-800")}
                data-testid="button-toggle-filters"
              >
                <Filter className="w-4 h-4 mr-1.5" />
                Filters
                <ChevronDown className={cn("w-4 h-4 ml-1 transition-transform", showFilters && "rotate-180")} />
              </Button>
            </div>

            {/* Expanded Filters */}
            {showFilters && (
              <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">Status</label>
                    <Select value={filters.status} onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}>
                      <SelectTrigger className="h-9 bg-slate-50 dark:bg-slate-800" data-testid="select-status">
                        <SelectValue placeholder="All Status" />
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
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">Direction</label>
                    <Select value={filters.type} onValueChange={(value) => setFilters(prev => ({ ...prev, type: value }))}>
                      <SelectTrigger className="h-9 bg-slate-50 dark:bg-slate-800" data-testid="select-type">
                        <SelectValue placeholder="All Types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="inbound">Inbound</SelectItem>
                        <SelectItem value="outbound">Outbound</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">Disposition</label>
                    <Select value={filters.disposition || 'all'} onValueChange={(value) => setFilters(prev => ({ ...prev, disposition: value }))}>
                      <SelectTrigger className="h-9 bg-slate-50 dark:bg-slate-800" data-testid="select-disposition">
                        <SelectValue placeholder="All Dispositions" />
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

                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">Date Range</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "h-9 w-full justify-start text-left font-normal bg-slate-50 dark:bg-slate-800",
                            !filters.dateRange && "text-muted-foreground"
                          )}
                          data-testid="button-date-range"
                        >
                          <Calendar className="mr-2 h-4 w-4" />
                          {filters.dateRange?.from ? (
                            filters.dateRange.to ? (
                              <>
                                {format(filters.dateRange.from, "LLL dd")} - {format(filters.dateRange.to, "LLL dd")}
                              </>
                            ) : (
                              format(filters.dateRange.from, "LLL dd, y")
                            )
                          ) : (
                            <span>Pick dates</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          initialFocus
                          mode="range"
                          defaultMonth={filters.dateRange?.from}
                          selected={filters.dateRange}
                          onSelect={(range) => setFilters(prev => ({ ...prev, dateRange: range }))}
                          numberOfMonths={2}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="flex items-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setFilters({
                        search: '',
                        status: 'all',
                        type: 'all',
                        disposition: 'all',
                        quickFilter: 'all',
                        dateRange: undefined,
                      })}
                      className="h-9 w-full text-slate-600 dark:text-slate-400"
                      data-testid="button-clear-filters"
                    >
                      Clear All
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Call List */}
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {/* Table Header */}
            <div className="hidden lg:grid lg:grid-cols-12 gap-3 px-4 py-2 bg-slate-50 dark:bg-slate-800/50 text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              <div className="col-span-4">Contact</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-1">Duration</div>
              <div className="col-span-1">Type</div>
              <div className="col-span-1">Recording</div>
              <div className="col-span-2">Time</div>
              <div className="col-span-1"></div>
            </div>

            {/* Call Rows */}
            {filteredCalls.length === 0 ? (
              <div className="py-8 text-center">
                <PhoneMissed className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">No calls found</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Try adjusting your filters</p>
              </div>
            ) : (
              filteredCalls.map((call) => {
                const CallIcon = getCallIcon(call.type, call.status);
                const isExpanded = expandedCallId === call.id;
                const hasRecordings = call.recordings && call.recordings.length > 0;
                const isActive = ['in-progress', 'ringing', 'queued', 'initiated'].includes(call.status);
                const displayDuration = isActive ? (liveTimers[call.id] || call.duration || 0) : (call.duration || 0);
                
                return (
                  <div key={call.id} data-testid={`row-call-${call.id}`}>
                    <div 
                      className={cn(
                        "grid grid-cols-12 gap-3 px-4 py-2.5 items-center cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50",
                        isExpanded && "bg-slate-50 dark:bg-slate-800/50",
                        isActive && "bg-blue-50/50 dark:bg-blue-950/20"
                      )}
                      onClick={() => toggleCallExpanded(call.id)}
                    >
                      {/* Contact */}
                      <div className="col-span-12 lg:col-span-4 flex items-center gap-2.5">
                        <div className={cn(
                          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
                          call.status === 'completed' ? 'bg-emerald-100 dark:bg-emerald-950' :
                          isActive ? 'bg-blue-100 dark:bg-blue-950' :
                          call.status === 'missed' || call.status === 'failed' ? 'bg-red-100 dark:bg-red-950' : 
                          'bg-slate-100 dark:bg-slate-800'
                        )}>
                          <CallIcon className={cn(
                            "w-4 h-4",
                            call.status === 'completed' ? 'text-emerald-600 dark:text-emerald-400' :
                            isActive ? 'text-blue-600 dark:text-blue-400 animate-pulse' :
                            call.status === 'missed' || call.status === 'failed' ? 'text-red-600 dark:text-red-400' : 
                            'text-slate-500 dark:text-slate-400'
                          )} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                            {call.contactName || formatPhoneNumber(call.phone)}
                          </p>
                          {call.location && (
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{call.location}</p>
                          )}
                        </div>
                      </div>

                      {/* Status */}
                      <div className="col-span-4 lg:col-span-2 flex items-center gap-2">
                        <Badge className={cn("text-[10px] px-2 py-0.5 font-medium border", getStatusStyle(call.status))} data-testid={`badge-status-${call.status}`}>
                          {call.status}
                        </Badge>
                      </div>

                      {/* Duration */}
                      <div className="col-span-2 lg:col-span-1">
                        <span className={cn(
                          "text-xs font-mono font-medium",
                          isActive ? "text-blue-600 dark:text-blue-400" : "text-slate-700 dark:text-slate-300"
                        )}>
                          {formatDuration(displayDuration)}
                        </span>
                      </div>

                      {/* Type */}
                      <div className="col-span-2 lg:col-span-1">
                        <span className="text-xs text-slate-500 dark:text-slate-400 capitalize">{call.type}</span>
                      </div>

                      {/* Recording */}
                      <div className="col-span-2 lg:col-span-1">
                        {hasRecordings ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-violet-50 dark:bg-violet-950 rounded-full">
                                <Mic className="w-2.5 h-2.5 text-violet-600 dark:text-violet-400" />
                                <span className="text-[10px] font-medium text-violet-600 dark:text-violet-400">{call.recordings!.length}</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              {call.recordings!.length} recording{call.recordings!.length > 1 ? 's' : ''}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </div>

                      {/* Time */}
                      <div className="col-span-4 lg:col-span-2">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {call.createdAt ? formatDistanceToNow(new Date(call.createdAt), { addSuffix: true }) : '—'}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="col-span-2 lg:col-span-1 flex items-center justify-end gap-0.5">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); setSelectedCall(call); }}
                          className="h-7 w-7 p-0"
                          data-testid={`button-view-call-${call.id}`}
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-500" />
                        </Button>
                        <ChevronRight className={cn(
                          "w-3.5 h-3.5 text-slate-400 transition-transform",
                          isExpanded && "rotate-90"
                        )} />
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="px-4 py-3 bg-slate-50/50 dark:bg-slate-800/30 border-l-2 border-blue-500">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                          {call.sipCallId && (
                            <div>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">SIP Call ID</p>
                              <p className="font-mono text-xs text-slate-700 dark:text-slate-300 truncate">{call.sipCallId.substring(0, 24)}...</p>
                            </div>
                          )}
                          {call.cost && (
                            <div>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Cost</p>
                              <p className="font-semibold text-slate-900 dark:text-white">{formatCost(Number(call.cost))}</p>
                            </div>
                          )}
                          {call.disposition && (
                            <div>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Disposition</p>
                              <Badge variant="outline" className="text-xs capitalize">{call.disposition}</Badge>
                            </div>
                          )}
                          {call.outcome && (
                            <div>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Outcome</p>
                              <Badge variant="outline" className="text-xs capitalize">{call.outcome}</Badge>
                            </div>
                          )}
                        </div>

                        {/* Recordings */}
                        {hasRecordings && (
                          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1.5">
                              <FileAudio className="w-4 h-4" />
                              Recordings
                            </p>
                            <div className="space-y-2">
                              {(call.recordings as Recording[] | undefined)?.map((recording: Recording, idx: number) => (
                                <div key={recording.id} className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-violet-100 dark:bg-violet-950 rounded-full flex items-center justify-center">
                                      <Play className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-medium text-slate-900 dark:text-white">Recording {idx + 1}</p>
                                      <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {recording.direction} • {formatRecordingDuration(recording.duration)}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => { e.stopPropagation(); handlePlay(recording); }}
                                      className="h-8 w-8 p-0"
                                      data-testid={`button-play-${recording.id}`}
                                    >
                                      <Play className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => { e.stopPropagation(); handleDownload(recording); }}
                                      className="h-8 w-8 p-0"
                                      data-testid={`button-download-${recording.id}`}
                                    >
                                      <Download className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        if (window.confirm("Are you sure you want to delete this recording?")) {
                                          deleteRecordingMutation.mutate(recording.id);
                                        }
                                      }}
                                      className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                                      data-testid={`button-delete-${recording.id}`}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Summary */}
                        {call.summary && (
                          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Summary</p>
                            <p className="text-sm text-slate-700 dark:text-slate-300">{call.summary}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </Card>

        {/* Showing count */}
        <div className="text-center text-xs text-slate-500 dark:text-slate-400 py-1">
          Showing {filteredCalls.length} of {calls.length} calls
        </div>
      </div>

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
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">Call Details</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-5 mt-2">
              {/* Header Info */}
              <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                <div className={cn(
                  "w-14 h-14 rounded-full flex items-center justify-center",
                  selectedCall.status === 'completed' ? 'bg-emerald-100 dark:bg-emerald-950' :
                  selectedCall.status === 'failed' ? 'bg-red-100 dark:bg-red-950' : 
                  'bg-slate-200 dark:bg-slate-700'
                )}>
                  {(() => { const Icon = getCallIcon(selectedCall.type, selectedCall.status); return <Icon className="w-7 h-7 text-slate-600 dark:text-slate-300" />; })()}
                </div>
                <div>
                  <p className="text-lg font-semibold text-slate-900 dark:text-white">{formatPhoneNumber(selectedCall.phone)}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{selectedCall.location || 'Unknown location'}</p>
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Status</p>
                  <Badge className={cn("text-sm font-medium border", getStatusStyle(selectedCall.status))}>{selectedCall.status}</Badge>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Duration</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-white">{formatDuration(selectedCall.duration || 0)}</p>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Cost</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-white">{selectedCall.cost ? formatCost(Number(selectedCall.cost)) : '—'}</p>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Type</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-white capitalize">{selectedCall.type}</p>
                </div>
              </div>

              {/* Summary */}
              {selectedCall.summary && (
                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Summary</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300">{selectedCall.summary}</p>
                </div>
              )}

              {/* Recordings */}
                    {selectedCall.recordings && selectedCall.recordings.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Recordings</p>
                  <div className="space-y-2">
                    {(selectedCall.recordings as Recording[]).map((recording: Recording, idx: number) => (
                      <div key={recording.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-violet-100 dark:bg-violet-950 rounded-full flex items-center justify-center">
                            <Play className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                          </div>
                          <div>
                            <p className="font-medium text-slate-900 dark:text-white">Recording {idx + 1}</p>
                            <p className="text-xs text-slate-500">{recording.direction} • {formatRecordingDuration(recording.duration)}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => handlePlay(recording)} data-testid={`button-play-dialog-${recording.id}`}>
                            <Play className="w-4 h-4 mr-1" /> Play
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleDownload(recording)} data-testid={`button-download-dialog-${recording.id}`}>
                            <Download className="w-4 h-4 mr-1" /> Download
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => {
                              if (window.confirm("Are you sure you want to delete this recording?")) {
                                deleteRecordingMutation.mutate(recording.id);
                              }
                            }}
                            className="text-red-500 hover:text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950"
                            data-testid={`button-delete-dialog-${recording.id}`}
                          >
                            <Trash2 className="w-4 h-4 mr-1" /> Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Technical Details */}
              {(selectedCall.sipCallId || selectedCall.codec || selectedCall.hangupReason || selectedCall.carrier) && (
                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">Technical Details</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {selectedCall.carrier && (
                      <div>
                        <p className="text-xs text-slate-400">Carrier</p>
                        <p className="text-slate-700 dark:text-slate-300">{selectedCall.carrier}</p>
                      </div>
                    )}
                    {selectedCall.codec && (
                      <div>
                        <p className="text-xs text-slate-400">Codec</p>
                        <p className="text-slate-700 dark:text-slate-300">{selectedCall.codec}</p>
                      </div>
                    )}
                    {selectedCall.hangupReason && (
                      <div>
                        <p className="text-xs text-slate-400">Hangup Reason</p>
                        <p className="text-slate-700 dark:text-slate-300">{selectedCall.hangupReason}</p>
                      </div>
                    )}
                    {selectedCall.sipCallId && (
                      <div className="col-span-2">
                        <p className="text-xs text-slate-400 mb-1">SIP Call ID</p>
                        <code className="text-xs bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded block overflow-x-auto">{selectedCall.sipCallId}</code>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
