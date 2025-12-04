import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { 
  Phone, PhoneForwarded, Voicemail, BellOff, Mic, 
  Shield, Clock, Activity, Save, RotateCcw, Settings2,
  PhoneCall, UserCheck, Bell, CheckCircle2, AlertCircle,
  PhoneOff, PhoneIncoming, Timer, Volume2
} from "lucide-react";
import { useForm } from "react-hook-form";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CallSettingsFormData {
  callForwardingEnabled: boolean;
  forwardingNumber: string;
  forwardingCondition: "always" | "busy" | "no-answer" | "unavailable";
  forwardingTimeout: number;
  
  voicemailEnabled: boolean;
  voicemailGreetingType: "default" | "custom";
  voicemailTimeout: number;
  voicemailTranscription: boolean;
  
  doNotDisturbEnabled: boolean;
  doNotDisturbStart: string;
  doNotDisturbEnd: string;
  doNotDisturbWeekdaysOnly: boolean;
  doNotDisturbAllowVip: boolean;
  
  autoRecordCalls: boolean;
  recordingChannels: "mono" | "dual";
  trimSilence: boolean;
  recordingTranscription: boolean;
  
  callScreeningEnabled: boolean;
  answeringMachineDetection: boolean;
  amdSensitivity: "low" | "medium" | "high";
  
  callTimeout: number;
  ringTimeout: number;
  maxCallDuration: number;
  
  callWaitingEnabled: boolean;
  callQualityReporting: boolean;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  
  callerIdName: string;
  callerIdNumber: string;
  internationalCalling: boolean;
}

interface SettingResponse {
  id: number;
  key: string;
  value: CallSettingsFormData;
  updatedAt: string;
}

const defaultFormValues: CallSettingsFormData = {
  callForwardingEnabled: false,
  forwardingNumber: "",
  forwardingCondition: "no-answer",
  forwardingTimeout: 20,
  
  voicemailEnabled: true,
  voicemailGreetingType: "default",
  voicemailTimeout: 30,
  voicemailTranscription: false,
  
  doNotDisturbEnabled: false,
  doNotDisturbStart: "22:00",
  doNotDisturbEnd: "08:00",
  doNotDisturbWeekdaysOnly: false,
  doNotDisturbAllowVip: false,
  
  autoRecordCalls: false,
  recordingChannels: "dual",
  trimSilence: true,
  recordingTranscription: false,
  
  callScreeningEnabled: false,
  answeringMachineDetection: false,
  amdSensitivity: "medium",
  
  callTimeout: 300,
  ringTimeout: 60,
  maxCallDuration: 14400,
  
  callWaitingEnabled: true,
  callQualityReporting: true,
  echoCancellation: true,
  noiseSuppression: true,
  
  callerIdName: "",
  callerIdNumber: "",
  internationalCalling: false,
};

