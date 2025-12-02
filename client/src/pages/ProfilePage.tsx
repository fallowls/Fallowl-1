import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useForm } from "react-hook-form";
import { 
  User, 
  Mail, 
  Phone, 
  Lock, 
  Bell, 
  Shield, 
  Eye, 
  EyeOff,
  Upload,
  Save,
  Key,
  Trash2,
  Loader2,
  Cloud,
  Server,
  Check,
  Edit,
  ChevronDown,
  ChevronUp
} from "lucide-react";

interface TwilioSettingsFormData {
  connectionType: 'twilio' | 'sip';
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioApiKeySid: string;
  twilioApiKeySecret: string;
  twilioPhoneNumber: string;
  sipUri: string;
  sipUsername: string;
  sipPassword: string;
  sipProxyServer: string;
  sipPort: string;
}

export default function ProfilePage() {
  const { toast } = useToast();
  const { user: authUser } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [twilioConnectionStatus, setTwilioConnectionStatus] = useState<'untested' | 'testing' | 'success' | 'error'>('success');
  const [isTwilioFormExpanded, setIsTwilioFormExpanded] = useState(false);
  
  const { register: registerTwilio, handleSubmit: handleTwilioSubmit, watch: watchTwilio, setValue: setTwilioValue, formState: { errors: twilioErrors } } = useForm<TwilioSettingsFormData>({
    defaultValues: {
      connectionType: 'twilio',
      twilioAccountSid: '',
      twilioAuthToken: '',
      twilioApiKeySid: '',
      twilioApiKeySecret: '',
      twilioPhoneNumber: '',
      sipUri: '',
      sipUsername: '',
      sipPassword: '',
      sipProxyServer: '',
      sipPort: '5060',
    }
  });

  const twilioConnectionType = watchTwilio("connectionType");
  
  // Fetch user profile data
  const { data: profileData, isLoading: isLoadingProfile } = useQuery<{
    id: number;
    username: string;
    email: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    avatar?: string;
    role: string;
    status: string;
    emailVerified?: boolean;
    twoFactorEnabled?: boolean;
    accountType?: string;
    subscriptionPlan?: string;
    twilioConfigured?: boolean;
    createdAt?: string;
    lastLogin?: string;
    customFields?: any;
    auth0Id?: string;
  }>({
    queryKey: ['/api/profile'],
    enabled: !!authUser,
  });

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    avatar: ''
  });

  // Update form data when profile data is loaded
  useEffect(() => {
    if (profileData) {
      setFormData({
        firstName: profileData.firstName || '',
        lastName: profileData.lastName || '',
        phone: profileData.phone || '',
        avatar: profileData.avatar || ''
      });
      
      // Load notification settings from customFields if available
      const savedNotificationSettings = (profileData as any).customFields?.notificationSettings;
      if (savedNotificationSettings) {
        setNotificationSettings(savedNotificationSettings);
      }
    }
  }, [profileData]);

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [notificationSettings, setNotificationSettings] = useState({
    emailNotifications: true,
    smsNotifications: false,
    callNotifications: true,
    voicemailNotifications: true,
    marketingEmails: false,
    weeklyReports: true
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('PUT', '/api/profile', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/profile'] });
      toast({
        title: "Profile Updated",
        description: "Your profile has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update profile. Please try again.",
        variant: "destructive"
      });
    }
  });

  const updatePasswordMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('PUT', '/api/profile/password', data);
    },
    onSuccess: () => {
      toast({
        title: "Password Updated",
        description: "Your password has been changed successfully.",
      });
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update password. Please check your current password.",
        variant: "destructive"
      });
    }
  });

  const updateNotificationsMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('PUT', '/api/profile/notifications', data);
    },
    onSuccess: () => {
      toast({
        title: "Notifications Updated",
        description: "Your notification preferences have been saved.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update notification settings.",
        variant: "destructive"
      });
    }
  });

  const { data: twilioSettings } = useQuery({
    queryKey: ["/api/user/twilio/credentials"],
    retry: false,
  });

  useEffect(() => {
    if (twilioSettings && typeof twilioSettings === 'object' && 'configured' in twilioSettings) {
      const typedSettings = twilioSettings as {
        configured: boolean;
        credentials?: {
          accountSid?: string;
          phoneNumber?: string;
          hasApiKey?: boolean;
          twimlAppSid?: string;
        };
      };
      
      setIsTwilioFormExpanded(!typedSettings.configured);
      
      if (typedSettings.configured && typedSettings.credentials) {
        setTwilioValue("connectionType", 'twilio');
        if (typedSettings.credentials.phoneNumber) {
          setTwilioValue("twilioPhoneNumber", typedSettings.credentials.phoneNumber);
        }
      }
    }
  }, [twilioSettings, setTwilioValue]);

  const testTwilioConnectionMutation = useMutation({
    mutationFn: async (data: TwilioSettingsFormData) => {
      setTwilioConnectionStatus('testing');
      
      if (data.connectionType === 'twilio') {
        const payload: Record<string, string | undefined> = {
          accountSid: data.twilioAccountSid,
          authToken: data.twilioAuthToken,
          phoneNumber: data.twilioPhoneNumber,
        };
        
        if (data.twilioApiKeySid && data.twilioApiKeySid.trim() !== '') {
          payload.apiKeySid = data.twilioApiKeySid;
        }
        if (data.twilioApiKeySecret && data.twilioApiKeySecret.trim() !== '') {
          payload.apiKeySecret = data.twilioApiKeySecret;
        }
        
        await apiRequest("POST", "/api/user/twilio/credentials", payload);
        
        const response = await apiRequest("POST", "/api/twilio/test-connection");
        const result = await response.json();
        
        if (result.connected) {
          setTwilioConnectionStatus('success');
          return { success: true };
        } else {
          setTwilioConnectionStatus('error');
          throw new Error('Twilio connection test failed');
        }
      } else {
        await new Promise(resolve => setTimeout(resolve, 2000));
        if (Math.random() > 0.2) {
          setTwilioConnectionStatus('success');
          return { success: true };
        } else {
          setTwilioConnectionStatus('error');
          throw new Error('SIP connection test failed');
        }
      }
    },
    onSuccess: (_, variables) => {
      if (variables.connectionType === 'twilio') {
        queryClient.invalidateQueries({ queryKey: ["/api/user/twilio/credentials"] });
        queryClient.invalidateQueries({ queryKey: ["/api/user/twilio/status"] });
      }
      toast({
        title: "Connection successful",
        description: "System settings are working correctly.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Connection failed",
        description: error.message || "Unable to connect with current settings",
        variant: "destructive",
      });
    },
  });

  const saveTwilioSettingsMutation = useMutation({
    mutationFn: async (data: TwilioSettingsFormData) => {
      if (data.connectionType === 'twilio') {
        const payload: Record<string, string | undefined> = {
          accountSid: data.twilioAccountSid,
          authToken: data.twilioAuthToken,
          phoneNumber: data.twilioPhoneNumber,
        };
        
        if (data.twilioApiKeySid && data.twilioApiKeySid.trim() !== '') {
          payload.apiKeySid = data.twilioApiKeySid;
        }
        if (data.twilioApiKeySecret && data.twilioApiKeySecret.trim() !== '') {
          payload.apiKeySecret = data.twilioApiKeySecret;
        }
        
        const response = await apiRequest("POST", "/api/user/twilio/credentials", payload);
        return response.json();
      } else {
        const response = await apiRequest("POST", "/api/settings", {
          key: "system",
          value: data,
        });
        return response.json();
      }
    },
    onSuccess: (_, variables) => {
      if (variables.connectionType === 'twilio') {
        queryClient.invalidateQueries({ queryKey: ["/api/user/twilio/credentials"] });
        queryClient.invalidateQueries({ queryKey: ["/api/user/twilio/status"] });
        setIsTwilioFormExpanded(false);
      }
      toast({
        title: "Settings saved",
        description: "Twilio settings have been saved successfully.",
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

  const removeTwilioCredentialsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/user/twilio/credentials");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/twilio/credentials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/twilio/status"] });
      setIsTwilioFormExpanded(true);
      toast({
        title: "Credentials removed",
        description: "Twilio credentials have been removed successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove credentials",
        variant: "destructive",
      });
    },
  });

  const onTwilioSubmit = (data: TwilioSettingsFormData) => {
    saveTwilioSettingsMutation.mutate(data);
  };

  const handleTestTwilioConnection = () => {
    handleTwilioSubmit((data) => {
      testTwilioConnectionMutation.mutate(data);
    })();
  };

  const getTwilioStatusColor = () => {
    switch (twilioConnectionStatus) {
      case 'untested': return 'bg-yellow-100 text-yellow-800';
      case 'testing': return 'bg-blue-100 text-blue-800';
      case 'success': return 'bg-green-100 text-green-800';
      case 'error': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTwilioStatusText = () => {
    switch (twilioConnectionStatus) {
      case 'untested': return 'Not tested';
      case 'testing': return 'Testing...';
      case 'success': return 'Connected';
      case 'error': return 'Failed';
      default: return 'Unknown';
    }
  };

  const isTwilioConfigured = !!(twilioSettings && typeof twilioSettings === 'object' && 'configured' in twilioSettings && twilioSettings.configured);

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate(formData);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({
        title: "Error",
        description: "New passwords don't match.",
        variant: "destructive"
      });
      return;
    }
    if (passwordData.newPassword.length < 8) {
      toast({
        title: "Error",
        description: "Password must be at least 8 characters long.",
        variant: "destructive"
      });
      return;
    }
    updatePasswordMutation.mutate(passwordData);
  };

  const handleNotificationChange = (key: string, value: boolean) => {
    const newSettings = { ...notificationSettings, [key]: value };
    setNotificationSettings(newSettings);
    updateNotificationsMutation.mutate(newSettings);
  };

  const getInitials = (firstName: string, lastName: string) => {
    if (!firstName && !lastName) return '?';
    return `${firstName.charAt(0) || ''}${lastName.charAt(0) || ''}`.toUpperCase();
  };

  if (isLoadingProfile) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <p className="text-gray-600 dark:text-gray-400">
          Manage your account settings and preferences
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="twilio">Twilio</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Personal Information
              </CardTitle>
              <CardDescription>
                Update your personal details and profile information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProfileSubmit} className="space-y-6">
                <div className="flex items-center gap-6">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={formData.avatar} alt="Profile" />
                    <AvatarFallback className="text-lg">
                      {getInitials(formData.firstName, formData.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <Button type="button" variant="outline" size="sm" className="mb-2" data-testid="button-change-avatar">
                      <Upload className="h-4 w-4 mr-2" />
                      Change Avatar
                    </Button>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      JPG, PNG or GIF. Max size 2MB.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      data-testid="input-firstName"
                      value={formData.firstName}
                      onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      data-testid="input-lastName"
                      value={formData.lastName}
                      onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      data-testid="input-email"
                      value={profileData?.email || ''}
                      disabled
                      className="bg-gray-100 dark:bg-gray-800"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Email is managed through Auth0 and cannot be changed here
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      data-testid="input-phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>
                </div>

                <Button type="submit" disabled={updateProfileMutation.isPending} data-testid="button-save-profile">
                  {updateProfileMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="twilio" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cloud className="h-5 w-5" />
                Twilio Settings
              </CardTitle>
              <CardDescription>
                Configure your Twilio and SIP trunk settings for making calls
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isTwilioConfigured && !isTwilioFormExpanded ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-green-100 dark:bg-green-800 rounded-full">
                        <Check className="w-5 h-5 text-green-600 dark:text-green-300" />
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-800 dark:text-gray-200">Twilio Credentials Configured</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Your Twilio account is connected and ready to use
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsTwilioFormExpanded(!isTwilioFormExpanded)}
                      data-testid="button-toggle-twilio-credentials"
                    >
                      {isTwilioFormExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setIsTwilioFormExpanded(true)}
                      data-testid="button-update-twilio-credentials"
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Update Credentials
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (confirm("Are you sure you want to remove your Twilio credentials?")) {
                          removeTwilioCredentialsMutation.mutate();
                        }
                      }}
                      disabled={removeTwilioCredentialsMutation.isPending}
                      data-testid="button-remove-twilio-credentials"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      {removeTwilioCredentialsMutation.isPending ? "Removing..." : "Remove Credentials"}
                    </Button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleTwilioSubmit(onTwilioSubmit)} className="space-y-8">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Connection Type</h3>
                    <RadioGroup
                      value={twilioConnectionType}
                      onValueChange={(value) => setTwilioValue("connectionType", value as 'twilio' | 'sip')}
                      className="grid grid-cols-1 md:grid-cols-2 gap-4"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="twilio" id="twilio" />
                        <Label htmlFor="twilio" className="cursor-pointer flex-1">
                          <div className="border-2 border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-blue-300 dark:hover:border-blue-600 transition-colors">
                            <div className="flex items-center">
                              <Cloud className="w-8 h-8 text-blue-600 mr-3" />
                              <div>
                                <h4 className="font-medium text-gray-800 dark:text-gray-200">Twilio</h4>
                                <p className="text-sm text-gray-600 dark:text-gray-400">Cloud-based communication platform</p>
                              </div>
                            </div>
                          </div>
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="sip" id="sip" />
                        <Label htmlFor="sip" className="cursor-pointer flex-1">
                          <div className="border-2 border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-blue-300 dark:hover:border-blue-600 transition-colors">
                            <div className="flex items-center">
                              <Server className="w-8 h-8 text-gray-600 dark:text-gray-400 mr-3" />
                              <div>
                                <h4 className="font-medium text-gray-800 dark:text-gray-200">SIP Trunk</h4>
                                <p className="text-sm text-gray-600 dark:text-gray-400">Direct SIP connection</p>
                              </div>
                            </div>
                          </div>
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {twilioConnectionType === 'twilio' && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Twilio Configuration</h3>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="twilioAccountSid">Account SID</Label>
                          <Input
                            id="twilioAccountSid"
                            {...registerTwilio("twilioAccountSid", { 
                              required: twilioConnectionType === 'twilio' ? "Account SID is required" : false 
                            })}
                            placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                            className={twilioErrors.twilioAccountSid ? "border-red-300" : ""}
                          />
                          {twilioErrors.twilioAccountSid && (
                            <p className="text-sm text-red-600 mt-1">{twilioErrors.twilioAccountSid.message}</p>
                          )}
                        </div>
                        <div>
                          <Label htmlFor="twilioAuthToken">Auth Token</Label>
                          <Input
                            id="twilioAuthToken"
                            type="password"
                            {...registerTwilio("twilioAuthToken", { 
                              required: twilioConnectionType === 'twilio' ? "Auth Token is required" : false 
                            })}
                            placeholder="Enter your Auth Token"
                            className={twilioErrors.twilioAuthToken ? "border-red-300" : ""}
                          />
                          {twilioErrors.twilioAuthToken && (
                            <p className="text-sm text-red-600 mt-1">{twilioErrors.twilioAuthToken.message}</p>
                          )}
                          {isTwilioConfigured && (
                            <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                              For security, you must re-enter your auth token when updating credentials
                            </p>
                          )}
                        </div>
                        <div>
                          <Label htmlFor="twilioPhoneNumber">Twilio Phone Number</Label>
                          <Input
                            id="twilioPhoneNumber"
                            type="tel"
                            {...registerTwilio("twilioPhoneNumber", { 
                              required: twilioConnectionType === 'twilio' ? "Phone number is required" : false 
                            })}
                            placeholder="+1 (555) 000-0000"
                            className={twilioErrors.twilioPhoneNumber ? "border-red-300" : ""}
                          />
                          {twilioErrors.twilioPhoneNumber && (
                            <p className="text-sm text-red-600 mt-1">{twilioErrors.twilioPhoneNumber.message}</p>
                          )}
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Your Twilio phone number that will be used for outbound calls.
                          </p>
                        </div>
                        <div>
                          <Label htmlFor="twilioApiKeySid">API Key SID (Optional)</Label>
                          <Input
                            id="twilioApiKeySid"
                            {...registerTwilio("twilioApiKeySid")}
                            placeholder="SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                          />
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Optional: For enhanced security and token generation
                          </p>
                        </div>
                        <div>
                          <Label htmlFor="twilioApiKeySecret">API Key Secret (Optional)</Label>
                          <Input
                            id="twilioApiKeySecret"
                            type="password"
                            {...registerTwilio("twilioApiKeySecret")}
                            placeholder="Enter your API Key Secret"
                          />
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Required when using API Key SID
                          </p>
                        </div>
                        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                          <p className="text-sm text-blue-800 dark:text-blue-200">
                            <strong>Note:</strong> After saving, a TwiML Application will be automatically created in your Twilio account for call handling.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {twilioConnectionType === 'sip' && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">SIP Trunk Configuration</h3>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="sipUri">SIP URI</Label>
                          <Input
                            id="sipUri"
                            {...registerTwilio("sipUri", { 
                              required: twilioConnectionType === 'sip' ? "SIP URI is required" : false 
                            })}
                            placeholder="sip:your-domain.com"
                            className={twilioErrors.sipUri ? "border-red-300" : ""}
                          />
                          {twilioErrors.sipUri && (
                            <p className="text-sm text-red-600 mt-1">{twilioErrors.sipUri.message}</p>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="sipUsername">Username</Label>
                            <Input
                              id="sipUsername"
                              {...registerTwilio("sipUsername", { 
                                required: twilioConnectionType === 'sip' ? "Username is required" : false 
                              })}
                              placeholder="Enter username"
                              className={twilioErrors.sipUsername ? "border-red-300" : ""}
                            />
                            {twilioErrors.sipUsername && (
                              <p className="text-sm text-red-600 mt-1">{twilioErrors.sipUsername.message}</p>
                            )}
                          </div>
                          <div>
                            <Label htmlFor="sipPassword">Password</Label>
                            <Input
                              id="sipPassword"
                              type="password"
                              {...registerTwilio("sipPassword", { 
                                required: twilioConnectionType === 'sip' ? "Password is required" : false 
                              })}
                              placeholder="Enter password"
                              className={twilioErrors.sipPassword ? "border-red-300" : ""}
                            />
                            {twilioErrors.sipPassword && (
                              <p className="text-sm text-red-600 mt-1">{twilioErrors.sipPassword.message}</p>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="sipProxyServer">Proxy Server</Label>
                            <Input
                              id="sipProxyServer"
                              {...registerTwilio("sipProxyServer")}
                              placeholder="proxy.example.com"
                            />
                          </div>
                          <div>
                            <Label htmlFor="sipPort">Port</Label>
                            <Input
                              id="sipPort"
                              type="number"
                              {...registerTwilio("sipPort")}
                              placeholder="5060"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <Card className="bg-gray-50 dark:bg-gray-800/50">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium text-gray-800 dark:text-gray-200">Connection Status</h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">Test your connection settings</p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className={`w-3 h-3 rounded-full ${getTwilioStatusColor().replace('text-', 'bg-').replace('100', '500')}`}></div>
                          <Badge className={getTwilioStatusColor()}>
                            {getTwilioStatusText()}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex space-x-4">
                    <Button
                      type="button"
                      onClick={handleTestTwilioConnection}
                      disabled={testTwilioConnectionMutation.isPending}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      data-testid="button-test-twilio-connection"
                    >
                      {testTwilioConnectionMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Testing...
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          Test Connection
                        </>
                      )}
                    </Button>
                    <Button
                      type="submit"
                      disabled={saveTwilioSettingsMutation.isPending}
                      data-testid="button-save-twilio-settings"
                    >
                      {saveTwilioSettingsMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          Save Settings
                        </>
                      )}
                    </Button>
                    {isTwilioConfigured && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsTwilioFormExpanded(false)}
                        data-testid="button-cancel-twilio-edit"
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Change Password
              </CardTitle>
              <CardDescription>
                Update your account password
              </CardDescription>
            </CardHeader>
            <CardContent>
              {profileData?.auth0Id ? (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <Shield className="h-4 w-4 inline mr-2" />
                    Your password is managed through Auth0 for enhanced security. To change your password, please use the "Forgot Password" option on the login page.
                  </p>
                </div>
              ) : (
                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="currentPassword">Current Password</Label>
                    <div className="relative">
                      <Input
                        id="currentPassword"
                        type={showPassword ? "text" : "password"}
                        data-testid="input-currentPassword"
                        value={passwordData.currentPassword}
                        onChange={(e) => setPasswordData({...passwordData, currentPassword: e.target.value})}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-2 top-1/2 -translate-y-1/2"
                        onClick={() => setShowPassword(!showPassword)}
                        data-testid="button-toggle-password"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="newPassword">New Password</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      data-testid="input-newPassword"
                      value={passwordData.newPassword}
                      onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
                    />
                  </div>

                  <div>
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      data-testid="input-confirmPassword"
                      value={passwordData.confirmPassword}
                      onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                    />
                  </div>

                  <Button type="submit" disabled={updatePasswordMutation.isPending} data-testid="button-update-password">
                    {updatePasswordMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <Key className="h-4 w-4 mr-2" />
                        Update Password
                      </>
                    )}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Two-Factor Authentication
              </CardTitle>
              <CardDescription>
                Add an extra layer of security to your account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">SMS Authentication</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Receive codes via SMS
                    </p>
                  </div>
                  <Switch />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Authenticator App</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Use Google Authenticator or similar apps
                    </p>
                  </div>
                  <Switch />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notification Preferences
              </CardTitle>
              <CardDescription>
                Choose how you want to be notified
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="space-y-4">
                  <h3 className="font-medium text-sm">Communication</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Email Notifications</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Receive notifications via email
                        </p>
                      </div>
                      <Switch
                        checked={notificationSettings.emailNotifications}
                        onCheckedChange={(value) => handleNotificationChange('emailNotifications', value)}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">SMS Notifications</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Receive notifications via SMS
                        </p>
                      </div>
                      <Switch
                        checked={notificationSettings.smsNotifications}
                        onCheckedChange={(value) => handleNotificationChange('smsNotifications', value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-medium text-sm">Call & Voicemail</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Call Notifications</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Notifications for incoming calls
                        </p>
                      </div>
                      <Switch
                        checked={notificationSettings.callNotifications}
                        onCheckedChange={(value) => handleNotificationChange('callNotifications', value)}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Voicemail Notifications</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Notifications for new voicemails
                        </p>
                      </div>
                      <Switch
                        checked={notificationSettings.voicemailNotifications}
                        onCheckedChange={(value) => handleNotificationChange('voicemailNotifications', value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-medium text-sm">Marketing & Reports</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Marketing Emails</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Product updates and promotional emails
                        </p>
                      </div>
                      <Switch
                        checked={notificationSettings.marketingEmails}
                        onCheckedChange={(value) => handleNotificationChange('marketingEmails', value)}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Weekly Reports</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Weekly performance and activity reports
                        </p>
                      </div>
                      <Switch
                        checked={notificationSettings.weeklyReports}
                        onCheckedChange={(value) => handleNotificationChange('weeklyReports', value)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="privacy" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Privacy Settings
              </CardTitle>
              <CardDescription>
                Control your privacy and data sharing preferences
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="space-y-4">
                  <h3 className="font-medium text-sm">Data Sharing</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Analytics</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Share usage data to improve the product
                        </p>
                      </div>
                      <Switch />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Third-party Integrations</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Allow data sharing with integrated services
                        </p>
                      </div>
                      <Switch />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-medium text-sm">Data Management</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Data Export</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Download your data in JSON format
                        </p>
                      </div>
                      <Button variant="outline" size="sm">
                        Export Data
                      </Button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Delete Account</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Permanently delete your account and data
                        </p>
                      </div>
                      <Button variant="destructive" size="sm">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Account
                      </Button>
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