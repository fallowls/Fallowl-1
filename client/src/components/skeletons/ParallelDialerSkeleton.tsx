import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useEffect } from "react";

export function ParallelDialerSkeleton() {
  useEffect(() => {
    console.log('[ParallelDialerSkeleton] Skeleton is rendering - Twilio device initializing');
  }, []);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-7xl">
        {/* Header skeleton */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 p-8 text-white shadow-2xl">
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-6">
              <div>
                <Skeleton className="h-10 w-64 bg-white/20 mb-2" />
                <Skeleton className="h-4 w-48 bg-white/20" />
              </div>
              <Skeleton className="h-10 w-24 bg-white/20 rounded-full" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24 bg-white/20" />
                <Skeleton className="h-10 w-full bg-white/10" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-24 bg-white/20" />
                <Skeleton className="h-10 w-full bg-white/10" />
              </div>
              <div className="flex items-end gap-2">
                <Skeleton className="h-12 flex-1 bg-white/20" />
                <Skeleton className="h-12 w-12 bg-white/10" />
              </div>
            </div>
          </div>
        </div>

        {/* Stats cards skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-none shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <Skeleton className="h-8 w-8 rounded" />
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
                <Skeleton className="h-10 w-16 mb-1" />
                <Skeleton className="h-3 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Call lines section skeleton */}
        <Card className="border-none shadow-xl">
          <CardHeader className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-b">
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-32" />
              <div className="flex gap-2">
                <Skeleton className="h-10 w-24" />
                <Skeleton className="h-10 w-24" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="border-2">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <Skeleton className="h-5 w-20" />
                      <Skeleton className="h-6 w-16 rounded-full" />
                    </div>
                    <div className="space-y-2 mb-3">
                      <Skeleton className="h-5 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-8 w-20" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Loading message */}
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground animate-pulse">
            Initializing phone system...
          </p>
        </div>
      </div>
    </div>
  );
}
