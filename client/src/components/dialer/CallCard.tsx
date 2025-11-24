import { Phone, PhoneCall, PhoneOff, Clock, User, Building2, Mail, Briefcase, Circle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CALL_STATE_COLORS, type CallState } from "@shared/parallelDialerTypes";

interface CallCardProps {
  lineId: string;
  contactName: string;
  phoneNumber: string;
  company?: string;
  jobTitle?: string;
  email?: string;
  status: CallState;
  duration?: number;
  attemptCount?: number;
  answeredBy?: string;
  onAccept?: () => void;
  onReject?: () => void;
  onDisposition?: () => void;
  onClick?: () => void;
  priority?: 'high' | 'medium' | 'low';
}

const STATUS_LABELS = {
  queued: 'Queued',
  ringing: 'Ringing',
  connected: 'Connected',
  completed: 'Completed',
  failed: 'Failed',
  busy: 'Busy',
  voicemail: 'Voicemail',
  'no-answer': 'No Answer',
  canceled: 'Canceled'
} as const;

const STATUS_ICONS = {
  queued: Clock,
  ringing: Phone,
  connected: PhoneCall,
  completed: PhoneCall,
  failed: PhoneOff,
  busy: PhoneOff,
  voicemail: PhoneOff,
  'no-answer': PhoneOff,
  canceled: PhoneOff
} as const;

export function CallCard({
  lineId,
  contactName,
  phoneNumber,
  company,
  jobTitle,
  email,
  status,
  duration = 0,
  attemptCount = 1,
  answeredBy,
  onAccept,
  onReject,
  onDisposition,
  onClick,
  priority = 'medium'
}: CallCardProps) {
  const StatusIcon = STATUS_ICONS[status];
  const isActive = status === 'ringing' || status === 'connected';
  const isInteractive = status === 'ringing' && (onAccept || onReject);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const priorityColors = {
    high: 'border-red-500 dark:border-red-600',
    medium: 'border-blue-500 dark:border-blue-600',
    low: 'border-gray-400 dark:border-gray-500'
  };

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-all duration-200 hover:shadow-lg",
        isActive && "ring-2 ring-offset-2",
        status === 'ringing' && "ring-blue-500 dark:ring-blue-600",
        status === 'connected' && "ring-green-500 dark:ring-green-600",
        onClick && "cursor-pointer",
        priorityColors[priority]
      )}
      onClick={onClick}
      data-testid={`card-call-${lineId}`}
    >
      {/* Status Bar */}
      <div className={cn("h-2", CALL_STATE_COLORS[status])} />

      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className={cn(
                "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center",
                CALL_STATE_COLORS[status],
                "text-white dark:text-gray-900"
              )}>
                <StatusIcon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 
                    className="font-semibold text-gray-900 dark:text-white truncate"
                    data-testid={`text-contact-name-${lineId}`}
                  >
                    {contactName}
                  </h3>
                  {priority === 'high' && (
                    <Circle className="w-2 h-2 fill-red-500 text-red-500" />
                  )}
                </div>
                <p 
                  className="text-sm text-gray-500 dark:text-gray-400 truncate"
                  data-testid={`text-phone-${lineId}`}
                >
                  {phoneNumber}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge 
                variant={isActive ? "default" : "secondary"}
                className={cn("text-xs", isActive && CALL_STATE_COLORS[status])}
                data-testid={`badge-status-${lineId}`}
              >
                {STATUS_LABELS[status]}
              </Badge>
              <span className="text-xs text-gray-500 dark:text-gray-400" data-testid={`text-line-id-${lineId}`}>
                {lineId}
              </span>
            </div>
          </div>

          {/* Contact Details */}
          {(company || jobTitle || email) && (
            <div className="space-y-1 text-sm">
              {company && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <Building2 className="w-3 h-3" />
                  <span className="truncate">{company}</span>
                </div>
              )}
              {jobTitle && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <Briefcase className="w-3 h-3" />
                  <span className="truncate">{jobTitle}</span>
                </div>
              )}
              {email && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <Mail className="w-3 h-3" />
                  <span className="truncate">{email}</span>
                </div>
              )}
            </div>
          )}

          {/* Call Info */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-4">
              {duration > 0 && (
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-gray-400" />
                  <span 
                    className="font-mono text-gray-900 dark:text-white"
                    data-testid={`text-duration-${lineId}`}
                  >
                    {formatDuration(duration)}
                  </span>
                </div>
              )}
              {attemptCount > 1 && (
                <span className="text-gray-500 dark:text-gray-400" data-testid={`text-attempts-${lineId}`}>
                  Attempt {attemptCount}
                </span>
              )}
            </div>
            {answeredBy && answeredBy !== 'unknown' && (
              <Badge variant="outline" className="text-xs">
                {answeredBy === 'machine' ? '🤖 Machine' : '👤 Human'}
              </Badge>
            )}
          </div>

          {/* Action Buttons */}
          {isInteractive && (
            <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              {onAccept && (
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAccept();
                  }}
                  className="flex-1 bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800"
                  size="sm"
                  data-testid={`button-accept-${lineId}`}
                >
                  <PhoneCall className="w-4 h-4 mr-2" />
                  Accept
                </Button>
              )}
              {onReject && (
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    onReject();
                  }}
                  variant="destructive"
                  className="flex-1"
                  size="sm"
                  data-testid={`button-reject-${lineId}`}
                >
                  <PhoneOff className="w-4 h-4 mr-2" />
                  Reject
                </Button>
              )}
            </div>
          )}

          {/* Disposition Button */}
          {status === 'connected' && onDisposition && (
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onDisposition();
              }}
              variant="outline"
              className="w-full"
              size="sm"
              data-testid={`button-disposition-${lineId}`}
            >
              Add Disposition
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
