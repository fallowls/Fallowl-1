import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "./lib/protected-route";

import Layout from "@/components/layout/Layout";

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <ProtectedRoute path="/" component={Layout} />
      <ProtectedRoute path="/contacts" component={Layout} />
      <ProtectedRoute path="/dialer" component={Layout} />
      <ProtectedRoute path="/recordings" component={Layout} />
      <ProtectedRoute path="/settings" component={Layout} />
      <ProtectedRoute path="/profile" component={Layout} />
      <ProtectedRoute path="/support" component={Layout} />
      <ProtectedRoute path="/leads" component={Layout} />
      <ProtectedRoute path="/sms" component={Layout} />
      <ProtectedRoute path="/calls" component={Layout} />
      <ProtectedRoute path="/voicemail" component={Layout} />
      <ProtectedRoute path="/users" component={Layout} />
      <ProtectedRoute path="/admin/security" component={Layout} />
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
