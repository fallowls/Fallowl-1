import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useStore } from "@/store/useStore";
import { DashboardPageSkeleton } from "@/components/skeletons/DashboardPageSkeleton";
import { 
  Phone, 
  MessageSquare, 
  Users, 
  PlayCircle, 
  Voicemail, 
  TrendingUp, 
  PhoneCall,
  MessageCircle,
  UserPlus,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRight
} from "lucide-react";
import { format } from "date-fns";

// Type definitions based on schema
type Call = {
  id: number;
  phone: string;
  type: string;
  status: string;
  duration: number;
  createdAt: string;
};

type Message = {
  id: number;
  phone: string;
  content: string;
  type: string;
  status: string;
  createdAt: string;
};

type Contact = {
  id: number;
  name: string;
  phone: string;
  email?: string;
};

type Recording = {
  id: number;
  duration: number;
  status: string;
};

type Voicemail = {
  id: number;
  isRead: boolean;
};

export default function DashboardPage() {
  const { setCurrentView } = useStore();

  // Fetch all dashboard data
  const { data: calls = [], isLoading: callsLoading } = useQuery<Call[]>({
    queryKey: ['/api/calls'],
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ['/api/messages'],
  });

  const { data: contacts = [], isLoading: contactsLoading } = useQuery<Contact[]>({
    queryKey: ['/api/contacts'],
  });

  const { data: recordings = [], isLoading: recordingsLoading } = useQuery<Recording[]>({
    queryKey: ['/api/recordings'],
  });

  const { data: voicemails = [], isLoading: voicemailsLoading } = useQuery<Voicemail[]>({
    queryKey: ['/api/voicemails'],
  });

  // Calculate dashboard statistics
  const stats = {
    totalCalls: calls.length,
    totalMessages: messages.length,
    totalContacts: contacts.length,
    totalRecordings: recordings.length,
    totalVoicemails: voicemails.length,
    unreadVoicemails: voicemails.filter(vm => !vm.isRead).length,
    callsToday: calls.filter(call => {
      const today = new Date();
      const callDate = new Date(call.createdAt);
      return callDate.toDateString() === today.toDateString();
    }).length,
    messagesThisWeek: messages.filter(msg => {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return new Date(msg.createdAt) >= weekAgo;
    }).length,
    completedCalls: calls.filter(call => call.status === 'completed').length,
    missedCalls: calls.filter(call => call.type === 'missed').length,
    averageCallDuration: calls.length > 0 
      ? Math.round(calls.reduce((sum, call) => sum + (call.duration || 0), 0) / calls.length)
      : 0,
    successRate: calls.length > 0 
      ? Math.round((calls.filter(call => call.status === 'completed').length / calls.length) * 100)
      : 0
  };

  const isLoading = callsLoading || messagesLoading || contactsLoading || recordingsLoading || voicemailsLoading;

  // Recent activity from calls
  const recentCalls = [...calls]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  if (isLoading) {
    return (
      <div className="p-4">
        <DashboardPageSkeleton />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">

      {/* Main Stats Grid - Modern 3 column layout with animations */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Calls Card */}
        <Card className="card-hover stagger-item border-0 shadow-md" onClick={() => setCurrentView('call-log')} data-testid="card-calls">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-400 to-blue-600 shadow-lg shadow-blue-500/30">
                  <Phone className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total Calls</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{stats.totalCalls}</p>
                  <p className="text-xs text-teal-600 dark:text-teal-400 mt-1 font-medium">+{stats.callsToday} today</p>
                </div>
              </div>
              <ArrowUpRight className="h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
            </div>
          </CardContent>
        </Card>

        {/* Messages Card */}
        <Card className="card-hover stagger-item border-0 shadow-md" onClick={() => setCurrentView('sms')} data-testid="card-messages">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-2xl bg-gradient-to-br from-teal-400 to-teal-600 shadow-lg shadow-teal-500/30">
                  <MessageSquare className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Messages</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{stats.totalMessages}</p>
                  <p className="text-xs text-teal-600 dark:text-teal-400 mt-1 font-medium">+{stats.messagesThisWeek} this week</p>
                </div>
              </div>
              <ArrowUpRight className="h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
            </div>
          </CardContent>
        </Card>

        {/* Contacts Card */}
        <Card className="card-hover stagger-item border-0 shadow-md" onClick={() => setCurrentView('contacts')} data-testid="card-contacts">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-2xl bg-gradient-to-br from-purple-400 to-purple-600 shadow-lg shadow-purple-500/30">
                  <Users className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Contacts</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{stats.totalContacts}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium">Total in database</p>
                </div>
              </div>
              <ArrowUpRight className="h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Stats - 4 column modern layout */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="hover-lift stagger-item border-0 shadow-sm cursor-pointer" onClick={() => setCurrentView('recordings')} data-testid="card-recordings">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-orange-100 to-orange-50 dark:from-orange-900/30 dark:to-orange-800/20">
                <PlayCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Recordings</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalRecordings}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover-lift stagger-item border-0 shadow-sm cursor-pointer" onClick={() => setCurrentView('voicemail')} data-testid="card-voicemails">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-red-100 to-red-50 dark:from-red-900/30 dark:to-red-800/20">
                <Voicemail className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Voicemails</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalVoicemails}</p>
                {stats.unreadVoicemails > 0 && (
                  <Badge variant="destructive" className="text-xs h-5 px-2 mt-1">{stats.unreadVoicemails} new</Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover-lift stagger-item border-0 shadow-sm" data-testid="card-success-rate">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-900/30 dark:to-emerald-800/20">
                <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Success Rate</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.successRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover-lift stagger-item border-0 shadow-sm" data-testid="card-avg-duration">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/30 dark:to-blue-800/20">
                <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Avg Duration</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{Math.floor(stats.averageCallDuration / 60)}m {stats.averageCallDuration % 60}s</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance & Activity - 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Performance Metrics */}
        <Card className="border-0 shadow-md animate-fade-in">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2 font-bold text-gray-900 dark:text-white">
              <div className="p-2 rounded-xl bg-gradient-to-br from-teal-100 to-teal-50 dark:from-teal-900/30 dark:to-teal-800/20">
                <TrendingUp className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              </div>
              Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600 dark:text-gray-400">Call Success Rate</span>
                <span className="font-medium">{stats.successRate}%</span>
              </div>
              <Progress value={stats.successRate} className="h-1.5" />
            </div>
            
            <div className="pt-3 border-t space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                  <span className="text-gray-600">Completed</span>
                </div>
                <span className="font-medium">{stats.completedCalls}</span>
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <XCircle className="h-3.5 w-3.5 text-red-600" />
                  <span className="text-gray-600">Missed</span>
                </div>
                <span className="font-medium">{stats.missedCalls}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="border-0 shadow-md animate-fade-in">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2 font-bold text-gray-900 dark:text-white">
                <div className="p-2 rounded-xl bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/30 dark:to-blue-800/20">
                  <Phone className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                Recent Calls
              </CardTitle>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 text-xs hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                onClick={() => setCurrentView('call-log')}
                data-testid="button-view-all-calls"
              >
                View All <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {isLoading ? (
                <p className="text-sm text-gray-500 text-center py-4">Loading...</p>
              ) : recentCalls.length > 0 ? (
                recentCalls.map((call) => (
                  <div 
                    key={call.id} 
                    className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    data-testid={`call-item-${call.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-full ${
                        call.type === 'incoming' ? 'bg-green-100 dark:bg-green-900' :
                        call.type === 'outgoing' ? 'bg-blue-100 dark:bg-blue-900' :
                        'bg-red-100 dark:bg-red-900'
                      }`}>
                        <PhoneCall className={`h-3 w-3 ${
                          call.type === 'incoming' ? 'text-green-600' :
                          call.type === 'outgoing' ? 'text-blue-600' :
                          'text-red-600'
                        }`} />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{call.phone}</p>
                        <p className="text-xs text-gray-500">
                          {format(new Date(call.createdAt), 'MMM d, h:mm a')}
                        </p>
                      </div>
                    </div>
                    <Badge 
                      variant={call.status === 'completed' ? 'default' : 'secondary'}
                      className="text-xs h-5"
                    >
                      {call.status}
                    </Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">No recent calls</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="border-0 shadow-md animate-fade-in">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-bold text-gray-900 dark:text-white">Quick Actions</CardTitle>
          <CardDescription className="text-sm text-gray-500 dark:text-gray-400">
            Start your most common tasks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Button 
              variant="outline" 
              className="flex items-center gap-2 h-auto p-3 justify-start"
              onClick={() => setCurrentView('dialer')}
              data-testid="button-make-call"
            >
              <PhoneCall className="h-4 w-4" />
              <div className="text-left">
                <div className="font-medium text-sm">Make Call</div>
                <div className="text-xs text-gray-500">Start dialing</div>
              </div>
            </Button>
            
            <Button 
              variant="outline" 
              className="flex items-center gap-2 h-auto p-3 justify-start"
              onClick={() => setCurrentView('sms')}
              data-testid="button-send-sms"
            >
              <MessageCircle className="h-4 w-4" />
              <div className="text-left">
                <div className="font-medium text-sm">Send SMS</div>
                <div className="text-xs text-gray-500">Message contacts</div>
              </div>
            </Button>
            
            <Button 
              variant="outline" 
              className="flex items-center gap-2 h-auto p-3 justify-start"
              onClick={() => setCurrentView('contacts')}
              data-testid="button-add-contact"
            >
              <UserPlus className="h-4 w-4" />
              <div className="text-left">
                <div className="font-medium text-sm">Add Contact</div>
                <div className="text-xs text-gray-500">New contact</div>
              </div>
            </Button>
            
            <Button 
              variant="outline" 
              className="flex items-center gap-2 h-auto p-3 justify-start"
              onClick={() => setCurrentView('recordings')}
              data-testid="button-view-recordings"
            >
              <PlayCircle className="h-4 w-4" />
              <div className="text-left">
                <div className="font-medium text-sm">Recordings</div>
                <div className="text-xs text-gray-500">Call recordings</div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
