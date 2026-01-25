import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useTwilioDeviceV2 } from "@/hooks/useTwilioDeviceV2";
import { useParallelDialerState } from "@/hooks/useParallelDialerState";
import { useParallelDialerEvents } from "@/hooks/useParallelDialerEvents";
import { DialerHeader } from "@/components/dialer/DialerHeader";
import { DialerControls } from "@/components/dialer/DialerControls";
import { DialerSettings } from "@/components/dialer/DialerSettings";
import { DialerQueue } from "@/components/dialer/DialerQueue";
import { ActiveLinesPanel } from "@/components/dialer/ActiveLinesPanel";
import { CompletedCallsPanel } from "@/components/dialer/CompletedCallsPanel";
import { DialerStats } from "@/components/dialer/DialerStats";
import { ParallelDialerSkeleton } from "@/components/skeletons/ParallelDialerSkeleton";
import type { Contact, ContactList } from "@shared/schema";

export default function ParallelDialerPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isReady, deviceStatus, error: twilioError } = useTwilioDeviceV2();
  
  const {
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
    setIsDialing,
    setIsPaused,
    setSelectedListId,
    setParallelLines,
    setCallLines,
    setQueuedContacts,
    setAmdEnabled,
    setAmdSensitivity,
    setAutoSkipVoicemail,
    setAggressiveDialing,
    setGreetingUrl,
    setShowSettings,
    setStats,
    setFirstConnectTime,
    recordCompletedCall,
    startDialing,
    stopDialing,
    togglePause
  } = useParallelDialerState();

  useEffect(() => {
    console.log('[ParallelDialerPage] Device state:', { isReady, deviceStatus, twilioError });
  }, [isReady, deviceStatus, twilioError]);

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

  useParallelDialerEvents({
    filteredContacts,
    setCallLines,
    setStats,
    setFirstConnectTime,
    recordCompletedCall,
    processedCallSidsRef
  });

  const handleStartDialing = () => {
    if (!selectedListId && filteredContacts.length === 0) {
      toast({
        title: "No contacts",
        description: "Please select a contact list to start dialing.",
        variant: "destructive",
      });
      return;
    }
    startDialing(filteredContacts);
    toast({
      title: "Dialer started",
      description: `Starting to dial ${filteredContacts.length} contacts.`,
    });
  };

  const handleStopDialing = () => {
    stopDialing();
    toast({
      title: "Dialer stopped",
      description: "All dialing activity has been stopped.",
    });
  };

  const handleTogglePause = () => {
    togglePause();
    toast({
      title: !isPaused ? "Dialer paused" : "Dialer resumed",
      description: !isPaused ? "Dialing is paused." : "Dialing has resumed.",
    });
  };

  const disconnectCall = async (callSid: string, lineId: string) => {
    try {
      await apiRequest('POST', '/api/twilio/parallel-dialer/disconnect', { callSid });
      // Optimistically update UI
      setCallLines(prev => prev.map(line => {
        if (line.id === lineId) {
          return { ...line, status: 'completed' };
        }
        return line;
      }));
    } catch (error) {
      console.error('Failed to disconnect call:', error);
    }
  };

  if (!isReady) {
    return <ParallelDialerSkeleton />;
  }

  return (
    <div className="min-h-full w-full bg-background">
      <div className="p-4 md:p-6 space-y-4 max-w-[1800px] mx-auto">
        <DialerHeader 
          isReady={isReady} 
          stats={{
            totalDialed: stats.totalDialed,
            connected: stats.connected,
            connectRate: stats.totalDialed > 0 ? Math.round((stats.connected / stats.totalDialed) * 100) : 0
          }} 
        />

        <DialerControls
          isDialing={isDialing}
          isPaused={isPaused}
          isReady={isReady}
          selectedListId={selectedListId}
          parallelLines={parallelLines}
          contactLists={contactLists}
          contacts={contacts}
          filteredContacts={filteredContacts}
          showSettings={showSettings}
          onListChange={setSelectedListId}
          onLinesChange={setParallelLines}
          onStart={handleStartDialing}
          onStop={handleStopDialing}
          onPause={handleTogglePause}
          onToggleSettings={() => setShowSettings(!showSettings)}
        />

        <DialerSettings
          showSettings={showSettings}
          isDialing={isDialing}
          amdEnabled={amdEnabled}
          autoSkipVoicemail={autoSkipVoicemail}
          aggressiveDialing={aggressiveDialing}
          amdSensitivity={amdSensitivity}
          greetingUrl={greetingUrl}
          onClose={() => setShowSettings(false)}
          onAmdEnabledChange={setAmdEnabled}
          onAutoSkipVoicemailChange={setAutoSkipVoicemail}
          onAggressiveDialingChange={setAggressiveDialing}
          onAmdSensitivityChange={setAmdSensitivity}
          onGreetingUrlChange={setGreetingUrl}
          onSaveGreeting={() => saveGreetingMutation.mutate(greetingUrl)}
          isSavingGreeting={saveGreetingMutation.isPending}
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <DialerQueue 
            queuedContacts={queuedContacts}
            currentContactIndex={currentContactIndex}
            isDialing={isDialing}
          />

          <ActiveLinesPanel 
            callLines={callLines}
            isDialing={isDialing}
            isPaused={isPaused}
            onDisconnect={disconnectCall}
          />

          <CompletedCallsPanel 
            dialedContacts={dialedContacts}
            totalDialed={stats.totalDialed}
          />
        </div>

        <DialerStats stats={stats} />
      </div>
    </div>
  );
}
