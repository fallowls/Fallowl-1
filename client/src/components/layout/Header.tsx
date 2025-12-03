import { useState } from "react";
import { useStore } from "@/store/useStore";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Menu, Moon, Sun, Search, Command } from "lucide-react";
import { GlobalSearch } from "@/components/GlobalSearch";
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
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <>
      <header className="h-14 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-800/50 px-4 flex items-center transition-colors duration-200">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            {isMobile && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                onClick={() => setMobileMenuOpen(true)}
                data-testid="button-menu"
              >
                <Menu className="w-4 h-4" />
              </Button>
            )}
            <h1 className="text-base font-semibold text-gray-900 dark:text-white">
              {viewTitles[currentView as keyof typeof viewTitles] || 'Dashboard'}
            </h1>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 h-8 px-3 text-sm text-gray-500 dark:text-gray-400 bg-gray-100/80 dark:bg-gray-800/80 hover:bg-gray-200/80 dark:hover:bg-gray-700/80 rounded-lg border border-gray-200 dark:border-gray-700 transition-all duration-200"
              data-testid="button-search"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-xs">Search...</span>
              <kbd className="hidden md:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-900 rounded border border-gray-300 dark:border-gray-600">
                <Command className="w-2.5 h-2.5" />K
              </kbd>
            </button>
            
            <div className="h-4 w-px bg-gray-200 dark:bg-gray-700 mx-1" />
            
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200"
              onClick={() => setDarkMode(!darkMode)}
              data-testid="button-theme-toggle"
            >
              {darkMode ? (
                <Sun className="w-4 h-4 text-amber-500" />
              ) : (
                <Moon className="w-4 h-4 text-gray-600" />
              )}
            </Button>
            
            <WebSocketStatusIndicator />
          </div>
        </div>
      </header>
      
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
