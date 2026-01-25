import { Card, CardContent } from "@/components/ui/card";
import { Phone, CheckCircle, Volume2, XCircle, BarChart3, Timer } from "lucide-react";

interface DialerStatsProps {
  stats: {
    totalDialed: number;
    connected: number;
    voicemails: number;
    failed: number;
    connectRate: number;
    avgConnectTime: number;
  };
}

export function DialerStats({ stats }: DialerStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
      <Card className="rounded-[16px] border border-gray-200 dark:border-gray-800 shadow-[0_4px_14px_rgba(0,0,0,0.06)]">
        <CardContent className="p-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-[12px] bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/30 dark:to-blue-800/20">
              <Phone className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Dialed</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.totalDialed}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[16px] border border-gray-200 dark:border-gray-800 shadow-[0_4px_14px_rgba(0,0,0,0.06)]">
        <CardContent className="p-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-[12px] bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-900/30 dark:to-emerald-800/20">
              <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Connected</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.connected}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[16px] border border-gray-200 dark:border-gray-800 shadow-[0_4px_14px_rgba(0,0,0,0.06)]">
        <CardContent className="p-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-[12px] bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-900/30 dark:to-amber-800/20">
              <Volume2 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Voicemails</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.voicemails}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[16px] border border-gray-200 dark:border-gray-800 shadow-[0_4px_14px_rgba(0,0,0,0.06)]">
        <CardContent className="p-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-[12px] bg-gradient-to-br from-red-100 to-red-50 dark:from-red-900/30 dark:to-red-800/20">
              <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Failed</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.failed}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[16px] border border-gray-200 dark:border-gray-800 shadow-[0_4px_14px_rgba(0,0,0,0.06)]">
        <CardContent className="p-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-[12px] bg-gradient-to-br from-teal-100 to-teal-50 dark:from-teal-900/30 dark:to-teal-800/20">
              <BarChart3 className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Connect Rate</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.connectRate}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[16px] border border-gray-200 dark:border-gray-800 shadow-[0_4px_14px_rgba(0,0,0,0.06)]">
        <CardContent className="p-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-[12px] bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-900/30 dark:to-purple-800/20">
              <Timer className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Avg Connect</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.avgConnectTime}s</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
