import { useStore } from "@/store/useStore";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { canAccessView } from "@/lib/accessControl";
import Sidebar from "./Sidebar";
import Header from "./Header";
import CallNotificationBar from "./CallNotificationBar";
import IncomingCallScreen from "../dialer/IncomingCallScreen";
import OnCallScreen from "../dialer/OnCallScreen";
import DashboardPage from "@/pages/DashboardPage";
import DialerPage from "@/pages/DialerPage";
import CallLogPage from "@/pages/CallLogPage";
import SmsPage from "@/pages/SmsPage";
import ContactsPage from "@/pages/ContactsPage";
import VoicemailPage from "@/pages/VoicemailPage";
import UsersPage from "@/pages/UsersPage";
import SmtpPage from "@/pages/SmtpPage";
import PaymentsPage from "@/pages/PaymentsPage";
import CdnPage from "@/pages/CdnPage";
import CallSettingsPage from "@/pages/CallSettingsPage";
import SettingsPage from "@/pages/SettingsPage";
import SupportPage from "@/pages/SupportPage";
import ProfilePage from "@/pages/ProfilePage";
import LeadsPage from "@/pages/LeadsPage";
import CalendarPage from "@/pages/CalendarPage";
import ParallelDialerPage from "@/pages/ParallelDialerPage";
import ParallelDialerVerificationPage from "@/pages/ParallelDialerVerificationPage";
import MyWorkPage from "@/pages/MyWorkPage";

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
          {showIncomingCallScreen ? (
            <IncomingCallScreen />
          ) : showOnCallScreen ? (
            <OnCallScreen />
          ) : (
            <CurrentPage />
          )}
        </main>
      </div>
      {showCallBar && <CallNotificationBar />}
    </div>
  );
}
