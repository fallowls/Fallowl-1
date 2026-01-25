import { Badge } from "@/components/ui/badge";
import { Phone, CheckCircle, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

interface DialerHeaderProps {
  isReady: boolean;
  stats: {
    totalDialed: number;
    connected: number;
    connectRate: number;
  };
}

export function DialerHeader({ isReady, stats }: DialerHeaderProps) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b">
      <div className="flex items-center gap-4">
        <div className="p-3 rounded-[16px] bg-gradient-to-br from-teal-500 to-teal-600 shadow-lg shadow-teal-500/25">
          <Phone className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Parallel Dialer</h1>
          <p className="text-sm text-muted-foreground">Multi-line outbound calling system</p>
        </div>
        <Badge 
          className={cn(
            "ml-2 px-3 py-1",
            isReady 
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400" 
              : "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400"
          )}
        >
          <span className={cn(
            "w-2 h-2 rounded-full mr-2",
            isReady ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
          )} />
          {isReady ? 'Ready' : 'Connecting'}
        </Badge>
      </div>

      {/* Quick Stats */}
      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <Phone className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <span className="font-bold text-lg text-gray-900 dark:text-white">{stats.totalDialed}</span>
            <span className="text-muted-foreground ml-1">dialed</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
            <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <span className="font-bold text-lg text-gray-900 dark:text-white">{stats.connected}</span>
            <span className="text-muted-foreground ml-1">connected</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-teal-100 dark:bg-teal-900/30">
            <BarChart3 className="h-4 w-4 text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <span className="font-bold text-lg text-gray-900 dark:text-white">{stats.connectRate}%</span>
            <span className="text-muted-foreground ml-1">rate</span>
          </div>
        </div>
      </div>
    </div>
  );
}
