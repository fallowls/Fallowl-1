import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient, setAccessTokenGetter, apiRequest } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import MicrophonePermissionModalV2 from "@/components/MicrophonePermissionModalV2";
import { useMicrophonePermission } from "@/hooks/useMicrophonePermission";
import { useWebSocket } from "@/hooks/useWebSocket";

interface TwilioStatus {
  isConfigured: boolean;
  hasCredentials: boolean;
  phoneNumber: string | null;
  connection: any;
  registeredDevices: number;
  lastHealthCheck: string;
}

function AppContent() {
  const { user, isLoading, getAccessTokenSilently, login, error: auth0Error } = useAuth();
  const [sessionCreated, setSessionCreated] = useState(false);
  const [authError, setAuthError] = useState<{ error: string; errorDescription: string } | null>(null);
  const [hasAttemptedLogin, setHasAttemptedLogin] = useState(() => {
    // Check sessionStorage to see if we've already attempted login
    return sessionStorage.getItem('login_attempted') === 'true';
  });

  // Initialize WebSocket connection (auto-connects when authenticated)
  useWebSocket();

  // Check for Auth0 errors from hook or redirect
  useEffect(() => {
    if (auth0Error) {
      setAuthError({
        error: auth0Error.name || 'Authentication Error',
        errorDescription: auth0Error.message || 'An error occurred during authentication'
      });
      // Clear login attempt flag on error so user can retry
      sessionStorage.removeItem('login_attempted');
      return;
    }
    
    const errorData = sessionStorage.getItem('auth0_error');
    if (errorData) {
      try {
        const parsed = JSON.parse(errorData);
        setAuthError(parsed);
        sessionStorage.removeItem('auth0_error');
        // Clear login attempt flag on error so user can retry
        sessionStorage.removeItem('login_attempted');
      } catch (e) {
        console.error('Failed to parse auth error:', e);
      }
    }
  }, [auth0Error]);

  // Set up Auth0 token getter for API requests
  useEffect(() => {
    if (getAccessTokenSilently) {
      setAccessTokenGetter(getAccessTokenSilently);
    }
  }, [getAccessTokenSilently]);

  // Create backend session after Auth0 login
  useEffect(() => {
    const createSession = async () => {
      if (user && !sessionCreated) {
        try {
          await apiRequest('POST', '/api/auth/auth0-session');
          setSessionCreated(true);
        } catch (error) {
          console.error('Failed to create session:', error);
        }
      }
    };
    createSession();
  }, [user, sessionCreated]);

  const [showMicModal, setShowMicModal] = useState(false);
  const [hasShownMicModal, setHasShownMicModal] = useState(false);

  // Check microphone permission status
  const { permission: micPermission, hasPermission } = useMicrophonePermission();

  // Check Twilio configuration status (user-specific)
  const { data: twilioStatus } = useQuery<TwilioStatus>({
    queryKey: ["/api/user/twilio/status"],
    enabled: !!user, // Only query when user is logged in
    refetchInterval: 30000, // Check every 30 seconds
  });

  // Show microphone permission modal after login (only once per session and only if permission not granted)
  useEffect(() => {
    if (user && !hasShownMicModal && twilioStatus?.isConfigured && micPermission !== 'unknown') {
      // Only show modal if permission is NOT granted
      if (!hasPermission) {
        // Small delay to ensure user has time to see the dashboard
        const timer = setTimeout(() => {
          setShowMicModal(true);
          setHasShownMicModal(true);
        }, 2000);

        return () => clearTimeout(timer);
      } else {
        // Permission already granted, no need to show modal
        setHasShownMicModal(true);
      }
    }
  }, [user, hasShownMicModal, twilioStatus?.isConfigured, micPermission, hasPermission]);

  // Auto-redirect to Auth0 login if not authenticated
  useEffect(() => {
    if (!isLoading && !user && !authError && !hasAttemptedLogin) {
      setHasAttemptedLogin(true);
      sessionStorage.setItem('login_attempted', 'true');
      login.mutate();
    }
  }, [isLoading, user, authError, hasAttemptedLogin, login]);

  // Reset login attempt after timeout if user didn't complete login
  useEffect(() => {
    if (!isLoading && !user && !authError && hasAttemptedLogin) {
      const timeout = setTimeout(() => {
        // If still no user after 3 seconds, reset and try again
        sessionStorage.removeItem('login_attempted');
        setHasAttemptedLogin(false);
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [isLoading, user, authError, hasAttemptedLogin]);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Show auth error if present
  if (authError) {
    const isCallbackMismatch = authError.errorDescription?.toLowerCase().includes('callback') || 
                                authError.error?.toLowerCase().includes('callback');
    const currentUrl = window.location.origin;
    
    return (
      <div className="h-screen flex items-center justify-center bg-white p-4">
        <div className="max-w-2xl w-full p-6 bg-white border border-border rounded-lg shadow-lg">
          <div className="text-center">
            <div className="mb-4">
              <svg
                className="mx-auto h-12 w-12 text-destructive"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">Authentication Failed</h2>
            <p className="text-muted-foreground mb-1 font-medium">Error: {authError.error}</p>
            <p className="text-sm text-muted-foreground mb-6">{authError.errorDescription}</p>
            
            {isCallbackMismatch && (
              <div className="mb-6 p-4 bg-muted rounded-lg text-left">
                <h3 className="font-semibold text-foreground mb-3">Fix: Add Callback URL to Auth0</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  You need to configure your Auth0 application to allow this URL:
                </p>
                
                <div className="space-y-3 mb-4">
                  <div className="bg-background p-3 rounded border border-border">
                    <p className="text-xs text-muted-foreground mb-1">Callback URL:</p>
                    <div className="flex gap-2">
                      <code className="flex-1 text-sm font-mono bg-muted px-2 py-1 rounded text-foreground break-all">
                        {currentUrl}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(currentUrl);
                        }}
                        className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
                        data-testid="button-copy-url"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </div>
                
                <div className="text-sm text-muted-foreground space-y-2 mb-4">
                  <p className="font-medium text-foreground">Steps to fix:</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>Go to your <a href="https://manage.auth0.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Auth0 Dashboard</a></li>
                    <li>Navigate to Applications → Your Application → Settings</li>
                    <li>Add the URL above to <strong>Allowed Callback URLs</strong></li>
                    <li>Also add it to <strong>Allowed Web Origins</strong></li>
                    <li>And <strong>Allowed Logout URLs</strong></li>
                    <li>Click "Save Changes"</li>
                  </ol>
                  <p className="text-xs text-muted-foreground mt-2">
                    💡 Tip: For local development, also add <code className="bg-muted px-1">http://localhost:5000</code> and <code className="bg-muted px-1">http://127.0.0.1:5000</code>
                  </p>
                </div>
              </div>
            )}
            
            <div className="space-y-3">
              <button
                onClick={() => {
                  setAuthError(null);
                  setHasAttemptedLogin(false);
                  sessionStorage.removeItem('login_attempted');
                }}
                className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-medium"
                data-testid="button-retry-login"
              >
                {isCallbackMismatch ? 'Retry After Updating Auth0' : 'Try Again'}
              </button>
              
              {!isCallbackMismatch && (
                <div className="pt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-2">Common issues:</p>
                  <ul className="text-xs text-muted-foreground text-left space-y-1">
                    <li>• Auth0 callback URL not configured correctly</li>
                    <li>• Invalid Auth0 credentials</li>
                    <li>• Application not authorized</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <>
      <Layout />
      <MicrophonePermissionModalV2
        open={showMicModal}
        onOpenChange={setShowMicModal}
        onPermissionGranted={() => {
          console.log('Microphone permission granted');
        }}
        onPermissionDenied={() => {
          console.log('Microphone permission denied');
        }}
      />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AppContent />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