export default function CallSettingsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("general");
  const [isInitialized, setIsInitialized] = useState(false);
  const [persistedValues, setPersistedValues] = useState<CallSettingsFormData | null>(null);
  
  const { register, handleSubmit, watch, setValue, formState: { errors, isDirty }, reset, getValues } = useForm<CallSettingsFormData>({
    defaultValues: defaultFormValues
  });

  const watchedValues = {
    callForwardingEnabled: watch("callForwardingEnabled"),
    voicemailEnabled: watch("voicemailEnabled"),
    doNotDisturbEnabled: watch("doNotDisturbEnabled"),
    autoRecordCalls: watch("autoRecordCalls"),
    callScreeningEnabled: watch("callScreeningEnabled"),
    answeringMachineDetection: watch("answeringMachineDetection"),
  };

  const { data: callSettings, isLoading, isError, error } = useQuery<SettingResponse>({
    queryKey: ["/api/settings/call-settings"],
  });

  useEffect(() => {
    if (!isInitialized && !isLoading) {
      if (callSettings?.value) {
        const mergedSettings = { ...defaultFormValues, ...callSettings.value };
        reset(mergedSettings);
        setPersistedValues(mergedSettings);
      } else {
        reset(defaultFormValues);
        setPersistedValues(null);
      }
      setIsInitialized(true);
    }
  }, [callSettings, reset, isInitialized, isLoading]);

  const currentValues = watch();
  const baselineValues = persistedValues ?? defaultFormValues;
  const hasUnsavedChanges = isInitialized && JSON.stringify(currentValues) !== JSON.stringify(baselineValues);

  const saveSettingsMutation = useMutation({
    mutationFn: async (data: CallSettingsFormData) => {
      const response = await apiRequest("POST", "/api/settings", {
        key: "call-settings",
        value: data,
      });
      const result = await response.json();
      return { submittedData: data, serverResponse: result };
    },
    onSuccess: ({ submittedData, serverResponse }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/call-settings"] });
      const newValues = serverResponse?.value || submittedData;
      reset(newValues);
      setPersistedValues(newValues);
      toast({
        title: "Settings saved",
        description: "Your call settings have been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save settings",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CallSettingsFormData) => {
    saveSettingsMutation.mutate(data);
  };

  const handleReset = () => {
    Object.keys(defaultFormValues).forEach((key) => {
      const fieldKey = key as keyof CallSettingsFormData;
      setValue(fieldKey, defaultFormValues[fieldKey], { shouldDirty: true });
    });
    toast({
      title: "Settings reset",
      description: "All settings have been reset to default values. Click Save to apply.",
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 dark:text-gray-400">Loading call settings...</p>
        </div>
      </div>
    );
  }

  const getActiveFeatureCount = () => {
    let count = 0;
    if (watchedValues.callForwardingEnabled) count++;
    if (watchedValues.voicemailEnabled) count++;
    if (watchedValues.doNotDisturbEnabled) count++;
    if (watchedValues.autoRecordCalls) count++;
    if (watchedValues.callScreeningEnabled) count++;
    if (watchedValues.answeringMachineDetection) count++;
    return count;
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between pb-4 border-b border-gray-200 dark:border-gray-800">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Phone className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Call Settings</h1>
              <p className="text-gray-500 dark:text-gray-400">Configure your call handling and voice preferences</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              {getActiveFeatureCount()} active features
            </Badge>
            {hasUnsavedChanges && (
              <Badge variant="secondary" className="flex items-center gap-1.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                <AlertCircle className="w-3.5 h-3.5" />
                Unsaved changes
              </Badge>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 h-12 p-1 bg-gray-100 dark:bg-gray-800/50 rounded-xl">
            <TabsTrigger 
              value="general" 
              className="flex items-center gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:shadow-sm rounded-lg"
              data-testid="tab-general"
            >
              <Phone className="w-4 h-4" />
              General
            </TabsTrigger>
            <TabsTrigger 
              value="recording" 
              className="flex items-center gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:shadow-sm rounded-lg"
              data-testid="tab-recording"
            >
              <Mic className="w-4 h-4" />
              Recording
            </TabsTrigger>
            <TabsTrigger 
              value="screening" 
              className="flex items-center gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:shadow-sm rounded-lg"
              data-testid="tab-screening"
            >
              <Shield className="w-4 h-4" />
              Screening
            </TabsTrigger>
            <TabsTrigger 
              value="advanced" 
              className="flex items-center gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:shadow-sm rounded-lg"
              data-testid="tab-advanced"
            >
              <Activity className="w-4 h-4" />
              Advanced
            </TabsTrigger>
          </TabsList>

          {/* General Settings Tab */}
          <TabsContent value="general" className="space-y-4 mt-6">
            <Card data-testid="card-call-forwarding" className="border-0 shadow-md bg-white dark:bg-gray-800/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <PhoneForwarded className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Call Forwarding</CardTitle>
                      <CardDescription>Forward calls to another number based on conditions</CardDescription>
                    </div>
                  </div>
                  <Switch
                    data-testid="switch-call-forwarding"
                    checked={watchedValues.callForwardingEnabled}
                    onCheckedChange={(checked) => setValue("callForwardingEnabled", checked, { shouldDirty: true })}
                  />
                </div>
              </CardHeader>
              {watchedValues.callForwardingEnabled && (
                <CardContent className="space-y-4 pt-0">
                  <Separator />
                  <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
                    <div>
                      <Label htmlFor="forwardingNumber">Forwarding Number</Label>
                      <Input
                        data-testid="input-forwarding-number"
                        id="forwardingNumber"
                        type="tel"
                        {...register("forwardingNumber", { 
                          required: watchedValues.callForwardingEnabled ? "Forwarding number is required" : false 
                        })}
                        placeholder="+1 (555) 000-0000"
                        className="mt-1.5"
                      />
                      {errors.forwardingNumber && (
                        <p className="text-sm text-red-600 mt-1">{errors.forwardingNumber.message}</p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="forwardingCondition">Forward When</Label>
                        <Select
                          value={watch("forwardingCondition")}
                          onValueChange={(value: any) => setValue("forwardingCondition", value, { shouldDirty: true })}
                        >
                          <SelectTrigger data-testid="select-forwarding-condition" className="mt-1.5">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="always">Always</SelectItem>
                            <SelectItem value="busy">When Busy</SelectItem>
                            <SelectItem value="no-answer">No Answer</SelectItem>
                            <SelectItem value="unavailable">Unavailable</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="forwardingTimeout">Timeout (seconds)</Label>
                        <Input
                          data-testid="input-forwarding-timeout"
                          id="forwardingTimeout"
                          type="number"
                          {...register("forwardingTimeout", { min: 5, max: 60, valueAsNumber: true })}
                          className="mt-1.5"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>

            <Card data-testid="card-voicemail" className="border-0 shadow-md bg-white dark:bg-gray-800/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <Voicemail className="w-5 h-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Voicemail</CardTitle>
                      <CardDescription>Manage voicemail and greeting messages</CardDescription>
                    </div>
                  </div>
                  <Switch
                    data-testid="switch-voicemail"
                    checked={watchedValues.voicemailEnabled}
                    onCheckedChange={(checked) => setValue("voicemailEnabled", checked, { shouldDirty: true })}
                  />
                </div>
              </CardHeader>
              {watchedValues.voicemailEnabled && (
                <CardContent className="space-y-4 pt-0">
                  <Separator />
                  <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="voicemailGreetingType">Greeting Type</Label>
                        <Select
                          value={watch("voicemailGreetingType")}
                          onValueChange={(value: any) => setValue("voicemailGreetingType", value, { shouldDirty: true })}
                        >
                          <SelectTrigger data-testid="select-voicemail-greeting" className="mt-1.5">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="default">Default</SelectItem>
                            <SelectItem value="custom">Custom</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="voicemailTimeout">Timeout (seconds)</Label>
                        <Input
                          data-testid="input-voicemail-timeout"
                          id="voicemailTimeout"
                          type="number"
                          {...register("voicemailTimeout", { min: 10, max: 60, valueAsNumber: true })}
                          className="mt-1.5"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium">Voicemail Transcription</Label>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Convert voicemail to text automatically</p>
                      </div>
                      <Switch
                        data-testid="switch-voicemail-transcription"
                        checked={watch("voicemailTranscription")}
                        onCheckedChange={(checked) => setValue("voicemailTranscription", checked, { shouldDirty: true })}
                      />
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>

            <Card data-testid="card-do-not-disturb" className="border-0 shadow-md bg-white dark:bg-gray-800/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                      <BellOff className="w-5 h-5 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Do Not Disturb</CardTitle>
                      <CardDescription>Block calls during specific hours</CardDescription>
                    </div>
                  </div>
                  <Switch
                    data-testid="switch-dnd"
                    checked={watchedValues.doNotDisturbEnabled}
                    onCheckedChange={(checked) => setValue("doNotDisturbEnabled", checked, { shouldDirty: true })}
                  />
                </div>
              </CardHeader>
              {watchedValues.doNotDisturbEnabled && (
                <CardContent className="space-y-4 pt-0">
                  <Separator />
                  <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="doNotDisturbStart">Start Time</Label>
                        <Input
                          data-testid="input-dnd-start"
                          id="doNotDisturbStart"
                          type="time"
                          {...register("doNotDisturbStart")}
                          className="mt-1.5"
                        />
                      </div>
                      <div>
                        <Label htmlFor="doNotDisturbEnd">End Time</Label>
                        <Input
                          data-testid="input-dnd-end"
                          id="doNotDisturbEnd"
                          type="time"
                          {...register("doNotDisturbEnd")}
                          className="mt-1.5"
                        />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-medium">Weekdays Only</Label>
                          <p className="text-sm text-gray-500 dark:text-gray-400">Apply only Monday-Friday</p>
                        </div>
                        <Switch
                          data-testid="switch-dnd-weekdays"
                          checked={watch("doNotDisturbWeekdaysOnly")}
                          onCheckedChange={(checked) => setValue("doNotDisturbWeekdaysOnly", checked, { shouldDirty: true })}
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-medium">Allow VIP Contacts</Label>
                          <p className="text-sm text-gray-500 dark:text-gray-400">Let starred contacts through</p>
                        </div>
                        <Switch
                          data-testid="switch-dnd-vip"
                          checked={watch("doNotDisturbAllowVip")}
                          onCheckedChange={(checked) => setValue("doNotDisturbAllowVip", checked, { shouldDirty: true })}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          </TabsContent>

          {/* Recording Settings Tab */}
          <TabsContent value="recording" className="space-y-4 mt-6">
            <Card data-testid="card-recording" className="border-0 shadow-md bg-white dark:bg-gray-800/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                      <Mic className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Call Recording</CardTitle>
                      <CardDescription>Configure automatic call recording preferences</CardDescription>
                    </div>
                  </div>
                  <Switch
                    data-testid="switch-auto-record"
                    checked={watchedValues.autoRecordCalls}
                    onCheckedChange={(checked) => setValue("autoRecordCalls", checked, { shouldDirty: true })}
                  />
                </div>
              </CardHeader>
              {watchedValues.autoRecordCalls && (
                <CardContent className="space-y-4 pt-0">
                  <Separator />
                  <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
                    <div>
                      <Label htmlFor="recordingChannels">Recording Channels</Label>
                      <Select
                        value={watch("recordingChannels")}
                        onValueChange={(value: any) => setValue("recordingChannels", value, { shouldDirty: true })}
                      >
                        <SelectTrigger data-testid="select-recording-channels" className="mt-1.5">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mono">Mono (Single Channel)</SelectItem>
                          <SelectItem value="dual">Dual (Separate Channels)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">
                        Dual channel records each participant separately for better clarity
                      </p>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-medium">Trim Silence</Label>
                          <p className="text-sm text-gray-500 dark:text-gray-400">Remove silent portions from recordings</p>
                        </div>
                        <Switch
                          data-testid="switch-trim-silence"
                          checked={watch("trimSilence")}
                          onCheckedChange={(checked) => setValue("trimSilence", checked, { shouldDirty: true })}
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-medium">Recording Transcription</Label>
                          <p className="text-sm text-gray-500 dark:text-gray-400">Convert recordings to searchable text</p>
                        </div>
                        <Switch
                          data-testid="switch-recording-transcription"
                          checked={watch("recordingTranscription")}
                          onCheckedChange={(checked) => setValue("recordingTranscription", checked, { shouldDirty: true })}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Recording Info Card */}
            <Card className="border-0 shadow-md bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/10 dark:to-blue-900/10">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
                    <Volume2 className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">Recording Best Practices</h3>
                    <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
                      <li>• Dual channel recording is recommended for better call analysis</li>
                      <li>• Transcription helps with searchability and compliance</li>
                      <li>• Check local laws regarding call recording consent</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Screening Settings Tab */}
          <TabsContent value="screening" className="space-y-4 mt-6">
            <Card data-testid="card-screening" className="border-0 shadow-md bg-white dark:bg-gray-800/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                      <Shield className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Call Screening</CardTitle>
                      <CardDescription>Filter and screen incoming calls</CardDescription>
                    </div>
                  </div>
                  <Switch
                    data-testid="switch-call-screening"
                    checked={watchedValues.callScreeningEnabled}
                    onCheckedChange={(checked) => setValue("callScreeningEnabled", checked, { shouldDirty: true })}
                  />
                </div>
              </CardHeader>
              {watchedValues.callScreeningEnabled && (
                <CardContent className="pt-0">
                  <Separator className="mb-4" />
                  <div className="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-200 dark:border-amber-800">
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      When enabled, unknown callers will be asked to state their name before the call is connected to you.
                    </p>
                  </div>
                </CardContent>
              )}
            </Card>
            
            <Card data-testid="card-amd" className="border-0 shadow-md bg-white dark:bg-gray-800/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
                      <PhoneOff className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Answering Machine Detection</CardTitle>
                      <CardDescription>Detect voicemail systems on outbound calls</CardDescription>
                    </div>
                  </div>
                  <Switch
                    data-testid="switch-amd"
                    checked={watchedValues.answeringMachineDetection}
                    onCheckedChange={(checked) => setValue("answeringMachineDetection", checked, { shouldDirty: true })}
                  />
                </div>
              </CardHeader>
              {watchedValues.answeringMachineDetection && (
                <CardContent className="pt-0">
                  <Separator className="mb-4" />
                  <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
                    <div>
                      <Label htmlFor="amdSensitivity">Detection Sensitivity</Label>
                      <Select
                        value={watch("amdSensitivity")}
                        onValueChange={(value: any) => setValue("amdSensitivity", value, { shouldDirty: true })}
                      >
                        <SelectTrigger data-testid="select-amd-sensitivity" className="mt-1.5">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low (More Accurate)</SelectItem>
                          <SelectItem value="medium">Medium (Balanced)</SelectItem>
                          <SelectItem value="high">High (Faster Response)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">
                        Higher sensitivity responds faster but may have more false positives
                      </p>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>

            <Card data-testid="card-caller-id" className="border-0 shadow-md bg-white dark:bg-gray-800/50">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg">
                    <UserCheck className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Caller ID</CardTitle>
                    <CardDescription>Configure outbound caller identification</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="callerIdName">Caller ID Name</Label>
                  <Input
                    data-testid="input-caller-id-name"
                    id="callerIdName"
                    type="text"
                    {...register("callerIdName")}
                    placeholder="Your Business Name"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="callerIdNumber">Caller ID Number</Label>
                  <Input
                    data-testid="input-caller-id-number"
                    id="callerIdNumber"
                    type="tel"
                    {...register("callerIdNumber")}
                    placeholder="+1 (555) 000-0000"
                    className="mt-1.5"
                  />
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">
                    Must be a verified number from your Twilio account
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Advanced Settings Tab */}
          <TabsContent value="advanced" className="space-y-4 mt-6">
            <Card data-testid="card-timeouts" className="border-0 shadow-md bg-white dark:bg-gray-800/50">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                    <Timer className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Timeout Settings</CardTitle>
                    <CardDescription>Configure call duration and timeout limits</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="ringTimeout">Ring Timeout</Label>
                    <div className="relative mt-1.5">
                      <Input
                        data-testid="input-ring-timeout"
                        id="ringTimeout"
                        type="number"
                        {...register("ringTimeout", { min: 10, max: 600, valueAsNumber: true })}
                        className="pr-16"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">seconds</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      How long to ring before voicemail
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="callTimeout">Call Timeout</Label>
                    <div className="relative mt-1.5">
                      <Input
                        data-testid="input-call-timeout"
                        id="callTimeout"
                        type="number"
                        {...register("callTimeout", { min: 60, max: 3600, valueAsNumber: true })}
                        className="pr-16"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">seconds</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Connection timeout
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="maxCallDuration">Max Duration</Label>
                    <div className="relative mt-1.5">
                      <Input
                        data-testid="input-max-duration"
                        id="maxCallDuration"
                        type="number"
                        {...register("maxCallDuration", { min: 300, max: 86400, valueAsNumber: true })}
                        className="pr-16"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">seconds</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Maximum call length (up to 24h)
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-quality" className="border-0 shadow-md bg-white dark:bg-gray-800/50">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                    <Activity className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Call Quality & Features</CardTitle>
                    <CardDescription>Enhance call quality and enable additional features</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Call Waiting</Label>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Accept calls while on another call</p>
                    </div>
                    <Switch
                      data-testid="switch-call-waiting"
                      checked={watch("callWaitingEnabled")}
                      onCheckedChange={(checked) => setValue("callWaitingEnabled", checked, { shouldDirty: true })}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Quality Reporting</Label>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Monitor call quality metrics</p>
                    </div>
                    <Switch
                      data-testid="switch-quality-reporting"
                      checked={watch("callQualityReporting")}
                      onCheckedChange={(checked) => setValue("callQualityReporting", checked, { shouldDirty: true })}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Echo Cancellation</Label>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Reduce echo on calls</p>
                    </div>
                    <Switch
                      data-testid="switch-echo-cancellation"
                      checked={watch("echoCancellation")}
                      onCheckedChange={(checked) => setValue("echoCancellation", checked, { shouldDirty: true })}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Noise Suppression</Label>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Filter background noise</p>
                    </div>
                    <Switch
                      data-testid="switch-noise-suppression"
                      checked={watch("noiseSuppression")}
                      onCheckedChange={(checked) => setValue("noiseSuppression", checked, { shouldDirty: true })}
                    />
                  </div>
                </div>
                <Separator />
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium">International Calling</Label>
                      <Badge variant="outline" className="text-xs">Premium</Badge>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Enable calls to international numbers</p>
                  </div>
                  <Switch
                    data-testid="switch-international"
                    checked={watch("internationalCalling")}
                    onCheckedChange={(checked) => setValue("internationalCalling", checked, { shouldDirty: true })}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Sticky Action Bar */}
        <div className="sticky bottom-0 mt-6 -mx-6 px-6 py-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-t border-gray-200 dark:border-gray-800">
          <div className="max-w-5xl mx-auto flex justify-between items-center">
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              data-testid="button-reset"
              className="flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Reset to Defaults
            </Button>
            <div className="flex items-center gap-3">
              {hasUnsavedChanges && (
                <span className="text-sm text-amber-600 dark:text-amber-400">You have unsaved changes</span>
              )}
              <Button
                type="submit"
                disabled={saveSettingsMutation.isPending}
                data-testid="button-save"
                className="flex items-center gap-2 min-w-[140px]"
              >
                {saveSettingsMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Settings
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
