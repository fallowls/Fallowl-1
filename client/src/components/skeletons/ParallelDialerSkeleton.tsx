import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { Phone, Loader2 } from "lucide-react";

export function ParallelDialerSkeleton() {
  const [dots, setDots] = useState('');
  
  useEffect(() => {
    console.log('[ParallelDialerSkeleton] Skeleton is rendering - Twilio device initializing');
    
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 500);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-full w-full bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-7xl">
        {/* Prominent Loading Header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 p-8 text-white shadow-2xl">
          <div className="absolute inset-0 bg-black/10" />
          <div className="relative z-10">
            <div className="flex flex-col items-center justify-center py-8">
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-white/20 rounded-full animate-ping" />
                <div className="relative bg-white/30 rounded-full p-6">
                  <Phone className="w-12 h-12 text-white" />
                </div>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold mb-3">
                Parallel Dialer
              </h1>
              <div className="flex items-center gap-3 text-lg text-blue-100">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Initializing phone system{dots}</span>
              </div>
              <p className="mt-4 text-sm text-blue-200 max-w-md text-center">
                Setting up your voice connection. Please ensure microphone access is enabled.
              </p>
            </div>
          </div>
        </div>

        {/* Stats cards skeleton with better visibility */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border shadow-lg bg-white dark:bg-slate-800">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <Skeleton className="h-8 w-8 rounded bg-slate-200 dark:bg-slate-700" />
                  <Skeleton className="h-6 w-16 rounded-full bg-slate-200 dark:bg-slate-700" />
                </div>
                <Skeleton className="h-10 w-16 mb-1 bg-slate-200 dark:bg-slate-700" />
                <Skeleton className="h-3 w-24 bg-slate-200 dark:bg-slate-700" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Call lines section skeleton */}
        <Card className="border shadow-xl bg-white dark:bg-slate-800">
          <CardHeader className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-b">
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-32 bg-slate-200 dark:bg-slate-700" />
              <div className="flex gap-2">
                <Skeleton className="h-10 w-24 bg-slate-200 dark:bg-slate-700" />
                <Skeleton className="h-10 w-24 bg-slate-200 dark:bg-slate-700" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="border-2 border-slate-200 dark:border-slate-700">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <Skeleton className="h-5 w-20 bg-slate-200 dark:bg-slate-700" />
                      <Skeleton className="h-6 w-16 rounded-full bg-slate-200 dark:bg-slate-700" />
                    </div>
                    <div className="space-y-2 mb-3">
                      <Skeleton className="h-5 w-full bg-slate-200 dark:bg-slate-700" />
                      <Skeleton className="h-4 w-3/4 bg-slate-200 dark:bg-slate-700" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-16 bg-slate-200 dark:bg-slate-700" />
                      <Skeleton className="h-8 w-20 bg-slate-200 dark:bg-slate-700" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Troubleshooting tips */}
        <div className="text-center py-4 space-y-2">
          <p className="text-sm text-muted-foreground">
            If this takes too long, try refreshing the page or checking your microphone permissions.
          </p>
        </div>
      </div>
    </div>
  );
}
