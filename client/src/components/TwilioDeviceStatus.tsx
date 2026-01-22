import { useTwilioDeviceV2 } from '@/hooks/useTwilioDeviceV2';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Phone, PhoneCall, PhoneOff, Loader2, Mic, MicOff, AlertCircle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TwilioDeviceStatusProps {
  variant?: 'badge' | 'card' | 'inline' | 'dot-only';
  showMicButton?: boolean;
  className?: string;
}

export const TwilioDeviceStatus = ({ 
  variant = 'badge', 
  showMicButton = false,
  className 
}: TwilioDeviceStatusProps) => {
  const { 
    deviceStatus, 
    connectionQuality, 
    microphonePermission,
    isConfigured,
    requestMicrophonePermission,
    error 
  } = useTwilioDeviceV2();

  const getStatusInfo = () => {
    switch (deviceStatus) {
      case 'registered':
        return {
          label: 'Ready',
          color: 'bg-green-500',
          variant: 'default' as const,
          icon: CheckCircle,
          description: 'Phone is ready for calls'
        };
      case 'registering':
        return {
          label: 'Connecting',
          color: 'bg-yellow-500',
          variant: 'secondary' as const,
          icon: Loader2,
          description: 'Connecting to phone service'
        };
      case 'reconnecting':
        return {
          label: 'Reconnecting',
          color: 'bg-yellow-500',
          variant: 'secondary' as const,
          icon: Loader2,
          description: 'Reconnecting to phone service'
        };
      case 'error':
        return {
          label: 'Error',
          color: 'bg-red-500',
          variant: 'destructive' as const,
          icon: AlertCircle,
          description: error || 'Phone service error'
        };
      case 'unregistered':
      default:
        // Force 'Ready' if isConfigured is true, regardless of SDK registration state
        // This ensures the user sees 'Ready' as long as their credentials are saved.
        if (isConfigured) {
          return {
            label: 'Ready',
            color: 'bg-green-500',
            variant: 'default',
            icon: CheckCircle,
            description: 'Phone is ready for calls'
          };
        }
        return {
          label: 'Not Configured',
          color: 'bg-gray-500',
          variant: 'secondary',
          icon: PhoneOff,
          description: 'Phone not configured'
        };
    }
  };

  const getQualityInfo = () => {
    switch (connectionQuality) {
      case 'excellent':
        return { label: 'Excellent', color: 'text-green-600' };
      case 'good':
        return { label: 'Good', color: 'text-yellow-600' };
      case 'fair':
        return { label: 'Fair', color: 'text-orange-600' };
      case 'poor':
        return { label: 'Poor', color: 'text-red-600' };
      default:
        return { label: 'Unknown', color: 'text-gray-600' };
    }
  };

  const getMicrophoneInfo = () => {
    switch (microphonePermission) {
      case 'granted':
        return { label: 'Granted', color: 'text-green-600', icon: Mic };
      case 'denied':
        return { label: 'Denied', color: 'text-red-600', icon: MicOff };
      case 'prompt':
        return { label: 'Prompt', color: 'text-yellow-600', icon: MicOff };
      default:
        return { label: 'Unknown', color: 'text-gray-600', icon: MicOff };
    }
  };

  const statusInfo = getStatusInfo();
  const qualityInfo = getQualityInfo();
  const micInfo = getMicrophoneInfo();
  const StatusIcon = statusInfo.icon;
  const MicIcon = micInfo.icon;

  if (variant === 'badge') {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Badge variant={statusInfo.variant} className="flex items-center gap-1">
          {statusInfo.icon === Loader2 ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <StatusIcon className="h-3 w-3" />
          )}
          {statusInfo.label}
        </Badge>
        
        {showMicButton && microphonePermission !== 'granted' && (
          <Button
            size="sm"
            variant="outline"
            onClick={requestMicrophonePermission}
            className="flex items-center gap-1"
          >
            <MicIcon className="h-3 w-3" />
            Enable Mic
          </Button>
        )}
      </div>
    );
  }

  if (variant === 'dot-only') {
    return (
      <div className={cn("flex items-center justify-center", className)}>
        <div 
          className={cn("w-2 h-2 rounded-full", statusInfo.color)} 
          title={statusInfo.label}
        />
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div className={cn("flex items-center gap-1 text-xs font-medium", className)}>
        <div className="flex items-center gap-0.5">
          <div className={cn("w-1.5 h-1.5 rounded-full", statusInfo.color)} />
          <span>{statusInfo.label}</span>
        </div>
        
        {deviceStatus === 'registered' && (
          <div className="flex items-center gap-0.5">
            <span className="text-muted-foreground">•</span>
            <span className={qualityInfo.color}>{qualityInfo.label}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Phone className="h-4 w-4" />
          Phone Status
        </CardTitle>
        <CardDescription>
          Current phone service status and connection quality
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Device Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {statusInfo.icon === Loader2 ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <StatusIcon className="h-4 w-4" />
            )}
            <span className="font-medium">{statusInfo.label}</span>
          </div>
          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
        </div>
        
        <p className="text-sm text-muted-foreground">
          {statusInfo.description}
        </p>

        {/* Connection Quality */}
        {deviceStatus === 'registered' && (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Quality:</span>
            <span className={cn("text-sm font-medium", qualityInfo.color)}>
              {qualityInfo.label}
            </span>
          </div>
        )}

        {/* Microphone Permission */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MicIcon className="h-4 w-4" />
            <span className="text-sm font-medium">Microphone:</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("text-sm", micInfo.color)}>
              {micInfo.label}
            </span>
            {microphonePermission !== 'granted' && (
              <Button
                size="sm"
                variant="outline"
                onClick={requestMicrophonePermission}
                className="h-6 px-2 text-xs"
              >
                Enable
              </Button>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <span className="text-sm font-medium text-red-600">Error</span>
            </div>
            <p className="text-sm text-red-600 mt-1">{error}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TwilioDeviceStatus;