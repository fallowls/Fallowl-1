import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Phone, 
  Play, 
  Pause, 
  Settings, 
  Users, 
  TrendingUp, 
  Activity,
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  Clock,
  Target,
  Zap,
  Filter,
  Search
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { DashboardMetrics, CallFunnelData } from "@shared/parallelDialerTypes";

export default function ParallelDialer() {
  const [dialerActive, setDialerActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch dashboard metrics
  const { data: metrics, isLoading: metricsLoading } = useQuery<DashboardMetrics>({
    queryKey: ['/api/dialer/metrics'],
    refetchInterval: 2000, // Refresh every 2 seconds
  });

  // Mock data for initial display (will be replaced with real data)
  const mockMetrics: DashboardMetrics = {
    totalQueued: 45,
    activeRinging: 8,
    connected: 3,
    completedToday: 127,
    connectionRate: 42.5,
    averageDialerSpeed: 15.3,
    systemCapacity: 65,
    totalAttempts: 298,
    successfulConnections: 127,
    failedCalls: 89,
    voicemailCount: 82,
    averageCallDuration: 185
  };

  const displayMetrics = metrics || mockMetrics;

  // Call funnel data
  const funnelData: CallFunnelData[] = [
    { stage: 'Queued', count: displayMetrics.totalQueued, percentage: 100, color: '#FCD34D' },
    { stage: 'Ringing', count: displayMetrics.activeRinging, percentage: (displayMetrics.activeRinging / displayMetrics.totalQueued) * 100, color: '#60A5FA' },
    { stage: 'Connected', count: displayMetrics.connected, percentage: (displayMetrics.connected / displayMetrics.totalQueued) * 100, color: '#34D399' },
    { stage: 'Completed', count: displayMetrics.completedToday, percentage: displayMetrics.connectionRate, color: '#9CA3AF' },
  ];

  const handleToggleDialer = () => {
    setDialerActive(!dialerActive);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Phone className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Parallel Dialer</h1>
            </div>
            <Badge 
              variant={dialerActive ? "default" : "secondary"}
              className={dialerActive ? "bg-green-500 dark:bg-green-600" : ""}
              data-testid="badge-dialer-status"
            >
              {dialerActive ? "Active" : "Inactive"}
            </Badge>
          </div>

          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
              <Input
                type="text"
                placeholder="Search calls, leads, agents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-64 bg-gray-50 dark:bg-gray-900"
                data-testid="input-search-dialer"
              />
            </div>

            {/* Filter */}
            <Button variant="outline" size="sm" data-testid="button-filter">
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </Button>

            {/* Settings */}
            <Button variant="outline" size="sm" data-testid="button-settings">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>

            {/* Start/Stop Dialer */}
            <Button
              onClick={handleToggleDialer}
              className={dialerActive 
                ? "bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800" 
                : "bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800"
              }
              data-testid="button-toggle-dialer"
            >
              {dialerActive ? (
                <>
                  <Pause className="w-4 h-4 mr-2" />
                  Stop Dialer
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Start Dialer
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Metrics Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Queued Calls */}
          <Card className="bg-white dark:bg-gray-800" data-testid="card-metric-queued">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Queued Calls
              </CardTitle>
              <Clock className="w-4 h-4 text-yellow-500 dark:text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900 dark:text-white" data-testid="text-queued-count">
                {displayMetrics.totalQueued}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Waiting to dial
              </p>
            </CardContent>
          </Card>

          {/* Ringing Calls */}
          <Card className="bg-white dark:bg-gray-800" data-testid="card-metric-ringing">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Ringing Calls
              </CardTitle>
              <PhoneIncoming className="w-4 h-4 text-blue-500 dark:text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900 dark:text-white" data-testid="text-ringing-count">
                {displayMetrics.activeRinging}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Currently ringing
              </p>
            </CardContent>
          </Card>

          {/* Connected Calls */}
          <Card className="bg-white dark:bg-gray-800" data-testid="card-metric-connected">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Connected
              </CardTitle>
              <PhoneCall className="w-4 h-4 text-green-500 dark:text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900 dark:text-white" data-testid="text-connected-count">
                {displayMetrics.connected}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Active conversations
              </p>
            </CardContent>
          </Card>

          {/* Completed Today */}
          <Card className="bg-white dark:bg-gray-800" data-testid="card-metric-completed">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Completed Today
              </CardTitle>
              <Target className="w-4 h-4 text-gray-500 dark:text-gray-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900 dark:text-white" data-testid="text-completed-count">
                {displayMetrics.completedToday}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Total calls completed
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Performance Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Connection Rate */}
          <Card className="bg-white dark:bg-gray-800" data-testid="card-connection-rate">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Connection Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-bold text-gray-900 dark:text-white" data-testid="text-connection-rate">
                    {displayMetrics.connectionRate.toFixed(1)}%
                  </span>
                </div>
                <Progress 
                  value={displayMetrics.connectionRate} 
                  className="h-2"
                  data-testid="progress-connection-rate"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {displayMetrics.successfulConnections} of {displayMetrics.totalAttempts} attempts
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Dialer Speed */}
          <Card className="bg-white dark:bg-gray-800" data-testid="card-dialer-speed">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Dialer Speed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-bold text-gray-900 dark:text-white" data-testid="text-dialer-speed">
                    {displayMetrics.averageDialerSpeed.toFixed(1)}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400 mb-1">calls/min</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Current pacing rate
                </p>
              </div>
            </CardContent>
          </Card>

          {/* System Capacity */}
          <Card className="bg-white dark:bg-gray-800" data-testid="card-system-capacity">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center gap-2">
                <Activity className="w-4 h-4" />
                System Capacity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-bold text-gray-900 dark:text-white" data-testid="text-system-capacity">
                    {displayMetrics.systemCapacity}%
                  </span>
                </div>
                <Progress 
                  value={displayMetrics.systemCapacity} 
                  className="h-2"
                  data-testid="progress-system-capacity"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Resource utilization
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Call Funnel Visualization */}
        <Card className="bg-white dark:bg-gray-800" data-testid="card-call-funnel">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
              Call Funnel - Real-Time Flow
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {funnelData.map((stage, index) => (
                <div key={stage.stage} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: stage.color }}
                      />
                      <span className="font-medium text-gray-900 dark:text-white">
                        {stage.stage}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {stage.percentage.toFixed(1)}%
                      </span>
                      <span 
                        className="text-lg font-bold text-gray-900 dark:text-white min-w-[3rem] text-right"
                        data-testid={`text-funnel-${stage.stage.toLowerCase()}`}
                      >
                        {stage.count}
                      </span>
                    </div>
                  </div>
                  <div className="relative h-8 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 transition-all duration-500"
                      style={{
                        width: `${stage.percentage}%`,
                        backgroundColor: stage.color,
                        opacity: 0.8
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Call Outcome Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-white dark:bg-gray-800" data-testid="card-outcome-successful">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Successful</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-500" data-testid="text-outcome-successful">
                    {displayMetrics.successfulConnections}
                  </p>
                </div>
                <PhoneCall className="w-8 h-8 text-green-600 dark:text-green-500 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-gray-800" data-testid="card-outcome-voicemail">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Voicemail</p>
                  <p className="text-2xl font-bold text-purple-600 dark:text-purple-500" data-testid="text-outcome-voicemail">
                    {displayMetrics.voicemailCount}
                  </p>
                </div>
                <PhoneOff className="w-8 h-8 text-purple-600 dark:text-purple-500 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-gray-800" data-testid="card-outcome-failed">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Failed</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-500" data-testid="text-outcome-failed">
                    {displayMetrics.failedCalls}
                  </p>
                </div>
                <PhoneOff className="w-8 h-8 text-red-600 dark:text-red-500 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-gray-800" data-testid="card-avg-duration">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Avg. Duration</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-500" data-testid="text-avg-duration">
                    {Math.floor(displayMetrics.averageCallDuration / 60)}:{String(displayMetrics.averageCallDuration % 60).padStart(2, '0')}
                  </p>
                </div>
                <Clock className="w-8 h-8 text-blue-600 dark:text-blue-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Placeholder for Call Cards Grid (to be implemented in next task) */}
        <Card className="bg-white dark:bg-gray-800">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
              Active Calls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <Phone className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Call cards will appear here when dialing is active</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
