import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Phone, CircleDot, Loader2, PhoneOutgoing, CheckCircle2, PhoneCall, Voicemail, Volume2, XOctagon, PhoneOff, XCircle, Building2, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ParallelCallLine } from "@shared/parallelDialerTypes";

interface ActiveLinesPanelProps {
  callLines: ParallelCallLine[];
  isDialing: boolean;
  isPaused: boolean;
  onDisconnect: (callSid: string, lineId: string) => void;
}

export function ActiveLinesPanel({ callLines, isDialing, isPaused, onDisconnect }: ActiveLinesPanelProps) {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
        icon: <CheckCircle2 className="w-4 h-4 text-sky-600" />,
        label: 'Completed'
      },
    };
    return configs[status] || configs.idle;
  };

  return (
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
                        onClick={() => onDisconnect(line.callSid!, line.id)}
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
  );
}
