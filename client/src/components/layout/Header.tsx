import { useState } from "react";
import { useStore } from "@/store/useStore";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Menu, 
  Moon, 
  Sun, 
  Search, 
  Command, 
  Bell,
  Settings,
  User,
  LogOut,
  ChevronDown,
  Sparkles
} from "lucide-react";
import { GlobalSearch } from "@/components/GlobalSearch";
import { WebSocketStatusIndicator } from "./WebSocketStatusIndicator";

const viewTitles: Record<string, string> = {
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

const viewIcons: Record<string, string> = {
  dashboard: '📊',
  dialer: '📞',
  'parallel-dialer': '⚡',
  'call-log': '📋',
  sms: '💬',
  contacts: '👥',
  leads: '🎯',
  calendar: '📅',
  voicemail: '📧',
  users: '👤',
  settings: '⚙️',
  support: '💡',
  profile: '🔒',
};

export default function Header() {
  const { currentView, darkMode, setDarkMode, setMobileMenuOpen, setCurrentView } = useStore();
  const { user, logout } = useAuth();
  const isMobile = useIsMobile();
  const [searchOpen, setSearchOpen] = useState(false);

  const getInitials = (username?: string, email?: string) => {
    if (username) {
      const parts = username.split(' ');
      if (parts.length > 1) {
        return parts.map(n => n[0]).join('').toUpperCase().slice(0, 2);
      }
      return username.slice(0, 2).toUpperCase();
    }
    if (email) {
      return email[0].toUpperCase();
    }
    return 'U';
  };

  const displayName = user?.username || user?.email?.split('@')[0] || 'User';

  const currentTitle = viewTitles[currentView] || 'Dashboard';
  const currentIcon = viewIcons[currentView] || '📊';

  return (
    <>
      <header className="h-16 bg-gradient-to-r from-white via-white to-gray-50/80 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800/80 border-b border-gray-200/80 dark:border-gray-800/80 px-4 lg:px-6 flex items-center transition-all duration-300 sticky top-0 z-40 backdrop-blur-xl">
        <div className="flex items-center justify-between w-full max-w-full">
          <div className="flex items-center gap-4 min-w-0">
            {isMobile && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all duration-200 flex-shrink-0"
                onClick={() => setMobileMenuOpen(true)}
                data-testid="button-menu"
              >
                <Menu className="w-5 h-5" />
              </Button>
            )}
            
            <div className="flex items-center gap-3 min-w-0">
              <div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-lg shadow-lg shadow-indigo-500/20 flex-shrink-0">
                {currentIcon}
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-gray-900 dark:text-white truncate tracking-tight">
                  {currentTitle}
                </h1>
                <p className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">
                  Manage your {currentTitle.toLowerCase()} efficiently
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <button
              onClick={() => setSearchOpen(true)}
              className="group flex items-center gap-2 h-10 px-3 sm:px-4 text-sm text-gray-600 dark:text-gray-300 bg-gray-100/80 dark:bg-gray-800/80 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl border border-gray-200/80 dark:border-gray-700/80 transition-all duration-200 hover:shadow-md hover:scale-[1.02]"
              data-testid="button-search"
            >
              <Search className="w-4 h-4 text-gray-400 group-hover:text-indigo-500 transition-colors" />
              <span className="hidden lg:inline text-sm font-medium">Search</span>
              <kbd className="hidden md:inline-flex items-center gap-0.5 px-2 py-1 text-[10px] font-semibold text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-600 shadow-sm">
                <Command className="w-3 h-3" />K
              </kbd>
            </button>
            
            <div className="hidden sm:block h-6 w-px bg-gradient-to-b from-transparent via-gray-300 dark:via-gray-600 to-transparent" />
            
            <div className="flex items-center gap-1 p-1 bg-gray-100/60 dark:bg-gray-800/60 rounded-xl">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 rounded-lg hover:bg-white dark:hover:bg-gray-700 transition-all duration-200 shadow-sm hover:shadow-md"
                onClick={() => setDarkMode(!darkMode)}
                data-testid="button-theme-toggle"
              >
                {darkMode ? (
                  <Sun className="w-4 h-4 text-amber-500" />
                ) : (
                  <Moon className="w-4 h-4 text-indigo-500" />
                )}
              </Button>
              
              <div className="px-1">
                <WebSocketStatusIndicator />
              </div>
            </div>
            
            <div className="hidden sm:block h-6 w-px bg-gradient-to-b from-transparent via-gray-300 dark:via-gray-600 to-transparent" />
            
            <Button
              variant="ghost"
              size="sm"
              className="relative h-9 w-9 p-0 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200"
              data-testid="button-notifications"
            >
              <Bell className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-gradient-to-r from-red-500 to-pink-500 rounded-full border-2 border-white dark:border-gray-900 animate-pulse" />
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button 
                  className="flex items-center gap-2 p-1.5 pr-3 rounded-xl bg-gray-100/60 dark:bg-gray-800/60 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200 border border-transparent hover:border-gray-200 dark:hover:border-gray-600 group"
                  data-testid="button-user-menu"
                >
                  <Avatar className="h-8 w-8 ring-2 ring-white dark:ring-gray-800 shadow-md">
                    <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-xs font-bold">
                      {getInitials(user?.username, user?.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden lg:block text-left">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight truncate max-w-[100px]">
                      {displayName}
                    </p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5 text-amber-500" />
                      Pro Member
                    </p>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors hidden lg:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-2 rounded-xl shadow-xl border border-gray-200/80 dark:border-gray-700/80">
                <DropdownMenuLabel className="px-2 py-1.5">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-sm font-bold">
                        {getInitials(user?.username, user?.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {displayName}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {user?.email || 'user@example.com'}
                      </p>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="my-2" />
                <DropdownMenuItem 
                  className="flex items-center gap-2.5 px-2 py-2 rounded-lg cursor-pointer"
                  onClick={() => setCurrentView('profile')}
                  data-testid="menu-item-profile"
                >
                  <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                    <User className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                  </div>
                  <span className="font-medium">My Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className="flex items-center gap-2.5 px-2 py-2 rounded-lg cursor-pointer"
                  onClick={() => setCurrentView('settings')}
                  data-testid="menu-item-settings"
                >
                  <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                    <Settings className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                  </div>
                  <span className="font-medium">Settings</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-2" />
                <DropdownMenuItem 
                  className="flex items-center gap-2.5 px-2 py-2 rounded-lg cursor-pointer text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 focus:bg-red-50 dark:focus:bg-red-900/20"
                  onClick={() => logout.mutate()}
                  data-testid="menu-item-logout"
                >
                  <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <LogOut className="w-4 h-4 text-red-600 dark:text-red-400" />
                  </div>
                  <span className="font-medium">Sign Out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
