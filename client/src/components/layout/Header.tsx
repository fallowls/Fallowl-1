import { useStore } from "@/store/useStore";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Menu, Moon, Sun } from "lucide-react";
import { WebSocketStatusIndicator } from "./WebSocketStatusIndicator";

const viewTitles = {
  dashboard: 'Dashboard',
  dialer: 'Dialer',
  'parallel-dialer': 'Parallel Dialer',
  'call-status-overview': 'Call Status Overview',
  'call-log': 'Call Log',
  'scheduled-calls': 'Scheduled Calls',
  'call-scripts': 'Call Scripts',
  'call-dispositions': 'Call Dispositions',
  sms: 'SMS',
  emails: 'Emails',
  contacts: 'Contacts',
  lists: 'Lists',
  leads: 'Leads',
  calendar: 'Calendar',
  voicemail: 'Voicemail',
  users: 'Users',
  smtp: 'SMTP',
  payments: 'Payments',
  cdn: 'CDN',
  'call-settings': 'Call Settings',
  settings: 'Settings',
  support: 'Support',
  profile: 'Profile',
};

export default function Header() {
  const { currentView, darkMode, setDarkMode, setMobileMenuOpen } = useStore();
  const isMobile = useIsMobile();

  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 px-4 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          {isMobile && (
            <Button
              variant="ghost"
              size="sm"
              className="mr-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="w-4 h-4" />
            </Button>
          )}
          <h1 className="text-lg font-bold text-gray-800 dark:text-white">
            {viewTitles[currentView as keyof typeof viewTitles] || 'Dashboard'}
          </h1>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="sm"
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            onClick={() => setDarkMode(!darkMode)}
          >
            {darkMode ? (
              <Sun className="w-4 h-4 text-gray-600 dark:text-gray-300" />
            ) : (
              <Moon className="w-4 h-4 text-gray-600 dark:text-gray-300" />
            )}
          </Button>
          <WebSocketStatusIndicator />
        </div>
      </div>
    </header>
  );
}
