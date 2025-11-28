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
    <div className="min-h-full w-full bg-background">
      <div className="p-4 md:p-6 space-y-4 max-w-[1800px] mx-auto">
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-[16px] bg-gradient-to-br from-teal-500 to-teal-600 shadow-lg shadow-teal-500/25 animate-pulse">
              <Phone className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Parallel Dialer</h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin text-teal-500" />
                <span>Initializing phone system{dots}</span>
              </div>
            </div>
          </div>

          {/* Quick Stats Skeleton */}
          <div className="flex items-center gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="p-1.5 w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700" />
                <div>
                  <Skeleton className="h-5 w-8 mb-1 bg-gray-200 dark:bg-gray-700" />
                  <Skeleton className="h-3 w-12 bg-gray-200 dark:bg-gray-700" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Control Bar Skeleton */}
        <Card className="rounded-[16px] border border-gray-200 dark:border-gray-800 shadow-[0_4px_14px_rgba(0,0,0,0.06)]">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <Skeleton className="h-9 w-48 rounded-md bg-gray-200 dark:bg-gray-700" />
              <Skeleton className="h-9 w-32 rounded-md bg-gray-200 dark:bg-gray-700" />
              <div className="flex-1" />
              <Skeleton className="h-10 w-32 rounded-md bg-teal-100 dark:bg-teal-900/30" />
              <Skeleton className="h-10 w-10 rounded-md bg-gray-200 dark:bg-gray-700" />
            </div>
          </CardContent>
        </Card>

        {/* Main Content - Three Panel Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Queue Panel Skeleton */}
          <Card className="lg:col-span-3 rounded-[16px] border border-gray-200 dark:border-gray-800 shadow-[0_4px_14px_rgba(0,0,0,0.06)]">
            <CardHeader className="pb-3 px-4 pt-4 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="w-8 h-8 rounded-[12px] bg-blue-100 dark:bg-blue-900/30" />
                  <Skeleton className="h-5 w-16 bg-gray-200 dark:bg-gray-700" />
                </div>
                <Skeleton className="h-5 w-20 rounded-full bg-gray-200 dark:bg-gray-700" />
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-full mb-1 bg-gray-200 dark:bg-gray-700" />
                    <Skeleton className="h-3 w-24 bg-gray-200 dark:bg-gray-700" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Active Lines Panel Skeleton */}
          <Card className="lg:col-span-6 rounded-[16px] border border-gray-200 dark:border-gray-800 shadow-[0_4px_14px_rgba(0,0,0,0.06)]">
            <CardHeader className="pb-3 px-4 pt-4 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="w-8 h-8 rounded-[12px] bg-teal-100 dark:bg-teal-900/30" />
                  <Skeleton className="h-5 w-24 bg-gray-200 dark:bg-gray-700" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i} className="border-2 border-gray-200 dark:border-gray-700">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Skeleton className="w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-700" />
                          <Skeleton className="h-4 w-12 bg-gray-200 dark:bg-gray-700" />
                        </div>
                        <Skeleton className="h-5 w-14 rounded-full bg-gray-200 dark:bg-gray-700" />
                      </div>
                      <div className="py-4 text-center">
                        <Skeleton className="h-3 w-24 mx-auto bg-gray-200 dark:bg-gray-700" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Completed Panel Skeleton */}
          <Card className="lg:col-span-3 rounded-[16px] border border-gray-200 dark:border-gray-800 shadow-[0_4px_14px_rgba(0,0,0,0.06)]">
            <CardHeader className="pb-3 px-4 pt-4 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="w-8 h-8 rounded-[12px] bg-emerald-100 dark:bg-emerald-900/30" />
                  <Skeleton className="h-5 w-20 bg-gray-200 dark:bg-gray-700" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full bg-gray-200 dark:bg-gray-700" />
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <div className="flex flex-col items-center justify-center py-8">
                <div className="p-3 rounded-full bg-gray-100 dark:bg-gray-800 mb-3">
                  <Phone className="h-6 w-6 text-gray-400" />
                </div>
                <Skeleton className="h-3 w-40 bg-gray-200 dark:bg-gray-700" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stats Cards Skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="rounded-[16px] border border-gray-200 dark:border-gray-800 shadow-[0_4px_14px_rgba(0,0,0,0.06)]">
              <CardContent className="p-3">
                <div className="flex items-center gap-2.5">
                  <Skeleton className="p-2 w-10 h-10 rounded-[12px] bg-gray-200 dark:bg-gray-700" />
                  <div>
                    <Skeleton className="h-3 w-16 mb-1 bg-gray-200 dark:bg-gray-700" />
                    <Skeleton className="h-6 w-8 bg-gray-200 dark:bg-gray-700" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Loading Message */}
        <div className="text-center py-4 space-y-2">
          <p className="text-sm text-muted-foreground">
            Setting up your voice connection. Please ensure microphone access is enabled.
          </p>
          <p className="text-xs text-muted-foreground">
            If this takes too long, try refreshing the page or checking your microphone permissions.
          </p>
        </div>
      </div>
    </div>
  );
}
