import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Play, Download, Trash2, Search, Settings, Star, Archive, Tag, 
  FileAudio, MessageSquare, BarChart3, Filter, MoreHorizontal,
  Volume2, Eye, Edit, Share, Clock, Database, TrendingUp,
  Headphones, Mic, HardDrive, Cloud, Shield, RefreshCw,
  Activity, Brain, Zap, MicOff
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useWebSocket } from "@/hooks/useWebSocket";
import { InlineAudioPlayer } from "@/components/InlineAudioPlayer";
import { RecordingsPageSkeleton } from "@/components/skeletons/RecordingsPageSkeleton";
import type { Recording } from "@shared/schema";

export default function RecordingsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [directionFilter, setDirectionFilter] = useState("all");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRecordings, setSelectedRecordings] = useState<number[]>([]);
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [activeTab, setActiveTab] = useState("recordings");
  const [playingRecording, setPlayingRecording] = useState<{ recording: Recording; audioUrl: string } | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isConnected } = useWebSocket();

  // Cleanup blob URL on unmount or when playing recording changes
  useEffect(() => {
    return () => {
      if (playingRecording?.audioUrl) {
        URL.revokeObjectURL(playingRecording.audioUrl);
      }
    };
  }, [playingRecording]);

  // Get recordings with filtering (with auto-refresh every 30 seconds)
  const params = new URLSearchParams({
    page: currentPage.toString(),
    limit: "50",
    sortBy,
    sortOrder,
    ...(searchQuery && { search: searchQuery }),
    ...(directionFilter !== "all" && { direction: directionFilter })
  });

  const { data: recordingsData, isLoading } = useQuery({
    queryKey: [`/api/recordings?${params.toString()}`],
    refetchOnWindowFocus: true,
  });

  const { data: stats } = useQuery({
    queryKey: ["/api/recordings/stats"],
    refetchOnWindowFocus: true,
  });

  const recordings = Array.isArray(recordingsData?.recordings) ? recordingsData.recordings : [];
  const totalRecordings = recordingsData?.total || 0;
  const totalPages = recordingsData?.totalPages || 1;

  // Mutations
  const deleteRecordingMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/recordings/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recordings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recordings/stats"] });
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

  const syncRecordingsMutation = useMutation({
    mutationFn: async (options: any) => {
      const response = await apiRequest("POST", "/api/recordings/sync", options);
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recordings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recordings/stats"] });
      toast({
        title: "Sync completed",
        description: `Synced ${data.synced} recordings, downloaded ${data.downloaded} files.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Sync failed",
        description: error.message || "Failed to sync recordings",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setSyncInProgress(false);
    }
  });

  const bulkActionMutation = useMutation({
    mutationFn: async ({ action, recordingIds, data }: { action: string; recordingIds: number[]; data?: any }) => {
      const response = await apiRequest("POST", `/api/recordings/bulk/${action}`, { recordingIds, data });
      return response.json();
    },
    onSuccess: (data: any, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recordings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recordings/stats"] });
      setSelectedRecordings([]);
      toast({
        title: `Bulk ${variables.action} completed`,
        description: `Successfully processed ${data.results.filter((r: any) => r.status !== 'error').length} recordings.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Bulk action failed",
        description: error.message || "Failed to perform bulk action",
        variant: "destructive",
      });
    },
  });

  const generateTranscriptMutation = useMutation({
    mutationFn: async (recordingId: number) => {
      return await apiRequest("POST", `/api/recordings/${recordingId}/transcript`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recordings"] });
      toast({
        title: "Transcript generated",
        description: "Recording transcript has been generated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Transcript generation failed",
        description: error.message || "Failed to generate transcript",
        variant: "destructive",
      });
    },
  });

  const analyzeRecordingMutation = useMutation({
    mutationFn: async (recordingId: number) => {
      return await apiRequest("POST", `/api/recordings/${recordingId}/analyze`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recordings"] });
      toast({
        title: "Analysis completed",
        description: "Recording has been analyzed successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Analysis failed",
        description: error.message || "Failed to analyze recording",
        variant: "destructive",
      });
    },
  });

  // Auto-recording status query
  const { data: autoRecordingStatus } = useQuery({
    queryKey: ["/api/twilio/auto-recording/status"],
    queryFn: async () => {
      const response = await fetch('/api/twilio/auto-recording/status');
      if (!response.ok) throw new Error('Failed to fetch auto-recording status');
      return response.json();
    },
  });

  // Auto-recording toggle mutation
  const toggleAutoRecordingMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await apiRequest("POST", "/api/twilio/auto-recording/toggle", { enabled });
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/twilio/auto-recording/status"] });
      toast({
        title: "Success",
        description: data.message || `Auto-recording ${data.autoRecordingEnabled ? 'enabled' : 'disabled'}`
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to toggle auto-recording",
        variant: "destructive",
      });
    }
  });

  // Recording settings query and mutation
  const { data: recordingSettings } = useQuery({
    queryKey: ["/api/recordings/settings"],
  });

  const updateRecordingSettingMutation = useMutation({
    mutationFn: async ({ setting, value }: { setting: string; value: any }) => {
      const response = await apiRequest("POST", "/api/recordings/settings", { setting, value });
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recordings/settings"] });
      toast({
        title: "Success",
        description: `${data.setting} setting updated successfully`
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update setting",
        variant: "destructive",
      });
    }
  });

  // Helper functions
  const handleSyncRecordings = () => {
    setSyncInProgress(true);
    syncRecordingsMutation.mutate({
      forceRefresh: false,
      downloadToLocal: true,
      generateTranscription: false,
      syncAll: false
    });
  };

  const handleBulkAction = (action: string, data?: any) => {
    if (selectedRecordings.length === 0) {
      toast({
        title: "No recordings selected",
        description: "Please select recordings to perform bulk actions.",
        variant: "destructive",
      });
      return;
    }
    
    bulkActionMutation.mutate({ action, recordingIds: selectedRecordings, data });
  };

  const toggleRecordingSelection = (id: number) => {
    setSelectedRecordings(prev => 
      prev.includes(id) 
        ? prev.filter(recordingId => recordingId !== id)
        : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedRecordings.length === recordings.length) {
      setSelectedRecordings([]);
    } else {
      setSelectedRecordings(recordings.map((r: any) => r.id));
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setDirectionFilter("all");
    setCurrentPage(1);
  };

  // UI Helper functions
  const formatDuration = (duration: number) => {
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const seconds = duration % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return "Unknown";
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'ready': return 'default';
      case 'processing': return 'secondary';
      case 'error': return 'destructive';
      case 'downloading': return 'outline';
      case 'transcribing': return 'outline';
      default: return 'secondary';
    }
  };

  const getSentimentBadgeVariant = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return 'default';
      case 'negative': return 'destructive';
      case 'neutral': return 'secondary';
      default: return 'outline';
    }
  };

  const getInitials = (phone: string) => {
    return phone.slice(-4);
  };

  const handlePlay = async (recording: Recording) => {
    try {
      // Close any currently playing recording
      if (playingRecording?.audioUrl) {
        URL.revokeObjectURL(playingRecording.audioUrl);
      }

      // Use apiRequest which handles auth properly
      const response = await apiRequest("GET", `/api/recordings/${recording.id}/play`);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      // Set the playing recording with audio URL
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
      // Use apiRequest which handles auth properly
      const response = await apiRequest("GET", `/api/recordings/${recording.id}/download`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `recording_${recording.twilioRecordingSid}_${recording.phone}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to download recording",
        variant: "destructive",
      });
    }
  };

  const handleDelete = (recording: Recording) => {
    if (window.confirm("Are you sure you want to delete this recording?")) {
      deleteRecordingMutation.mutate(recording.id);
    }
  };

  if (isLoading) {
    return <RecordingsPageSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleSyncRecordings}
            disabled={syncInProgress}
            className="gap-2"
            data-testid="button-sync-recordings"
          >
            {syncInProgress ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Sync from Twilio
              </>
            )}
          </Button>
          <Button variant="outline" onClick={clearFilters} className="gap-2" data-testid="button-clear-filters">
            <Filter className="h-4 w-4" />
            Clear Filters
          </Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm">Total</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
                <FileAudio className="h-6 w-6 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm">Duration</p>
                  <p className="text-2xl font-bold">{formatDuration(stats.totalDuration)}</p>
                </div>
                <Clock className="h-6 w-6 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm">Storage</p>
                  <p className="text-2xl font-bold">{formatFileSize(stats.totalSize)}</p>
                </div>
                <HardDrive className="h-6 w-6 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm">Ready</p>
                  <p className="text-2xl font-bold">{stats.byStatus?.ready || 0}</p>
                </div>
                <Activity className="h-6 w-6 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="recordings" className="gap-2">
            <FileAudio className="h-4 w-4" />
            Recordings ({totalRecordings})
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="recordings" className="space-y-4">
          <Card>
            <CardHeader>
              {selectedRecordings.length > 0 && (
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-sm text-muted-foreground">
                    {selectedRecordings.length} selected
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleBulkAction('star')}
                    className="gap-1"
                  >
                    <Star className="h-3 w-3" />
                    Star
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleBulkAction('archive')}
                    className="gap-1"
                  >
                    <Archive className="h-3 w-3" />
                    Archive
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleBulkAction('delete')}
                    className="gap-1 text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete
                  </Button>
                </div>
              )}
              
              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4">
                <div className="relative md:col-span-2">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search recordings..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-recordings"
                  />
                </div>
                
                <Select value={directionFilter} onValueChange={setDirectionFilter}>
                  <SelectTrigger data-testid="select-direction-filter">
                    <SelectValue placeholder="Direction" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Directions</SelectItem>
                    <SelectItem value="inbound">Inbound</SelectItem>
                    <SelectItem value="outbound">Outbound</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger data-testid="select-sort-by">
                    <SelectValue placeholder="Sort By" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="createdAt">Newest</SelectItem>
                    <SelectItem value="duration">Duration</SelectItem>
                    <SelectItem value="phone">Phone</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedRecordings.length === recordings.length && recordings.length > 0}
                          onCheckedChange={toggleSelectAll}
                          data-testid="checkbox-select-all"
                        />
                      </TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recordings.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12">
                          <div className="flex flex-col items-center gap-4">
                            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                              <FileAudio className="h-8 w-8 text-muted-foreground" />
                            </div>
                            <div>
                              <h3 className="font-medium">No recordings found</h3>
                              <p className="text-sm text-muted-foreground">
                                Try adjusting your filters or sync recordings from Twilio
                              </p>
                            </div>
                            <Button onClick={handleSyncRecordings} className="gap-2">
                              <RefreshCw className="h-4 w-4" />
                              Sync Recordings
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      recordings.map((recording: any) => (
                        <>
                          <TableRow key={recording.id} className="group hover:bg-muted/50" data-testid={`row-recording-${recording.id}`}>
                            <TableCell>
                              <Checkbox
                                checked={selectedRecordings.includes(recording.id)}
                                onCheckedChange={() => toggleRecordingSelection(recording.id)}
                                data-testid={`checkbox-recording-${recording.id}`}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  {recording.direction === 'inbound' ? 
                                    <span className="text-xs">←</span> : 
                                    <span className="text-xs">→</span>
                                  }
                                </div>
                                <div>
                                  <div className="font-medium">{recording.phone}</div>
                                  {recording.callerName && (
                                    <div className="text-xs text-muted-foreground">{recording.callerName}</div>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm font-medium">{formatDuration(recording.duration)}</span>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                {recording.createdAt ? formatDistanceToNow(new Date(recording.createdAt), { addSuffix: true }) : 'Unknown'}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Badge variant={getStatusBadgeVariant(recording.status || 'unknown')} className="text-xs">
                                  {recording.status || 'Unknown'}
                                </Badge>
                                {recording.transcript && (
                                  <MessageSquare className="h-3 w-3 text-green-500" />
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end space-x-1">
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
                              
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                                    <Eye className="h-3 w-3" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-4xl">
                                  <DialogHeader>
                                    <DialogTitle>Recording Details</DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <Label>Phone Number</Label>
                                        <p className="text-sm">{recording.phone}</p>
                                      </div>
                                      <div>
                                        <Label>Duration</Label>
                                        <p className="text-sm">{formatDuration(recording.duration)}</p>
                                      </div>
                                      <div>
                                        <Label>Date</Label>
                                        <p className="text-sm">
                                          {recording.createdAt ? format(new Date(recording.createdAt), "PPP") : 'Unknown'}
                                        </p>
                                      </div>
                                      <div>
                                        <Label>File Size</Label>
                                        <p className="text-sm">{formatFileSize(recording.fileSize || 0)}</p>
                                      </div>
                                    </div>
                                    {recording.transcript && (
                                      <div>
                                        <Label>Transcript</Label>
                                        <div className="bg-muted p-4 rounded-lg mt-2 max-h-40 overflow-y-auto">
                                          <p className="text-sm">{recording.transcript}</p>
                                        </div>
                                      </div>
                                    )}
                                    {recording.summary && (
                                      <div>
                                        <Label>AI Summary</Label>
                                        <div className="bg-muted p-4 rounded-lg mt-2">
                                          <p className="text-sm">{recording.summary}</p>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </DialogContent>
                              </Dialog>
                              
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDelete(recording)}
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
                          </TableCell>
                        </TableRow>
                        
                        {/* Inline Audio Player - Shows below the recording row when playing */}
                        {playingRecording?.recording.id === recording.id && playingRecording && (
                          <TableRow>
                            <TableCell colSpan={6} className="p-0 border-0">
                              <div className="px-4 py-3">
                                <InlineAudioPlayer
                                  recording={playingRecording.recording}
                                  audioUrl={playingRecording.audioUrl}
                                  onClose={handleClosePlayer}
                                  onDownload={() => handleDownload(recording)}
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {((currentPage - 1) * 50) + 1} to {Math.min(currentPage * 50, totalRecordings)} of {totalRecordings} recordings
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <span className="text-sm">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Recording Analytics Dashboard
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <BarChart3 className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-medium mb-2">Analytics Dashboard Coming Soon</h3>
                <p className="text-sm text-muted-foreground">
                  Advanced analytics with call sentiment analysis, trend reports, and performance metrics.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Recording System Settings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <h3 className="font-medium mb-3">Call Recording Settings</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium flex items-center gap-2">
                          <Mic className="h-4 w-4" />
                          Auto-record calls
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {autoRecordingStatus?.autoRecordingEnabled 
                            ? "All calls are being recorded automatically" 
                            : "Call recording is disabled to save Twilio costs"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {toggleAutoRecordingMutation.isPending ? (
                          <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleAutoRecordingMutation.mutate(!autoRecordingStatus?.autoRecordingEnabled)}
                            className={autoRecordingStatus?.autoRecordingEnabled ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}
                          >
                            {autoRecordingStatus?.autoRecordingEnabled ? (
                              <>
                                <Mic className="h-3 w-3 mr-1" />
                                Recording ON
                              </>
                            ) : (
                              <>
                                <MicOff className="h-3 w-3 mr-1" />
                                Recording OFF
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                <div>
                  <h3 className="font-medium mb-3">Sync Settings</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Auto-sync from Twilio</p>
                        <p className="text-sm text-muted-foreground">Automatically fetch new recordings</p>
                      </div>
                      {updateRecordingSettingMutation.isPending ? (
                        <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateRecordingSettingMutation.mutate({ 
                            setting: 'autoSync', 
                            value: !recordingSettings?.autoSync 
                          })}
                          className={recordingSettings?.autoSync ? "bg-green-100 text-green-700" : ""}
                          data-testid="button-auto-sync"
                        >
                          {recordingSettings?.autoSync ? "ON" : "OFF"}
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Download recordings locally</p>
                        <p className="text-sm text-muted-foreground">Store files on server for faster access</p>
                      </div>
                      {updateRecordingSettingMutation.isPending ? (
                        <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateRecordingSettingMutation.mutate({ 
                            setting: 'downloadLocal', 
                            value: !recordingSettings?.downloadLocal 
                          })}
                          className={recordingSettings?.downloadLocal ? "bg-green-100 text-green-700" : ""}
                          data-testid="button-download-local"
                        >
                          {recordingSettings?.downloadLocal ? "ON" : "OFF"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                <div>
                  <h3 className="font-medium mb-3">AI Processing</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Auto-generate transcripts</p>
                        <p className="text-sm text-muted-foreground">Automatically transcribe new recordings</p>
                      </div>
                      {updateRecordingSettingMutation.isPending ? (
                        <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateRecordingSettingMutation.mutate({ 
                            setting: 'autoTranscript', 
                            value: !recordingSettings?.autoTranscript 
                          })}
                          className={recordingSettings?.autoTranscript ? "bg-green-100 text-green-700" : ""}
                          data-testid="button-auto-transcript"
                        >
                          {recordingSettings?.autoTranscript ? "ON" : "OFF"}
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Sentiment analysis</p>
                        <p className="text-sm text-muted-foreground">Analyze call sentiment automatically</p>
                      </div>
                      {updateRecordingSettingMutation.isPending ? (
                        <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateRecordingSettingMutation.mutate({ 
                            setting: 'sentimentAnalysis', 
                            value: !recordingSettings?.sentimentAnalysis 
                          })}
                          className={recordingSettings?.sentimentAnalysis ? "bg-green-100 text-green-700" : ""}
                          data-testid="button-sentiment-analysis"
                        >
                          {recordingSettings?.sentimentAnalysis ? "ON" : "OFF"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                <div>
                  <h3 className="font-medium mb-3">Storage Management</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Retention period</p>
                        <p className="text-sm text-muted-foreground">How long to keep recordings</p>
                      </div>
                      <Select 
                        value={recordingSettings?.retentionPeriod || "1year"}
                        onValueChange={(value) => updateRecordingSettingMutation.mutate({ 
                          setting: 'retentionPeriod', 
                          value 
                        })}
                      >
                        <SelectTrigger className="w-32" data-testid="select-retention-period">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="30days">30 Days</SelectItem>
                          <SelectItem value="90days">90 Days</SelectItem>
                          <SelectItem value="1year">1 Year</SelectItem>
                          <SelectItem value="forever">Forever</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
