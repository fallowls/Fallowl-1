import { useState } from "react";
import { useStore } from "@/store/useStore";
import { useAuth } from "@/hooks/useAuth";
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
      <header className="h-14 bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-900 px-4 flex items-center sticky top-0 z-40">
        <div className="flex items-center justify-between w-full">
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg mr-2"
              onClick={() => setMobileMenuOpen(true)}
              data-testid="button-menu"
            >
              <Menu className="w-5 h-5" />
            </Button>
          )}
          
          <div className="flex-1 flex justify-center px-4">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-3 w-full max-w-md h-10 px-4 text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-800 transition-colors"
              data-testid="button-search"
            >
              <Search className="w-4 h-4" />
              <span className="text-sm">Search...</span>
              <kbd className="hidden sm:inline-flex ml-auto items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-gray-400 dark:text-gray-600 bg-white dark:bg-gray-950 rounded border border-gray-200 dark:border-gray-800">
                ⌘K
              </kbd>
            </button>
          </div>
          
          <div className="flex items-center gap-1">
            <WebSocketStatusIndicator />
            
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg"
              onClick={() => setDarkMode(!darkMode)}
              data-testid="button-theme-toggle"
            >
              {darkMode ? (
                <Sun className="w-[18px] h-[18px]" />
              ) : (
                <Moon className="w-[18px] h-[18px]" />
              )}
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              className="relative h-9 w-9 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg"
              data-testid="button-notifications"
            >
              <Bell className="w-[18px] h-[18px]" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button 
                  className="h-9 w-9 rounded-lg bg-gray-900 dark:bg-gray-100 flex items-center justify-center hover:opacity-90 transition-opacity ml-1"
                  data-testid="button-user-menu"
                >
                  <span className="text-white dark:text-gray-900 text-xs font-semibold">
                    {getInitials(user?.username, user?.email)}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 p-1.5 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800">
                <div className="px-3 py-2 mb-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {user?.username || 'User'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {user?.email || 'user@example.com'}
                  </p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer text-gray-700 dark:text-gray-300"
                  onClick={() => setCurrentView('profile')}
                  data-testid="menu-item-profile"
                >
                  <User className="w-4 h-4" />
                  <span>Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer text-gray-700 dark:text-gray-300"
                  onClick={() => setCurrentView('settings')}
                  data-testid="menu-item-settings"
                >
                  <Settings className="w-4 h-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer text-gray-700 dark:text-gray-300"
                  onClick={() => setCurrentView('support')}
                  data-testid="menu-item-support"
                >
                  <HelpCircle className="w-4 h-4" />
                  <span>Help & Support</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer text-red-600 dark:text-red-400"
                  onClick={() => logout.mutate()}
                  data-testid="menu-item-logout"
                >
                  <LogOut className="w-4 h-4" />
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
