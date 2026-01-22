import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import ClosoLogo from "@/assets/closo_logo.png";

const emailSchema = z.object({
  email: z.string().email("Please enter a valid work email"),
});

const loginSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

const signupSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export default function AuthPage() {
  const [step, setStep] = useState<"email" | "login" | "signup">("email");
  const [email, setEmail] = useState("");
  const { user, login, register } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);

  useEffect(() => {
    if (user) {
      setLocation("/");
    }
  }, [user, setLocation]);

  const emailForm = useForm({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  });

  const loginForm = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { password: "" },
  });

  const signupForm = useForm({
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: "", password: "" },
  });

  const onEmailSubmit = async (data: { email: string }) => {
    setIsCheckingEmail(true);
    try {
      const res = await apiRequest("POST", "/api/auth/check-email", data);
      const { exists } = await res.json();
      setEmail(data.email);
      setStep(exists ? "login" : "signup");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsCheckingEmail(false);
    }
  };

  const onLoginSubmit = async (data: any) => {
    try {
      await login.mutateAsync({ username: email, password: data.password });
      toast({
        title: "Welcome back",
        description: "Successfully signed in.",
      });
    } catch (error: any) {
      toast({
        title: "Login failed",
        description: error.message || "Please check your password and try again.",
        variant: "destructive",
      });
    }
  };

  const onSignupSubmit = async (data: any) => {
    try {
      await register.mutateAsync({ email, ...data });
      toast({
        title: "Account created",
        description: "Welcome to Closo!",
      });
    } catch (error: any) {
      toast({
        title: "Signup failed",
        description: error.message || "There was an error creating your account.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#F9F9FB] flex items-center justify-center p-4">
      <div className="w-full max-w-[440px]">
        <div className="bg-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-[#EEEEEE] p-10 space-y-8">
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <img 
                src={ClosoLogo} 
                alt="Closo" 
                className="h-16 w-auto brightness-0 dark:invert opacity-90"
              />
            </div>
            <p className="text-[#666666] text-sm">
              Launch your campaign in ten minutes.<br />
              No credit card required.
            </p>
          </div>

          <div className="relative">
            {step === "email" && (
              <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Input
                    {...emailForm.register("email")}
                    placeholder="Work email"
                    className="h-12 bg-white border-[#E5E5E5] rounded-lg focus:ring-0 focus:border-black transition-all"
                  />
                  {emailForm.formState.errors.email && (
                    <p className="text-xs text-red-500">{emailForm.formState.errors.email.message}</p>
                  )}
                </div>
                <Button
                  type="submit"
                  disabled={isCheckingEmail}
                  className="w-full h-12 bg-black hover:bg-[#1a1a1a] text-white rounded-lg font-medium transition-all"
                >
                  {isCheckingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue with email"}
                </Button>
              </form>
            )}

            {step === "login" && (
              <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm text-[#666666]">Welcome back, <span className="text-black font-medium">{email}</span></p>
                  <Input
                    type="password"
                    {...loginForm.register("password")}
                    placeholder="Password"
                    autoFocus
                    className="h-12 bg-white border-[#E5E5E5] rounded-lg focus:ring-0 focus:border-black transition-all"
                  />
                  {loginForm.formState.errors.password && (
                    <p className="text-xs text-red-500">{loginForm.formState.errors.password.message}</p>
                  )}
                </div>
                <div className="flex flex-col gap-3">
                  <Button
                    type="submit"
                    disabled={login.isPending}
                    className="w-full h-12 bg-black hover:bg-[#1a1a1a] text-white rounded-lg font-medium transition-all"
                  >
                    {login.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
                  </Button>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    onClick={() => setStep("email")}
                    className="text-sm text-[#666666] hover:text-black"
                  >
                    Back to email
                  </Button>
                </div>
              </form>
            )}

            {step === "signup" && (
              <form onSubmit={signupForm.handleSubmit(onSignupSubmit)} className="space-y-4">
                <div className="space-y-4">
                  <p className="text-sm text-[#666666]">Create account for <span className="text-black font-medium">{email}</span></p>
                  <div className="space-y-2">
                    <Input
                      {...signupForm.register("fullName")}
                      placeholder="Full Name"
                      autoFocus
                      className="h-12 bg-white border-[#E5E5E5] rounded-lg focus:ring-0 focus:border-black transition-all"
                    />
                    {signupForm.formState.errors.fullName && (
                      <p className="text-xs text-red-500">{signupForm.formState.errors.fullName.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Input
                      type="password"
                      {...signupForm.register("password")}
                      placeholder="Password (min 8 chars)"
                      className="h-12 bg-white border-[#E5E5E5] rounded-lg focus:ring-0 focus:border-black transition-all"
                    />
                    {signupForm.formState.errors.password && (
                      <p className="text-xs text-red-500">{signupForm.formState.errors.password.message}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <Button
                    type="submit"
                    disabled={register.isPending}
                    className="w-full h-12 bg-black hover:bg-[#1a1a1a] text-white rounded-lg font-medium transition-all"
                  >
                    {register.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
                  </Button>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    onClick={() => setStep("email")}
                    className="text-sm text-[#666666] hover:text-black"
                  >
                    Back to email
                  </Button>
                </div>
              </form>
            )}
          </div>

          <div className="text-center">
            <p className="text-[#999999] text-[13px]">
              By signing up, you agree to the<br />
              <a href="#" className="text-[#333333] hover:underline font-medium">Terms of Use</a> and <a href="#" className="text-[#333333] hover:underline font-medium">Privacy Policy</a>.
            </p>
          </div>
        </div>
        <p className="mt-8 text-center text-[#666666] text-sm">
          We'll sign you in or create an account if you don't already have one.
        </p>
      </div>
    </div>
  );
}
