import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Settings, ChevronUp, Mic, SkipForward, Zap, Save } from "lucide-react";

interface DialerSettingsProps {
  showSettings: boolean;
  isDialing: boolean;
  amdEnabled: boolean;
  autoSkipVoicemail: boolean;
  aggressiveDialing: boolean;
  amdSensitivity: 'standard' | 'high' | 'low';
  greetingUrl: string;
  onClose: () => void;
  onAmdEnabledChange: (value: boolean) => void;
  onAutoSkipVoicemailChange: (value: boolean) => void;
  onAggressiveDialingChange: (value: boolean) => void;
  onAmdSensitivityChange: (value: 'standard' | 'high' | 'low') => void;
  onGreetingUrlChange: (value: string) => void;
  onSaveGreeting: () => void;
  isSavingGreeting: boolean;
}

export function DialerSettings({
  showSettings,
  isDialing,
  amdEnabled,
  autoSkipVoicemail,
  aggressiveDialing,
  amdSensitivity,
  greetingUrl,
  onClose,
  onAmdEnabledChange,
  onAutoSkipVoicemailChange,
  onAggressiveDialingChange,
  onAmdSensitivityChange,
  onGreetingUrlChange,
  onSaveGreeting,
  isSavingGreeting
}: DialerSettingsProps) {
  if (!showSettings) return null;

  return (
    <Card className="rounded-[16px] border border-gray-200 dark:border-gray-800 shadow-[0_4px_14px_rgba(0,0,0,0.06)] animate-in slide-in-from-top-2 duration-200">
      <CardHeader className="pb-3 px-4 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2 font-bold text-gray-900 dark:text-white">
            <div className="p-2 rounded-[12px] bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900">
              <Settings className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </div>
            Dialer Settings
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <ChevronUp className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* AMD Toggle */}
          <div className="flex items-center justify-between p-3 rounded-[12px] border bg-card">
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <div>
                <Label className="text-sm font-medium">AMD Detection</Label>
                <p className="text-xs text-muted-foreground">Auto-detect voicemails</p>
              </div>
            </div>
            <Switch
              checked={amdEnabled}
              onCheckedChange={onAmdEnabledChange}
              disabled={isDialing}
              data-testid="switch-amd-enabled"
            />
          </div>

          {/* Auto-Skip Voicemail */}
          <div className="flex items-center justify-between p-3 rounded-[12px] border bg-card">
            <div className="flex items-center gap-2">
              <SkipForward className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <div>
                <Label className="text-sm font-medium">Auto-Skip VM</Label>
                <p className="text-xs text-muted-foreground">Skip voicemails</p>
              </div>
            </div>
            <Switch
              checked={autoSkipVoicemail}
              onCheckedChange={onAutoSkipVoicemailChange}
              disabled={isDialing}
              data-testid="switch-auto-skip-voicemail"
            />
          </div>

          {/* Aggressive Mode */}
          <div className="flex items-center justify-between p-3 rounded-[12px] border bg-card">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <div>
                <Label className="text-sm font-medium">Aggressive (2x)</Label>
                <p className="text-xs text-muted-foreground">Double dial rate</p>
              </div>
            </div>
            <Switch
              checked={aggressiveDialing}
              onCheckedChange={onAggressiveDialingChange}
              disabled={isDialing}
              data-testid="switch-aggressive-dialing"
            />
          </div>

          {/* AMD Sensitivity */}
          {amdEnabled && (
            <div className="p-3 rounded-[12px] border bg-card">
              <Label className="text-sm font-medium mb-2 block">AMD Sensitivity</Label>
              <Select
                value={amdSensitivity}
                onValueChange={onAmdSensitivityChange}
                disabled={isDialing}
              >
                <SelectTrigger className="h-8" data-testid="select-amd-sensitivity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Greeting URL */}
        <div className="mt-4 p-3 rounded-[12px] border bg-card">
          <Label className="text-sm font-medium mb-2 block">Pre-recorded Greeting URL</Label>
          <div className="flex gap-2">
            <Input
              value={greetingUrl}
              onChange={(e) => onGreetingUrlChange(e.target.value)}
              placeholder="https://your-cdn.com/greeting.mp3"
              className="flex-1 h-9"
              data-testid="input-greeting-url"
            />
            <Button
              onClick={onSaveGreeting}
              disabled={isSavingGreeting}
              size="sm"
              className="px-4"
              data-testid="button-save-greeting"
            >
              <Save className="w-4 h-4 mr-1" />
              Save
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
