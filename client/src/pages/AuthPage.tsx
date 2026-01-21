import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertUserSchema, type InsertUser } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import ClosoLogo from "@assets/closo_logo_png_1768808340025.png";
import { Loader2, Shield } from "lucide-react";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const { login, register, isLoading } = useAuth();
  const { toast } = useToast();

  const form = useForm<InsertUser>({
    resolver: zodResolver(insertUserSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onSubmit = async (data: any) => {
    console.log("Form submission triggered", data);
    try {
      if (isLogin) {
        console.log("Calling login mutate");
        await login.mutateAsync(data);
      } else {
        console.log("Calling register mutate");
        // Ensure email is set if it's missing but username looks like one
        const registrationData = {
          ...data,
          email: data.email || (data.username.includes('@') ? data.username : `${data.username}@example.com`)
        };
        await register.mutateAsync(registrationData);
      }
    } catch (error: any) {
      console.error("Auth submit error:", error);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 flex flex-col md:flex-row">
      {/* Left side: Visual/Marketing */}
      <div className="hidden md:flex md:w-1/2 bg-neutral-50 dark:bg-neutral-900 items-center justify-center p-12 border-r border-neutral-200 dark:border-neutral-800">
        <div className="max-w-md space-y-6">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 text-blue-600 dark:text-blue-400 text-sm font-medium">
            <Shield className="w-4 h-4" />
            <span>Secure Enterprise Communication</span>
          </div>
          <h2 className="text-4xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
            Elevate your business <span className="text-blue-600">communication</span>
          </h2>
          <p className="text-lg text-neutral-600 dark:text-neutral-400 leading-relaxed">
            The all-in-one platform for calls, SMS, and CRM. Streamline your workflow with our advanced dialer and customer management tools.
          </p>
          <div className="pt-8 grid grid-cols-2 gap-6">
            <div className="space-y-2 group cursor-default">
              <h4 className="font-semibold text-neutral-900 dark:text-neutral-50 group-hover:text-blue-600 transition-colors">Advanced Dialer</h4>
              <p className="text-sm text-neutral-500">Built-in keypad and real-time status.</p>
            </div>
            <div className="space-y-2 group cursor-default">
              <h4 className="font-semibold text-neutral-900 dark:text-neutral-50 group-hover:text-blue-600 transition-colors">Smart CRM</h4>
              <p className="text-sm text-neutral-500">Intelligent contact management.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right side: Auth Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white dark:bg-neutral-950">
        <div className="w-full max-w-[400px] space-y-8">
          <div className="space-y-6">
            <div className="flex justify-start">
              <img 
                src={ClosoLogo} 
                alt="Closo" 
                className="h-10 w-auto brightness-0 dark:invert opacity-90"
              />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
                {isLogin ? "Welcome back" : "Create an account"}
              </h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                {isLogin 
                  ? "Enter your credentials to access your workspace" 
                  : "Join Closo to start managing your communications"}
              </p>
            </div>
          </div>

          <Tabs 
            value={isLogin ? "login" : "register"} 
            className="space-y-6" 
            onValueChange={(v) => {
              setIsLogin(v === "login");
              form.reset({
                username: "",
                password: "",
              });
            }}
          >
            <TabsList className="grid w-full grid-cols-2 h-11 p-1 bg-neutral-100 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 rounded-lg">
              <TabsTrigger 
                value="login" 
                className="rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-800 data-[state=active]:text-neutral-950 dark:data-[state=active]:text-neutral-50 data-[state=active]:shadow-sm transition-all text-neutral-500 dark:text-neutral-400"
              >
                Login
              </TabsTrigger>
              <TabsTrigger 
                value="register" 
                className="rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-800 data-[state=active]:text-neutral-950 dark:data-[state=active]:text-neutral-50 data-[state=active]:shadow-sm transition-all text-neutral-500 dark:text-neutral-400"
              >
                Sign up
              </TabsTrigger>
            </TabsList>
            
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Username</Label>
                  <Input 
                    id="username" 
                    {...form.register("username")} 
                    placeholder="Username or email"
                    className="h-11 bg-transparent border-neutral-200 dark:border-neutral-800 focus:ring-1 focus:ring-blue-500 transition-all"
                  />
                  {form.formState.errors.username && (
                    <p className="text-xs font-medium text-red-500">{form.formState.errors.username.message}</p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Password</Label>
                    {isLogin && (
                      <Button type="button" variant="link" className="p-0 h-auto text-xs text-blue-600 font-medium">
                        Forgot password?
                      </Button>
                    )}
                  </div>
                  <Input 
                    id="password" 
                    type="password" 
                    {...form.register("password")} 
                    placeholder="••••••••"
                    className="h-11 bg-transparent border-neutral-200 dark:border-neutral-800 focus:ring-1 focus:ring-blue-500 transition-all"
                  />
                  {form.formState.errors.password && (
                    <p className="text-xs font-medium text-red-500">{form.formState.errors.password.message}</p>
                  )}
                </div>
              </div>

              <Button
                type="submit"
                disabled={isLoading || login.isPending || register.isPending}
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium transition-all"
              >
                {(isLoading || login.isPending || register.isPending) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>{isLogin ? "Sign In" : "Get Started"}</>
                )}
              </Button>

              <p className="text-center text-xs text-neutral-500 dark:text-neutral-500 px-8 leading-relaxed">
                By clicking continue, you agree to our{" "}
                <Button variant="link" className="p-0 h-auto text-xs text-neutral-500 underline underline-offset-4">Terms of Service</Button>{" "}
                and{" "}
                <Button variant="link" className="p-0 h-auto text-xs text-neutral-500 underline underline-offset-4">Privacy Policy</Button>.
              </p>
            </form>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
