import { useStore } from "@/store/useStore";
import { useEffect, lazy, Suspense } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { canAccessView } from "@/lib/accessControl";
import Sidebar from "./Sidebar";
import Header from "./Header";
import CallNotificationBar from "./CallNotificationBar";
import IncomingCallScreen from "../dialer/IncomingCallScreen";
import OnCallScreen from "../dialer/OnCallScreen";

// Lazy load page components for better initial bundle size
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const DialerPage = lazy(() => import("@/pages/DialerPage"));
const CallLogPage = lazy(() => import("@/pages/CallLogPage"));
const SmsPage = lazy(() => import("@/pages/SmsPage"));
const ContactsPage = lazy(() => import("@/pages/ContactsPage"));
const VoicemailPage = lazy(() => import("@/pages/VoicemailPage"));
const UsersPage = lazy(() => import("@/pages/UsersPage"));
const SmtpPage = lazy(() => import("@/pages/SmtpPage"));
const PaymentsPage = lazy(() => import("@/pages/PaymentsPage"));
const CdnPage = lazy(() => import("@/pages/CdnPage"));
const CallSettingsPage = lazy(() => import("@/pages/CallSettingsPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const SupportPage = lazy(() => import("@/pages/SupportPage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const LeadsPage = lazy(() => import("@/pages/LeadsPage"));
const CalendarPage = lazy(() => import("@/pages/CalendarPage"));
const ParallelDialerPage = lazy(() => import("@/pages/ParallelDialerPage"));
const ParallelDialerVerificationPage = lazy(() => import("@/pages/ParallelDialerVerificationPage"));
const MyWorkPage = lazy(() => import("@/pages/MyWorkPage"));

const pageComponents = {
  dashboard: DashboardPage,
  'my-work': MyWorkPage,
  dialer: DialerPage,
  'parallel-dialer': ParallelDialerPage,
  'parallel-dialer-verification': ParallelDialerVerificationPage,
  'call-log': CallLogPage,
  sms: SmsPage,
  contacts: ContactsPage,
  leads: LeadsPage,
  calendar: CalendarPage,
  voicemail: VoicemailPage,
  users: UsersPage,
  smtp: SmtpPage,
  payments: PaymentsPage,
  cdn: CdnPage,
  'call-settings': CallSettingsPage,
  settings: SettingsPage,
  support: SupportPage,
  profile: ProfilePage,
};

export default function Layout() {
  const { currentView, darkMode, callStatus, setCurrentView } = useStore();
  const { user } = useAuth();
  
  useKeyboardShortcuts();

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
    if (!canAccessView(user?.email, currentView)) {
      setCurrentView('dashboard');
    }
  }, [currentView, user?.email, setCurrentView]);

  const CurrentPage = pageComponents[currentView as keyof typeof pageComponents] || DashboardPage;

  // Check if call notification bar should be shown
  const showCallBar = ['connecting', 'connected', 'on-hold'].includes(callStatus) && currentView !== 'dialer';

  // Show incoming call screen when there's an incoming call
  const showIncomingCallScreen = callStatus === 'incoming';
  
  // Show on-call screen when call is active AND we're on the dialer page
  const showOnCallScreen = ['connecting', 'connected', 'on-hold'].includes(callStatus) && currentView === 'dialer';

  return (
    <div className={cn("flex h-screen overflow-hidden bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950", darkMode && "dark")}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto bg-transparent scrollbar-thin">
          <Suspense fallback={
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          }>
            {showIncomingCallScreen ? (
              <IncomingCallScreen />
            ) : showOnCallScreen ? (
              <OnCallScreen />
            ) : (
              <CurrentPage />
            )}
          </Suspense>
        </main>
      </div>
      {showCallBar && <CallNotificationBar />}
    </div>
  );
}
