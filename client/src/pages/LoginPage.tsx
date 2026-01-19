import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Shield } from "lucide-react";
import ClosoLogo from "@assets/closo_logo_png_1768808340025.png";

export default function LoginPage() {
  const { login, isLoading } = useAuth();

  const handleLogin = () => {
    login.mutate();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo and Header */}
        <div className="text-center">
          <div className="flex items-center justify-center mb-6 group">
            <img 
              src={ClosoLogo} 
              alt="Closo" 
              className="h-20 w-auto brightness-0 dark:invert transition-all duration-500 group-hover:scale-110 animate-in fade-in zoom-in"
            />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Welcome to Closo
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Sign in to access your account
          </p>
        </div>

        {/* Login Card */}
        <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm dark:bg-gray-800/80">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-semibold text-center">
              Secure Sign In
            </CardTitle>
            <CardDescription className="text-center">
              Authentication powered by Auth0
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={handleLogin}
              className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors duration-200"
              data-testid="button-login"
            >
              <Shield className="mr-2 h-5 w-5" />
              Sign In with Auth0
            </Button>
            
            <div className="text-center text-sm text-gray-500 dark:text-gray-400">
              <p>Secure authentication with industry-standard protocols</p>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-sm text-gray-500 dark:text-gray-400">
          <p>© 2026 Closo. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}