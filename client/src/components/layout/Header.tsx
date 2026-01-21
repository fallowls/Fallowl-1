import { useState } from "react";
import { useStore } from "@/store/useStore";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Menu, 
  Moon, 
  Sun, 
  Search,
  Bell,
  Settings,
  User,
  LogOut,
  HelpCircle
} from "lucide-react";
import { GlobalSearch } from "@/components/GlobalSearch";
import { WebSocketStatusIndicator } from "./WebSocketStatusIndicator";

export default function Header() {
  const { darkMode, setDarkMode, setMobileMenuOpen, setCurrentView } = useStore();
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

  return (
    <>
      <header className="h-11 sm:h-12 bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-900 px-2 sm:px-4 flex items-center sticky top-0 z-40">
        <div className="flex items-center justify-between w-full gap-2">
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg flex-shrink-0"
              onClick={() => setMobileMenuOpen(true)}
              data-testid="button-menu"
            >
              <Menu className="w-4 h-4" />
            </Button>
          )}
          
          <div className="flex-1 flex justify-center min-w-0">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 w-full max-w-xs sm:max-w-sm md:max-w-md h-8 px-3 text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-800 transition-colors"
              data-testid="button-search"
            >
              <Search className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="text-xs sm:text-sm truncate">Search everything...</span>
              <kbd className="hidden md:inline-flex ml-auto items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 dark:text-gray-600 bg-white dark:bg-gray-950 rounded border border-gray-200 dark:border-gray-800 flex-shrink-0">
                ⌘K
              </kbd>
            </button>
          </div>
          
          <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
            <WebSocketStatusIndicator />
            
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-md"
              onClick={() => setDarkMode(!darkMode)}
              data-testid="button-theme-toggle"
            >
              {darkMode ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              className="relative h-8 w-8 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-md"
              data-testid="button-notifications"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full" />
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button 
                  className="h-7 w-7 sm:h-8 sm:w-8 rounded-md bg-gray-900 dark:bg-gray-100 flex items-center justify-center hover:opacity-90 transition-opacity ml-0.5"
                  data-testid="button-user-menu"
                >
                  <span className="text-white dark:text-gray-900 text-[10px] sm:text-xs font-semibold">
                    {getInitials(user?.username, user?.email)}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 sm:w-52 p-1 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800">
                <div className="px-2.5 py-1.5 mb-0.5">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {user?.username || 'User'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {user?.email || 'user@example.com'}
                  </p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer text-gray-700 dark:text-gray-300 text-sm"
                  onClick={() => setCurrentView('profile')}
                  data-testid="menu-item-profile"
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer text-gray-700 dark:text-gray-300 text-sm"
                  onClick={() => setCurrentView('settings')}
                  data-testid="menu-item-settings"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer text-gray-700 dark:text-gray-300 text-sm"
                  onClick={() => setCurrentView('support')}
                  data-testid="menu-item-support"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Help & Support</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer text-red-600 dark:text-red-400 text-sm"
                  onClick={() => logout.mutate()}
                  data-testid="menu-item-logout"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign out</span>
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
