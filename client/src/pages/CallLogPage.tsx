import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, isWithinInterval, formatDistanceToNow } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { 
  Phone, 
  PhoneIncoming, 
  PhoneOutgoing, 
  PhoneMissed, 
  Clock, 
  Star,
  Search,
  Download,
  FileText,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  PlayCircle,
  Calendar,
  UserPlus,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Minus,
  FileAudio,
  Play,
  Trash2,
  Eye,
  HardDrive,
  Activity,
  Pause,
  Volume2,
  VolumeX
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
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

interface CallLogFilters {
  search: string;
  status: string;
  type: string;
  dateRange?: DateRange;
  disposition?: string;
}

interface CallWithRecordings extends Call {
  recordings?: Recording[];
}

const getCallIcon = (type: string, status: string) => {
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
    case 'missed': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
    case 'busy': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
    case 'failed': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
    case 'cancelled': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'high': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
    case 'normal': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
    case 'low': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  }
};

const getSentimentColor = (sentiment: string) => {
  switch (sentiment) {
    case 'positive': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    case 'negative': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
    case 'neutral': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
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
    currency: 'USD'
  }).format(cost);
};

export default function CallLogPage() {
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<CallLogFilters>({
    search: '',
    status: 'all',
    type: 'all',
    dateRange: undefined,
    disposition: 'all',
  });
  const [expandedCallId, setExpandedCallId] = useState<number | null>(null);
  const [playingRecording, setPlayingRecording] = useState<{ recording: Recording; audioUrl: string } | null>(null);
  const { isConnected } = useWebSocket();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    return () => {
      if (playingRecording?.audioUrl) {
        URL.revokeObjectURL(playingRecording.audioUrl);
      }
    };
  }, [playingRecording]);
  
  const filterConfig = [
    {
      type: 'text' as const,
      label: 'Search',
      field: 'search',
      placeholder: 'Search by phone, location, or notes',
    },
    {
      type: 'select' as const,
      label: 'Status',
      field: 'status',
      options: [
        { value: 'completed', label: 'Completed' },
        { value: 'missed', label: 'Missed' },
        { value: 'busy', label: 'Busy' },
        { value: 'failed', label: 'Failed' },
        { value: 'cancelled', label: 'Cancelled' },
      ],
    },
    {
      type: 'select' as const,
      label: 'Type',
      field: 'type',
      options: [
        { value: 'inbound', label: 'Inbound' },
        { value: 'outbound', label: 'Outbound' },
      ],
    },
    {
      type: 'select' as const,
      label: 'Disposition',
      field: 'disposition',
      options: [
        { value: 'answered', label: 'Answered' },
        { value: 'voicemail', label: 'Voicemail' },
        { value: 'no-answer', label: 'No Answer' },
        { value: 'human', label: 'Human' },
        { value: 'machine', label: 'Machine' },
      ],
    },
    {
      type: 'dateRange' as const,
      label: 'Date Range',
      field: 'dateRange',
      placeholder: 'Filter by date range',
    },
  ];

  const { data: calls = [], isLoading, refetch } = useQuery<CallWithRecordings[]>({
    queryKey: ['/api/calls'],
  });

  const { data: stats, isLoading: statsLoading } = useQuery<CallLogStats>({
    queryKey: ['/api/calls/stats'],
  });

  const { data: allRecordings = [] } = useQuery<Recording[]>({
    queryKey: ['/api/recordings?limit=1000'],
    select: (data: any) => data?.recordings || [],
  });

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

  const callsWithRecordings = calls.map(call => ({
    ...call,
    recordings: allRecordings.filter((rec: Recording) => rec.callId === call.id)
  }));

  const filteredCalls = callsWithRecordings.filter(call => {
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

  if (isLoading || statsLoading) {
    return <CallLogPageSkeleton />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Call Log</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">View and manage all your calls with recordings</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        <Card className="p-3" data-testid="card-total-calls">
          <div className="text-xs text-gray-600 dark:text-gray-400">Total Calls</div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{stats?.totalCalls || 0}</div>
        </Card>
        <Card className="p-3" data-testid="card-success-rate">
          <div className="text-xs text-gray-600 dark:text-gray-400">Success Rate</div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {stats?.callSuccessRate ? `${Number(stats.callSuccessRate).toFixed(2)}%` : '0%'}
          </div>
        </Card>
        <Card className="p-3" data-testid="card-avg-duration">
          <div className="text-xs text-gray-600 dark:text-gray-400">Avg Duration</div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {stats?.averageDuration ? formatDuration(Math.round(stats.averageDuration)) : '0:00'}
          </div>
        </Card>
        <Card className="p-3" data-testid="card-total-cost">
          <div className="text-xs text-gray-600 dark:text-gray-400">Total Cost</div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {stats?.totalCost ? formatCost(stats.totalCost) : '$0.00'}
          </div>
        </Card>
      </div>

      <AdvancedFilters
        filters={filters}
        onChange={(newFilters) => setFilters(newFilters as CallLogFilters)}
        config={filterConfig}
        showFilters={showFilters}
        onToggle={() => setShowFilters(!showFilters)}
      />

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead className="w-[200px]">Contact</TableHead>
                  <TableHead className="w-[80px]">Duration</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead className="w-[100px]">Recording</TableHead>
                  <TableHead className="w-[120px]">Time</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCalls.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-gray-500 dark:text-gray-400">
                      No calls found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCalls.map((call) => {
                    const CallIcon = getCallIcon(call.type, call.status);
                    const isExpanded = expandedCallId === call.id;
                    const hasRecordings = call.recordings && call.recordings.length > 0;
                    
                    return (
                      <>
                        <TableRow 
                          key={call.id} 
                          data-testid={`row-call-${call.id}`}
                          className={cn(
                            "cursor-pointer hover:bg-muted/50",
                            isExpanded && "bg-muted/30"
                          )}
                        >
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleCallExpanded(call.id)}
                              className="h-6 w-6 p-0"
                              data-testid={`button-expand-${call.id}`}
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                          <TableCell onClick={() => toggleCallExpanded(call.id)}>
                            <div className="flex items-center space-x-2">
                              <CallIcon className={cn("w-4 h-4", 
                                call.status === 'completed' ? 'text-green-500 dark:text-green-400' : 
                                call.status === 'missed' ? 'text-red-500 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
                              )} />
                              <div className="min-w-0">
                                <div className="font-medium text-sm truncate text-gray-900 dark:text-gray-100">{call.phone}</div>
                                {call.location && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{call.location}</div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell onClick={() => toggleCallExpanded(call.id)}>
                            <div className="flex items-center space-x-1 text-sm text-gray-900 dark:text-gray-100">
                              <Clock className="w-3 h-3 text-gray-400" />
                              <span>{formatDuration(call.duration || 0)}</span>
                            </div>
                          </TableCell>
                          <TableCell onClick={() => toggleCallExpanded(call.id)}>
                            <Badge className={getStatusColor(call.status)} data-testid={`badge-status-${call.status}`}>
                              {call.status}
                            </Badge>
                          </TableCell>
                          <TableCell onClick={() => toggleCallExpanded(call.id)}>
                            {hasRecordings ? (
                              <div className="flex items-center gap-2">
                                <Badge variant="default" className="text-xs gap-1">
                                  <FileAudio className="h-3 w-3" />
                                  {call.recordings!.length}
                                </Badge>
                                {call.recordings!.some(r => r.transcript) && (
                                  <MessageSquare className="h-3 w-3 text-green-500" />
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">None</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-gray-900 dark:text-gray-100" onClick={() => toggleCallExpanded(call.id)}>
                            {call.createdAt ? format(new Date(call.createdAt), 'MMM d, HH:mm') : '-'}
                          </TableCell>
                          <TableCell>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => setSelectedCall(call)}
                              className="h-8 text-xs"
                              data-testid={`button-view-call-${call.id}`}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Details
                            </Button>
                          </TableCell>
                        </TableRow>

                        {isExpanded && hasRecordings && (
                          <TableRow>
                            <TableCell colSpan={7} className="p-0 bg-muted/20 border-l-4 border-primary">
                              <div className="p-4 space-y-3">
                                <div className="flex items-center gap-2 mb-3">
                                  <FileAudio className="h-4 w-4 text-primary" />
                                  <span className="font-medium text-sm">
                                    {call.recordings!.length} Recording{call.recordings!.length > 1 ? 's' : ''}
                                  </span>
                                </div>
                                
                                {call.recordings!.map((recording, idx) => (
                                  <div key={recording.id} className="bg-background rounded-lg border p-3 space-y-3">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-medium text-muted-foreground">
                                            Recording #{idx + 1}
                                          </span>
                                          <Badge variant="outline" className="text-xs">
                                            {recording.direction}
                                          </Badge>
                                        </div>
                                        <span className="text-sm font-medium">
                                          {formatRecordingDuration(recording.duration)}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                          {recording.createdAt ? formatDistanceToNow(new Date(recording.createdAt), { addSuffix: true }) : 'Unknown'}
                                        </span>
                                      </div>
                                      
                                      <div className="flex items-center gap-1">
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => handlePlay(recording)}
                                              className="h-8 w-8 p-0"
                                              data-testid={`button-play-${recording.id}`}
                                            >
                                              <Play className="h-3 w-3" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>Play recording</TooltipContent>
                                        </Tooltip>
                                        
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => handleDownload(recording)}
                                              className="h-8 w-8 p-0"
                                              data-testid={`button-download-${recording.id}`}
                                            >
                                              <Download className="h-3 w-3" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>Download recording</TooltipContent>
                                        </Tooltip>

                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => handleDeleteRecording(recording)}
                                              disabled={deleteRecordingMutation.isPending}
                                              className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                                              data-testid={`button-delete-${recording.id}`}
                                            >
                                              <Trash2 className="h-3 w-3" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>Delete recording</TooltipContent>
                                        </Tooltip>
                                      </div>
                                    </div>

                                    {playingRecording?.recording.id === recording.id && (
                                      <div className="pt-2 border-t">
                                        <InlineAudioPlayer
                                          recording={playingRecording.recording}
                                          audioUrl={playingRecording.audioUrl}
                                          onClose={handleClosePlayer}
                                          onDownload={() => handleDownload(recording)}
                                        />
                                      </div>
                                    )}

                                    {recording.transcript && (
                                      <div className="pt-2 border-t">
                                        <div className="flex items-center gap-2 mb-2">
                                          <MessageSquare className="h-3 w-3 text-green-500" />
                                          <span className="text-xs font-medium">Transcript</span>
                                        </div>
                                        <ScrollArea className="h-32 w-full rounded border bg-muted/20 p-2">
                                          <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                            {recording.transcript}
                                          </p>
                                        </ScrollArea>
                                      </div>
                                    )}

                                  </div>
                                ))}

                                {call.summary && (
                                  <div className="mt-3 p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                                    <div className="flex items-center gap-2 mb-2">
                                      <FileText className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                                      <span className="text-xs font-medium text-purple-900 dark:text-purple-100">Call Summary</span>
                                    </div>
                                    <p className="text-xs text-gray-700 dark:text-gray-300">
                                      {call.summary}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}

                        {isExpanded && !hasRecordings && (
                          <TableRow>
                            <TableCell colSpan={7} className="p-0 bg-muted/20">
                              <div className="p-8 text-center">
                                <FileAudio className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">No recordings available</p>
                                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                  Recording may not have been enabled for this call
                                </p>
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

      {selectedCall && (
        <Dialog open={!!selectedCall} onOpenChange={() => setSelectedCall(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Call Details - {selectedCall.phone}</DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto max-h-[calc(90vh-120px)]">
              <CallDetailModal call={selectedCall} />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function CallDetailModal({ call }: { call: Call }) {
  const getSentimentIcon = (sentiment: string | null) => {
    if (!sentiment) return <Minus className="w-4 h-4 text-gray-400" />;
    switch (sentiment) {
      case 'positive':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'negative':
        return <TrendingDown className="w-4 h-4 text-red-500" />;
      default:
        return <Minus className="w-4 h-4 text-gray-400" />;
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    alert(`${label} copied to clipboard`);
  };

  return (
    <div className="w-full">
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="recording">Recording & Transcript</TabsTrigger>
          <TabsTrigger value="technical">Technical Details</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-4 mt-4 pb-4">
        {call.recordingUrl && (
          <Card className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-200 dark:border-blue-800">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <PlayCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-blue-900 dark:text-blue-100">Call Recording</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(call.recordingUrl!, '_blank')}
                className="text-xs"
                data-testid="button-download-recording"
              >
                <Download className="w-3 h-3 mr-1" />
                Download
              </Button>
            </div>
            <audio controls className="w-full" src={call.recordingUrl}>
              Your browser does not support the audio element.
            </audio>
          </Card>
        )}

        {call.summary && (
          <Card className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border-purple-200 dark:border-purple-800">
            <div className="flex items-center space-x-2 mb-2">
              <FileText className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span className="text-sm font-medium text-purple-900 dark:text-purple-100">AI Summary</span>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{call.summary}</p>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="text-sm font-semibold mb-3 text-gray-900 dark:text-gray-100">Call Information</div>
            <div className="space-y-2.5">
              <div className="flex justify-between text-sm items-center">
                <span className="text-gray-600 dark:text-gray-400">Phone:</span>
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-gray-900 dark:text-gray-100">{call.phone}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(call.phone, 'Phone number')}
                    className="h-6 w-6 p-0"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Type:</span>
                <Badge variant="outline" className="capitalize">{call.type}</Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Status:</span>
                <Badge className={getStatusColor(call.status)}>{call.status}</Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Duration:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{formatDuration(call.duration || 0)}</span>
              </div>
              {call.answeredBy && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Answered By:</span>
                  <Badge variant="secondary" className="capitalize">{call.answeredBy.replace('_', ' ')}</Badge>
                </div>
              )}
              {call.disposition && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Disposition:</span>
                  <Badge variant="outline" className="capitalize">{call.disposition.replace('_', ' ')}</Badge>
                </div>
              )}
              {call.outcome && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Outcome:</span>
                  <Badge variant="secondary" className="capitalize">{call.outcome.replace('-', ' ')}</Badge>
                </div>
              )}
              {call.createdAt && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Date & Time:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {format(new Date(call.createdAt), 'MMM d, yyyy HH:mm')}
                  </span>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm font-semibold mb-3 text-gray-900 dark:text-gray-100">Call Metrics</div>
            <div className="space-y-2.5">
              <div className="flex justify-between text-sm items-center">
                <span className="text-gray-600 dark:text-gray-400">Quality Rating:</span>
                <div className="flex items-center space-x-1">
                  {call.callQuality ? (
                    <>
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-3 h-3 ${
                            i < call.callQuality! ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'
                          }`}
                        />
                      ))}
                      <span className="ml-1 text-gray-900 dark:text-gray-100">({call.callQuality}/5)</span>
                    </>
                  ) : (
                    <span className="text-gray-500">N/A</span>
                  )}
                </div>
              </div>
              {call.sentiment && (
                <div className="flex justify-between text-sm items-center">
                  <span className="text-gray-600 dark:text-gray-400">Sentiment:</span>
                  <div className="flex items-center space-x-2">
                    {getSentimentIcon(call.sentiment)}
                    <Badge className={cn(getSentimentColor(call.sentiment), "capitalize")}>
                      {call.sentiment}
                    </Badge>
                  </div>
                </div>
              )}
              {call.priority && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Priority:</span>
                  <Badge className={cn(getPriorityColor(call.priority), "capitalize")}>{call.priority}</Badge>
                </div>
              )}
              {call.location && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Location:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{call.location}</span>
                </div>
              )}
              {call.carrier && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Carrier:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{call.carrier}</span>
                </div>
              )}
              {call.deviceType && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Device Type:</span>
                  <Badge variant="outline" className="capitalize">{call.deviceType}</Badge>
                </div>
              )}
              {call.ringDuration !== null && call.ringDuration !== undefined && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Ring Duration:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{call.ringDuration}s</span>
                </div>
              )}
            </div>
          </Card>
        </div>

        {call.keywords && call.keywords.length > 0 && (
          <Card className="p-4">
            <div className="text-sm font-semibold mb-3 text-gray-900 dark:text-gray-100">Keywords</div>
            <div className="flex flex-wrap gap-2">
              {call.keywords.map((keyword, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {keyword}
                </Badge>
              ))}
            </div>
          </Card>
        )}

        {call.actionItems && Array.isArray(call.actionItems) && call.actionItems.length > 0 && (
          <Card className="p-4">
            <div className="text-sm font-semibold mb-3 text-gray-900 dark:text-gray-100">Action Items</div>
            <div className="space-y-2">
              {(call.actionItems as any[]).map((item: any, index: number) => (
                <div key={index} className="flex items-start space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {typeof item === 'string' ? item : (item.description || String(item))}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {call.followUpRequired && (
          <Card className="p-4 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800">
            <div className="flex items-center space-x-2 mb-2">
              <Calendar className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              <span className="text-sm font-semibold text-orange-900 dark:text-orange-100">Follow-up Required</span>
            </div>
            {call.followUpDate && (
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Scheduled: {format(new Date(call.followUpDate), 'MMM d, yyyy')}
              </p>
            )}
            {call.followUpNotes && (
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{call.followUpNotes}</p>
            )}
          </Card>
        )}
      </TabsContent>

      <TabsContent value="recording" className="space-y-4 mt-4">
        {call.recordingUrl ? (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <PlayCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Call Recording</span>
              </div>
              <div className="flex space-x-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(call.recordingUrl!, '_blank')}
                  data-testid="button-open-recording"
                >
                  <ExternalLink className="w-3 h-3 mr-1" />
                  Open
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(call.recordingUrl!, '_blank')}
                  data-testid="button-download-recording-tab"
                >
                  <Download className="w-3 h-3 mr-1" />
                  Download
                </Button>
              </div>
            </div>
            <audio controls className="w-full" src={call.recordingUrl}>
              Your browser does not support the audio element.
            </audio>
          </Card>
        ) : (
          <Card className="p-8">
            <div className="flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
              <PlayCircle className="w-12 h-12 mb-3" />
              <p className="text-sm font-medium">No recording available</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Recording may not have been enabled for this call</p>
            </div>
          </Card>
        )}

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <FileText className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Call Transcript</span>
            </div>
            {call.transcript && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(call.transcript!, 'Transcript')}
                data-testid="button-copy-transcript"
              >
                <Copy className="w-3 h-3 mr-1" />
                Copy
              </Button>
            )}
          </div>
          <ScrollArea className="h-96 w-full p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            {call.transcript ? (
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                {call.transcript}
              </p>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                <FileText className="w-12 h-12 mb-3" />
                <p className="text-sm font-medium">No transcript available</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Transcription may not have been enabled</p>
              </div>
            )}
          </ScrollArea>
        </Card>

        {call.keywords && call.keywords.length > 0 && (
          <Card className="p-4">
            <div className="text-sm font-semibold mb-3 text-gray-900 dark:text-gray-100">Keywords Detected</div>
            <div className="flex flex-wrap gap-2">
              {call.keywords.map((keyword, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {keyword}
                </Badge>
              ))}
            </div>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="technical" className="space-y-4 mt-4">
        <Card className="p-4">
          <div className="text-sm font-semibold mb-4 text-gray-900 dark:text-gray-100">Network Quality</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {call.codec && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Codec:</span>
                <Badge variant="outline" className="font-mono uppercase">{call.codec}</Badge>
              </div>
            )}
            {call.bitrate && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Bitrate:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{call.bitrate} kbps</span>
              </div>
            )}
            {call.jitter !== null && call.jitter !== undefined && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Jitter:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{call.jitter}ms</span>
              </div>
            )}
            {call.packetLoss && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Packet Loss:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{call.packetLoss}%</span>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-semibold mb-4 text-gray-900 dark:text-gray-100">Session Details</div>
          <div className="grid grid-cols-1 gap-3">
            {call.sipCallId && (
              <div className="flex flex-col space-y-1">
                <span className="text-xs text-gray-600 dark:text-gray-400">SIP Call ID:</span>
                <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-900/50 p-2 rounded">
                  <span className="font-mono text-xs text-gray-900 dark:text-gray-100 truncate">{call.sipCallId}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(call.sipCallId!, 'SIP Call ID')}
                    className="h-6 w-6 p-0 ml-2 flex-shrink-0"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            )}
            {call.conferenceId && (
              <div className="flex flex-col space-y-1">
                <span className="text-xs text-gray-600 dark:text-gray-400">Conference ID:</span>
                <div className="bg-gray-50 dark:bg-gray-900/50 p-2 rounded">
                  <span className="font-mono text-xs text-gray-900 dark:text-gray-100">{call.conferenceId}</span>
                </div>
              </div>
            )}
            {call.userAgent && (
              <div className="flex flex-col space-y-1">
                <span className="text-xs text-gray-600 dark:text-gray-400">User Agent:</span>
                <div className="bg-gray-50 dark:bg-gray-900/50 p-2 rounded">
                  <span className="font-mono text-xs text-gray-900 dark:text-gray-100 break-all">{call.userAgent}</span>
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-semibold mb-4 text-gray-900 dark:text-gray-100">Advanced Details</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {call.hangupReason && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Hangup Reason:</span>
                <Badge variant="outline" className="capitalize">{call.hangupReason.replace('_', ' ')}</Badge>
              </div>
            )}
            {call.dialAttempts && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Dial Attempts:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{call.dialAttempts}</span>
              </div>
            )}
            {call.isParallelDialer !== null && call.isParallelDialer !== undefined && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Parallel Dialer:</span>
                <Badge variant={call.isParallelDialer ? "default" : "secondary"}>
                  {call.isParallelDialer ? 'Yes' : 'No'}
                </Badge>
              </div>
            )}
            {call.lineId && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Line ID:</span>
                <span className="font-mono text-xs text-gray-900 dark:text-gray-100">{call.lineId}</span>
              </div>
            )}
            {call.transferredFrom && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Transferred From:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{call.transferredFrom}</span>
              </div>
            )}
            {call.transferredTo && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Transferred To:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{call.transferredTo}</span>
              </div>
            )}
            {call.droppedReason && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Dropped Reason:</span>
                <Badge variant="destructive" className="text-xs">{call.droppedReason}</Badge>
              </div>
            )}
            {call.amdComment && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">AMD Details:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100 text-xs">{call.amdComment}</span>
              </div>
            )}
          </div>
        </Card>

        {(call.createdAt || call.connectionTime || call.updatedAt) && (
          <Card className="p-4">
            <div className="text-sm font-semibold mb-4 text-gray-900 dark:text-gray-100">Timestamps</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {call.createdAt && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Call Started:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {format(new Date(call.createdAt), 'MMM d, HH:mm:ss')}
                  </span>
                </div>
              )}
              {call.connectionTime && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Connected At:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {format(new Date(call.connectionTime), 'MMM d, HH:mm:ss')}
                  </span>
                </div>
              )}
              {call.updatedAt && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Last Updated:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {format(new Date(call.updatedAt), 'MMM d, HH:mm:ss')}
                  </span>
                </div>
              )}
            </div>
          </Card>
        )}
      </TabsContent>
    </Tabs>
    </div>
  );
}
