import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Play, Pause, Download, Phone, Trash2, Search, Archive, ArchiveRestore, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Voicemail } from "@shared/schema";
import { useWebSocket } from "@/hooks/useWebSocket";

export default function VoicemailPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Initialize WebSocket for real-time updates
  useWebSocket();

  const { data: voicemails = [], isLoading } = useQuery<Voicemail[]>({
    queryKey: ["/api/voicemails"],
  });

  const updateVoicemailMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Voicemail> }) => {
      await apiRequest("PUT", `/api/voicemails/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/voicemails"] });
      queryClient.invalidateQueries({ queryKey: ["/api/voicemails/unread/count"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update voicemail",
        variant: "destructive",
      });
    },
  });

  const deleteVoicemailMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/voicemails/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/voicemails"] });
      queryClient.invalidateQueries({ queryKey: ["/api/voicemails/unread/count"] });
      toast({
        title: "Voicemail deleted",
        description: "Voicemail has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete voicemail",
        variant: "destructive",
      });
    },
  });

  const filteredVoicemails = voicemails.filter(voicemail => {
    const matchesSearch = !searchQuery || 
      voicemail.phone.includes(searchQuery) ||
      (voicemail.transcription && voicemail.transcription.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesFilter = 
      (filter === "all" && !voicemail.isArchived) || 
      (filter === "unread" && !voicemail.isRead && !voicemail.isArchived) ||
      (filter === "read" && voicemail.isRead && !voicemail.isArchived) ||
      (filter === "archived" && voicemail.isArchived);
    
    return matchesSearch && matchesFilter;
  });

  const formatDuration = (duration: number) => {
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getInitials = (phone: string) => {
    return phone.slice(-4);
  };

  const handlePlay = (voicemail: Voicemail) => {
    if (playingId === voicemail.id) {
      if (audioRef.current?.paused) {
        audioRef.current.play();
      } else {
        audioRef.current?.pause();
      }
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    setPlayingId(voicemail.id);
    setCurrentTime(0);

    const audio = new Audio(voicemail.fileUrl);
    audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
    audio.onended = () => {
      setPlayingId(null);
      setCurrentTime(0);
    };
    audio.play();
    audioRef.current = audio;

    if (!voicemail.isRead) {
      updateVoicemailMutation.mutate({ id: voicemail.id, data: { isRead: true } });
    }
  };

  const handleToggleArchive = (voicemail: Voicemail) => {
    updateVoicemailMutation.mutate({ 
      id: voicemail.id, 
      data: { isArchived: !voicemail.isArchived } 
    });
    toast({
      title: voicemail.isArchived ? "Voicemail restored" : "Voicemail archived",
      description: `Voicemail from ${voicemail.phone} has been ${voicemail.isArchived ? 'restored' : 'archived'}.`,
    });
  };

  const handleMarkAsRead = (voicemail: Voicemail) => {
    updateVoicemailMutation.mutate({ id: voicemail.id, data: { isRead: true } });
  };

  const handleDownload = (voicemail: Voicemail) => {
    window.open(voicemail.fileUrl, '_blank');
  };

  const handleCallBack = (voicemail: Voicemail) => {
    toast({
      title: "Calling back",
      description: `Calling ${voicemail.phone}`,
    });
    // Integration with dialer would go here
  };

  const handleDelete = (voicemail: Voicemail) => {
    if (window.confirm("Are you sure you want to delete this voicemail?")) {
      deleteVoicemailMutation.mutate(voicemail.id);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Voicemail</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-gray-50 rounded-lg p-4 animate-pulse">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center">
                    <div className="w-12 h-12 bg-gray-300 rounded-full"></div>
                    <div className="ml-3">
                      <div className="w-24 h-4 bg-gray-300 rounded"></div>
                      <div className="w-32 h-3 bg-gray-300 rounded mt-1"></div>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <div className="w-16 h-6 bg-gray-300 rounded"></div>
                    <div className="w-16 h-8 bg-gray-300 rounded"></div>
                  </div>
                </div>
                <div className="w-full h-2 bg-gray-300 rounded mb-3"></div>
                <div className="flex space-x-2">
                  <div className="w-20 h-6 bg-gray-300 rounded"></div>
                  <div className="w-20 h-6 bg-gray-300 rounded"></div>
                  <div className="w-16 h-6 bg-gray-300 rounded"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <CardTitle>Voicemail</CardTitle>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Input
                placeholder="Search voicemails..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            </div>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Inbox</SelectItem>
                <SelectItem value="unread">Unread</SelectItem>
                <SelectItem value="read">Read</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredVoicemails.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <div className="mb-4 flex justify-center">
              <Archive className="w-12 h-12 text-gray-300" />
            </div>
            <p className="text-lg font-medium">No voicemails found</p>
            <p className="text-sm">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredVoicemails.map((voicemail) => (
              <div
                key={voicemail.id}
                className={`rounded-lg p-4 border transition-all ${
                  voicemail.isRead 
                    ? 'bg-white border-gray-200' 
                    : 'bg-blue-50/50 border-blue-200 shadow-sm'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      voicemail.isRead ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-600'
                    }`}>
                      <span className="font-bold">
                        {getInitials(voicemail.phone)}
                      </span>
                    </div>
                    <div className="ml-3">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-gray-900">{voicemail.phone}</p>
                        {!voicemail.isRead && (
                          <Badge className="bg-blue-600 text-white hover:bg-blue-700">New</Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        {voicemail.createdAt ? format(new Date(voicemail.createdAt), 'MMM d, yyyy \'at\' h:mm a') : 'Unknown time'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => handlePlay(voicemail)}
                      className={`${
                        playingId === voicemail.id 
                          ? 'bg-orange-500 hover:bg-orange-600' 
                          : 'bg-blue-600 hover:bg-blue-700'
                      } text-white px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2`}
                    >
                      {playingId === voicemail.id && !audioRef.current?.paused ? (
                        <><Pause className="w-4 h-4" /> Pause</>
                      ) : (
                        <><Play className="w-4 h-4" /> Play</>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleCallBack(voicemail)}
                      title="Call Back"
                      className="text-blue-600 border-blue-200 hover:bg-blue-50"
                    >
                      <Phone className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                
                {/* Audio Progress Bar */}
                {playingId === voicemail.id && (
                  <div className="mt-4 space-y-1">
                    <div className="flex justify-between text-[10px] text-gray-500">
                      <span>{formatDuration(Math.floor(currentTime))}</span>
                      <span>{formatDuration(voicemail.duration)}</span>
                    </div>
                    <Progress 
                      value={(currentTime / voicemail.duration) * 100} 
                      className="h-1.5 bg-gray-100" 
                    />
                  </div>
                )}

                {/* Transcription Section */}
                <div className="mt-4 bg-gray-50 rounded-md p-3 border border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Transcription</p>
                  {voicemail.transcriptionStatus === 'completed' ? (
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {voicemail.transcription}
                    </p>
                  ) : voicemail.transcriptionStatus === 'processing' ? (
                    <p className="text-sm text-gray-500 italic flex items-center gap-2">
                      <span className="animate-pulse">Transcribing...</span>
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400 italic">
                      Transcription not available
                    </p>
                  )}
                </div>
                
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(voicemail)}
                      className="text-xs text-gray-600 hover:text-blue-600 h-8"
                    >
                      <Download className="w-3.5 h-3.5 mr-1.5" />
                      Download
                    </Button>
                    {!voicemail.isRead && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleMarkAsRead(voicemail)}
                        className="text-xs text-gray-600 hover:text-green-600 h-8"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                        Mark Read
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleArchive(voicemail)}
                      className="text-xs text-gray-600 hover:text-orange-600 h-8"
                    >
                      {voicemail.isArchived ? (
                        <><ArchiveRestore className="w-3.5 h-3.5 mr-1.5" /> Restore</>
                      ) : (
                        <><Archive className="w-3.5 h-3.5 mr-1.5" /> Archive</>
                      )}
                    </Button>
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(voicemail)}
                    className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 h-8"
                    disabled={deleteVoicemailMutation.isPending}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
