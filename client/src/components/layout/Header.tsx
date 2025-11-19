import { useStore } from "@/store/useStore";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Menu, Moon, Sun, Search, Bell, HelpCircle } from "lucide-react";
import { WebSocketStatusIndicator } from "./WebSocketStatusIndicator";

const viewTitles = {
  dashboard: 'Dashboard',
  'my-work': 'My Work',
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
    <header className="bg-white dark:bg-gray-900 shadow-sm border-b border-gray-200 dark:border-gray-800 px-6 py-4 transition-colors duration-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {isMobile && (
            <Button
              variant="ghost"
              size="sm"
              className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              onClick={() => setMobileMenuOpen(true)}
              data-testid="button-menu"
            >
              <Menu className="w-5 h-5" />
            </Button>
          )}
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
              {viewTitles[currentView as keyof typeof viewTitles] || 'Dashboard'}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200 hover:scale-110"
            data-testid="button-search"
          >
            <Search className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200 hover:scale-110"
            data-testid="button-notifications"
          >
            <Bell className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200 hover:scale-110"
            data-testid="button-help"
          >
            <HelpCircle className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </Button>
          
          <div className="h-6 w-px bg-gray-300 dark:bg-gray-700 mx-1" />
          
          <Button
            variant="ghost"
            size="sm"
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200 hover:scale-110"
            onClick={() => setDarkMode(!darkMode)}
            data-testid="button-theme-toggle"
          >
            {darkMode ? (
              <Sun className="w-5 h-5 text-yellow-500" />
            ) : (
              <Moon className="w-5 h-5 text-gray-600" />
            )}
          </Button>
          
          <WebSocketStatusIndicator />
        </div>
      </div>
    </header>
  );
}
