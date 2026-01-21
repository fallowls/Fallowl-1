import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "./lib/protected-route";

import DashboardPage from "@/pages/DashboardPage";
import AuthPage from "@/pages/AuthPage";
import ContactsPage from "@/pages/ContactsPage";
import DialerPage from "@/pages/DialerPage";
import RecordingsPage from "@/pages/RecordingsPage";
import SettingsPage from "@/pages/SettingsPage";
import ProfilePage from "@/pages/ProfilePage";
import SupportPage from "@/pages/SupportPage";
import LeadsPage from "@/pages/LeadsPage";
import SmsPage from "@/pages/SmsPage";
import CallLogPage from "@/pages/CallLogPage";
import VoicemailPage from "@/pages/VoicemailPage";
import UsersPage from "@/pages/UsersPage";
import notFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <ProtectedRoute path="/" component={DashboardPage} />
      <ProtectedRoute path="/contacts" component={ContactsPage} />
      <ProtectedRoute path="/dialer" component={DialerPage} />
      <ProtectedRoute path="/recordings" component={RecordingsPage} />
      <ProtectedRoute path="/settings" component={SettingsPage} />
      <ProtectedRoute path="/profile" component={ProfilePage} />
      <ProtectedRoute path="/support" component={SupportPage} />
      <ProtectedRoute path="/leads" component={LeadsPage} />
      <ProtectedRoute path="/sms" component={SmsPage} />
      <ProtectedRoute path="/calls" component={CallLogPage} />
      <ProtectedRoute path="/voicemail" component={VoicemailPage} />
      <ProtectedRoute path="/users" component={UsersPage} />
      <Route path="/auth" component={AuthPage} />
      <Route component={notFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
