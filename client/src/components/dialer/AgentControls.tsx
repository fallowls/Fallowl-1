import { Play, Pause, Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, PhoneForwarded, Calendar, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface AgentControlsProps {
  isDialing: boolean;
  isPaused: boolean;
  isOnCall: boolean;
  isMuted: boolean;
  isHolding: boolean;
  onStartDialing?: () => void;
  onStopDialing?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onMute?: () => void;
  onUnmute?: () => void;
  onHold?: () => void;
  onResumeCall?: () => void;
  onTransfer?: (type: 'warm' | 'cold') => void;
  onEndCall?: () => void;
  onAddNote?: () => void;
  onSetDisposition?: (disposition: string) => void;
  onScheduleCallback?: () => void;
}

const DISPOSITIONS = [
  { value: 'answered', label: 'Answered - Interested' },
  { value: 'not-interested', label: 'Answered - Not Interested' },
  { value: 'callback', label: 'Request Callback' },
  { value: 'voicemail', label: 'Voicemail' },
  { value: 'no-answer', label: 'No Answer' },
  { value: 'busy', label: 'Busy' },
  { value: 'wrong-number', label: 'Wrong Number' },
  { value: 'dnc', label: 'Do Not Call' },
  { value: 'qualified', label: 'Qualified Lead' },
  { value: 'meeting-scheduled', label: 'Meeting Scheduled' }
];

export function AgentControls({
  isDialing,
  isPaused,
  isOnCall,
  isMuted,
  isHolding,
  onStartDialing,
  onStopDialing,
  onPause,
  onResume,
  onMute,
  onUnmute,
  onHold,
  onResumeCall,
  onTransfer,
  onEndCall,
  onAddNote,
  onSetDisposition,
  onScheduleCallback
}: AgentControlsProps) {
  return (
    <Card className="bg-white dark:bg-gray-800" data-testid="card-agent-controls">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
          Agent Controls
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Dialer Controls */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Dialer</p>
          <div className="grid grid-cols-2 gap-2">
            {!isDialing ? (
              <Button
                onClick={onStartDialing}
                className="w-full bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800"
                data-testid="button-start-dialing"
              >
                <Play className="w-4 h-4 mr-2" />
                Start
              </Button>
            ) : (
              <Button
                onClick={onStopDialing}
                variant="destructive"
                className="w-full"
                data-testid="button-stop-dialing"
              >
                <PhoneOff className="w-4 h-4 mr-2" />
                Stop
              </Button>
            )}
            
            {isDialing && (
              <Button
                onClick={isPaused ? onResume : onPause}
                variant="outline"
                className="w-full"
                data-testid={isPaused ? "button-resume-dialing" : "button-pause-dialing"}
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
            )}
          </div>
        </div>

        {/* Call Controls - Only show when on an active call */}
        {isOnCall && (
          <>
            <div className="space-y-2 pt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Active Call</p>
              <div className="grid grid-cols-2 gap-2">
                {/* Mute/Unmute */}
                <Button
                  onClick={isMuted ? onUnmute : onMute}
                  variant={isMuted ? "destructive" : "outline"}
                  className="w-full"
                  data-testid={isMuted ? "button-unmute" : "button-mute"}
                >
                  {isMuted ? (
                    <>
                      <MicOff className="w-4 h-4 mr-2" />
                      Unmute
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4 mr-2" />
                      Mute
                    </>
                  )}
                </Button>

                {/* Hold/Resume */}
                <Button
                  onClick={isHolding ? onResumeCall : onHold}
                  variant={isHolding ? "default" : "outline"}
                  className={cn(
                    "w-full",
                    isHolding && "bg-yellow-600 hover:bg-yellow-700 dark:bg-yellow-700 dark:hover:bg-yellow-800"
                  )}
                  data-testid={isHolding ? "button-resume-call" : "button-hold"}
                >
                  {isHolding ? (
                    <>
                      <Volume2 className="w-4 h-4 mr-2" />
                      Resume
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-4 h-4 mr-2" />
                      Hold
                    </>
                  )}
                </Button>
              </div>

              {/* Transfer */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => onTransfer?.('warm')}
                  variant="outline"
                  className="w-full"
                  data-testid="button-warm-transfer"
                >
                  <PhoneForwarded className="w-4 h-4 mr-2" />
                  Warm Transfer
                </Button>
                <Button
                  onClick={() => onTransfer?.('cold')}
                  variant="outline"
                  className="w-full"
                  data-testid="button-cold-transfer"
                >
                  <PhoneForwarded className="w-4 h-4 mr-2" />
                  Cold Transfer
                </Button>
              </div>

              {/* End Call */}
              <Button
                onClick={onEndCall}
                variant="destructive"
                className="w-full"
                data-testid="button-end-call"
              >
                <PhoneOff className="w-4 h-4 mr-2" />
                End Call
              </Button>
            </div>

            {/* Post-Call Actions */}
            <div className="space-y-2 pt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Post-Call</p>
              
              {/* Disposition */}
              <Select onValueChange={onSetDisposition}>
                <SelectTrigger className="w-full" data-testid="select-disposition">
                  <SelectValue placeholder="Select Disposition" />
                </SelectTrigger>
                <SelectContent>
                  {DISPOSITIONS.map((disposition) => (
                    <SelectItem key={disposition.value} value={disposition.value}>
                      {disposition.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="grid grid-cols-2 gap-2">
                {/* Add Note */}
                <Button
                  onClick={onAddNote}
                  variant="outline"
                  className="w-full"
                  data-testid="button-add-note"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Add Note
                </Button>

                {/* Schedule Callback */}
                <Button
                  onClick={onScheduleCallback}
                  variant="outline"
                  className="w-full"
                  data-testid="button-schedule-callback"
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Callback
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Keyboard Shortcuts */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            Keyboard Shortcuts
          </p>
          <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
            <div className="flex justify-between">
              <span>Start/Stop</span>
              <kbd className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">Ctrl+S</kbd>
            </div>
            <div className="flex justify-between">
              <span>Pause/Resume</span>
              <kbd className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">Ctrl+P</kbd>
            </div>
            <div className="flex justify-between">
              <span>Mute</span>
              <kbd className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">Ctrl+M</kbd>
            </div>
            <div className="flex justify-between">
              <span>End Call</span>
              <kbd className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">Ctrl+E</kbd>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
