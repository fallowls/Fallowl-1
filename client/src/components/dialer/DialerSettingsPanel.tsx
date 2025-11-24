import { useState } from "react";
import { Settings, Zap, Clock, Phone, Shield, Calendar, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEFAULT_DIALER_SETTINGS, type DialerSettings } from "@shared/parallelDialerTypes";

interface DialerSettingsPanelProps {
  settings: DialerSettings;
  onSettingsChange: (settings: DialerSettings) => void;
  onSave?: () => void;
  onCancel?: () => void;
}

export function DialerSettingsPanel({
  settings,
  onSettingsChange,
  onSave,
  onCancel
}: DialerSettingsPanelProps) {
  const [localSettings, setLocalSettings] = useState<DialerSettings>(settings);

  const updateSetting = <K extends keyof DialerSettings>(
    key: K,
    value: DialerSettings[K]
  ) => {
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    onSettingsChange(newSettings);
  };

  const resetToDefaults = () => {
    setLocalSettings(DEFAULT_DIALER_SETTINGS);
    onSettingsChange(DEFAULT_DIALER_SETTINGS);
  };

  return (
    <Card className="bg-white dark:bg-gray-800 w-full max-w-4xl" data-testid="card-dialer-settings">
      <CardHeader className="border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Dialer Settings
          </CardTitle>
          <Button
            onClick={resetToDefaults}
            variant="outline"
            size="sm"
            data-testid="button-reset-defaults"
          >
            Reset to Defaults
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-6">
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="general" data-testid="tab-general">General</TabsTrigger>
            <TabsTrigger value="pacing" data-testid="tab-pacing">Pacing</TabsTrigger>
            <TabsTrigger value="retry" data-testid="tab-retry">Retry Rules</TabsTrigger>
            <TabsTrigger value="compliance" data-testid="tab-compliance">Compliance</TabsTrigger>
          </TabsList>

          {/* General Settings */}
          <TabsContent value="general" className="space-y-6 mt-6">
            {/* Dialing Mode */}
            <div className="space-y-2">
              <Label className="text-base font-medium flex items-center gap-2">
                <Phone className="w-4 h-4" />
                Dialing Mode
              </Label>
              <Select
                value={localSettings.mode}
                onValueChange={(value: any) => updateSetting('mode', value)}
              >
                <SelectTrigger data-testid="select-dialing-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="predictive">Predictive - AI-powered optimal pacing</SelectItem>
                  <SelectItem value="power">Power - Fixed ratio dialing</SelectItem>
                  <SelectItem value="preview">Preview - Agent reviews before dial</SelectItem>
                  <SelectItem value="manual">Manual - Agent initiates each call</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {localSettings.mode === 'predictive' && 'System automatically adjusts call volume based on agent availability'}
                {localSettings.mode === 'power' && 'Dial multiple numbers per agent at a fixed ratio'}
                {localSettings.mode === 'preview' && 'Agent sees lead information before initiating call'}
                {localSettings.mode === 'manual' && 'Agent manually dials each number'}
              </p>
            </div>

            {/* Parallel Call Limit */}
            <div className="space-y-2">
              <Label className="text-base font-medium">
                Parallel Lines: {localSettings.parallelCallLimit}
              </Label>
              <Slider
                value={[localSettings.parallelCallLimit]}
                onValueChange={([value]) => updateSetting('parallelCallLimit', value)}
                min={1}
                max={10}
                step={1}
                className="w-full"
                data-testid="slider-parallel-lines"
              />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Maximum number of simultaneous outbound calls
              </p>
            </div>

            {/* AMD Settings */}
            <div className="space-y-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-medium">Answering Machine Detection (AMD)</Label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Automatically detect voicemails and answering machines
                  </p>
                </div>
                <Switch
                  checked={localSettings.amdEnabled}
                  onCheckedChange={(checked) => updateSetting('amdEnabled', checked)}
                  data-testid="switch-amd-enabled"
                />
              </div>

              {localSettings.amdEnabled && (
                <div className="space-y-2">
                  <Label>When machine detected:</Label>
                  <Select
                    value={localSettings.amdBehavior}
                    onValueChange={(value: any) => updateSetting('amdBehavior', value)}
                  >
                    <SelectTrigger data-testid="select-amd-behavior">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="leave-voicemail">Leave Voicemail (if configured)</SelectItem>
                      <SelectItem value="disconnect">Disconnect Immediately</SelectItem>
                      <SelectItem value="mark-callback">Mark for Callback</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Call Recording */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium">Call Recording</Label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Record all outbound calls
                </p>
              </div>
              <Switch
                checked={localSettings.callRecordingEnabled}
                onCheckedChange={(checked) => updateSetting('callRecordingEnabled', checked)}
                data-testid="switch-call-recording"
              />
            </div>
          </TabsContent>

          {/* Pacing Settings */}
          <TabsContent value="pacing" className="space-y-6 mt-6">
            {/* Auto Pacing */}
            <div className="space-y-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-medium flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    Auto-Pacing
                  </Label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Automatically adjust call volume based on performance
                  </p>
                </div>
                <Switch
                  checked={localSettings.autoPacingEnabled}
                  onCheckedChange={(checked) => updateSetting('autoPacingEnabled', checked)}
                  data-testid="switch-auto-pacing"
                />
              </div>

              {localSettings.autoPacingEnabled && (
                <div className="space-y-2">
                  <Label>Pacing Algorithm</Label>
                  <Select
                    value={localSettings.pacingAlgorithm}
                    onValueChange={(value: any) => updateSetting('pacingAlgorithm', value)}
                  >
                    <SelectTrigger data-testid="select-pacing-algorithm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aggressive">Aggressive - Maximum speed</SelectItem>
                      <SelectItem value="moderate">Moderate - Balanced approach</SelectItem>
                      <SelectItem value="conservative">Conservative - Quality focused</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {localSettings.pacingAlgorithm === 'aggressive' && 'Maximize call volume, may increase dropped calls'}
                    {localSettings.pacingAlgorithm === 'moderate' && 'Balance between speed and connection quality'}
                    {localSettings.pacingAlgorithm === 'conservative' && 'Prioritize connection quality over speed'}
                  </p>
                </div>
              )}
            </div>

            {/* Priority Dialing */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Priority Dialing
                </Label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Dial high-priority leads first
                </p>
              </div>
              <Switch
                checked={localSettings.priorityDialingEnabled}
                onCheckedChange={(checked) => updateSetting('priorityDialingEnabled', checked)}
                data-testid="switch-priority-dialing"
              />
            </div>
          </TabsContent>

          {/* Retry Rules */}
          <TabsContent value="retry" className="space-y-6 mt-6">
            {/* Max Attempts */}
            <div className="space-y-2">
              <Label className="text-base font-medium">
                Maximum Attempts: {localSettings.maxAttemptsPerLead}
              </Label>
              <Slider
                value={[localSettings.maxAttemptsPerLead]}
                onValueChange={([value]) => updateSetting('maxAttemptsPerLead', value)}
                min={1}
                max={10}
                step={1}
                className="w-full"
                data-testid="slider-max-attempts"
              />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                How many times to attempt calling each lead
              </p>
            </div>

            {/* Retry Interval */}
            <div className="space-y-2">
              <Label className="text-base font-medium">Retry Interval (minutes)</Label>
              <Input
                type="number"
                value={localSettings.retryIntervalMinutes}
                onChange={(e) => updateSetting('retryIntervalMinutes', parseInt(e.target.value) || 60)}
                min={1}
                className="w-full"
                data-testid="input-retry-interval"
              />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Time to wait before retrying a failed attempt
              </p>
            </div>

            {/* Retry Conditions */}
            <div className="space-y-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <Label className="text-base font-medium">Retry When:</Label>
              
              <div className="flex items-center justify-between">
                <Label>Busy Signal</Label>
                <Switch
                  checked={localSettings.retryOnBusy}
                  onCheckedChange={(checked) => updateSetting('retryOnBusy', checked)}
                  data-testid="switch-retry-busy"
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>No Answer</Label>
                <Switch
                  checked={localSettings.retryOnNoAnswer}
                  onCheckedChange={(checked) => updateSetting('retryOnNoAnswer', checked)}
                  data-testid="switch-retry-no-answer"
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>Failed Connection</Label>
                <Switch
                  checked={localSettings.retryOnFailed}
                  onCheckedChange={(checked) => updateSetting('retryOnFailed', checked)}
                  data-testid="switch-retry-failed"
                />
              </div>
            </div>
          </TabsContent>

          {/* Compliance Settings */}
          <TabsContent value="compliance" className="space-y-6 mt-6">
            {/* DNC List */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Do Not Call (DNC) List
                </Label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Skip numbers on the DNC list
                </p>
              </div>
              <Switch
                checked={localSettings.dncListEnabled}
                onCheckedChange={(checked) => updateSetting('dncListEnabled', checked)}
                data-testid="switch-dnc-enabled"
              />
            </div>

            {/* Time Zone Respect */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Respect Time Zones
                </Label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Only call during appropriate hours for each time zone
                </p>
              </div>
              <Switch
                checked={localSettings.timeZoneRespect}
                onCheckedChange={(checked) => updateSetting('timeZoneRespect', checked)}
                data-testid="switch-timezone-respect"
              />
            </div>

            {/* Calling Hours */}
            <div className="space-y-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <Label className="text-base font-medium flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Allowed Calling Hours
              </Label>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <Input
                    type="time"
                    value={localSettings.allowedCallingHours.start}
                    onChange={(e) => updateSetting('allowedCallingHours', {
                      ...localSettings.allowedCallingHours,
                      start: e.target.value
                    })}
                    data-testid="input-calling-start-time"
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <Input
                    type="time"
                    value={localSettings.allowedCallingHours.end}
                    onChange={(e) => updateSetting('allowedCallingHours', {
                      ...localSettings.allowedCallingHours,
                      end: e.target.value
                    })}
                    data-testid="input-calling-end-time"
                  />
                </div>
              </div>
            </div>

            {/* Allowed Days */}
            <div className="space-y-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <Label className="text-base font-medium flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Allowed Calling Days
              </Label>
              
              <div className="grid grid-cols-7 gap-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                  <Button
                    key={index}
                    variant={localSettings.allowedCallingDays.includes(index) ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      const newDays = localSettings.allowedCallingDays.includes(index)
                        ? localSettings.allowedCallingDays.filter(d => d !== index)
                        : [...localSettings.allowedCallingDays, index].sort();
                      updateSetting('allowedCallingDays', newDays);
                    }}
                    className="h-10"
                    data-testid={`button-day-${index}`}
                  >
                    {day}
                  </Button>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Action Buttons */}
        {(onSave || onCancel) && (
          <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            {onCancel && (
              <Button
                onClick={onCancel}
                variant="outline"
                data-testid="button-cancel-settings"
              >
                Cancel
              </Button>
            )}
            {onSave && (
              <Button
                onClick={onSave}
                data-testid="button-save-settings"
              >
                Save Settings
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
