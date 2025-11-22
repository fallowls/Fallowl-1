import { useStore } from "@/store/useStore";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { canAccessView } from "@/lib/accessControl";
import TwilioDeviceStatus from "@/components/TwilioDeviceStatus";
import { 
  Phone, 
  MessageSquare, 
  Users, 
  Voicemail, 
  UserCheck, 
  Mail, 
  CreditCard, 
  Cloud, 
  Settings, 
  Sliders,
  LayoutDashboard,
  HelpCircle,
  LogOut,
  History,
  Target,
  List,
  Calendar,
  Zap,
  Activity,
  Briefcase,
  ChevronRight
} from "lucide-react";

import FallOwlLogo from "@assets/FallOwl_logo_1759278988195.png";
import FallOwlLogoDark from "@assets/FallOwl_logo_1759339763714.png";

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'my-work', label: 'My Work', icon: Briefcase },
  { id: 'dialer', label: 'Dialer', icon: Phone },
  { id: 'parallel-dialer', label: 'Parallel Dialer', icon: Zap },
  { id: 'call-status-overview', label: 'Call Status', icon: Activity },
  { id: 'call-log', label: 'Call Log', icon: History },
  { id: 'sms', label: 'SMS', icon: MessageSquare },
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'lists', label: 'Lists', icon: List },
  { id: 'leads', label: 'Leads', icon: Target },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'voicemail', label: 'Voicemail', icon: Voicemail },
  { id: 'users', label: 'Users', icon: UserCheck },
  { id: 'smtp', label: 'SMTP', icon: Mail },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'cdn', label: 'CDN', icon: Cloud },
  { id: 'call-settings', label: 'Call Settings', icon: Settings },
  { id: 'settings', label: 'Settings', icon: Sliders },
  { id: 'support', label: 'Support', icon: HelpCircle },
];

export default function Sidebar() {
  const { 
    currentView, 
    setCurrentView, 
    sidebarExpanded, 
    setSidebarExpanded,
    mobileMenuOpen,
    setMobileMenuOpen,
    darkMode
  } = useStore();
  const { user, logout } = useAuth();
  const isMobile = useIsMobile();

  const handleItemClick = (itemId: string) => {
    setCurrentView(itemId);
    if (isMobile) {
      setMobileMenuOpen(false);
    }
  };

  return (
    <>
      {isMobile && mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-20 transition-opacity duration-300"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      
      <div 
        className={cn(
          "bg-gradient-to-b from-white to-gray-50 dark:from-gray-900 dark:to-gray-950 shadow-xl transition-all duration-300 ease-in-out relative z-30 border-r border-gray-200 dark:border-gray-800",
          "flex flex-col",
          isMobile ? (
            mobileMenuOpen ? "fixed left-0 top-0 w-64 h-full transform translate-x-0" : "fixed left-0 top-0 w-64 h-full transform -translate-x-full"
          ) : (
            sidebarExpanded ? "w-64 h-screen" : "w-16 h-screen group"
          )
        )}
        onMouseEnter={() => !isMobile && setSidebarExpanded(true)}
        onMouseLeave={() => !isMobile && setSidebarExpanded(false)}
      >
        <div className={cn(
          "flex items-center border-b border-gray-200 dark:border-gray-800 py-3 transition-all duration-300",
          (sidebarExpanded || isMobile) ? "h-16 px-3" : "h-16 px-2 justify-center"
        )}>
          <div className="transition-all duration-300">
            <img 
              src={darkMode ? FallOwlLogoDark : FallOwlLogo} 
              alt="FallOwl" 
              className={cn(
                "object-contain transition-all duration-300",
                (sidebarExpanded || isMobile) ? "h-10 w-auto" : "h-8 w-auto"
              )}
            />
          </div>
        </div>

        <nav className="flex-1 px-2.5 py-3 space-y-0.5 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {menuItems
            .filter((item) => canAccessView(user?.email, item.id))
            .map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item.id)}
                  className={cn(
                    "group flex items-center gap-2.5 px-3 py-2 rounded-[12px] transition-all duration-200 w-full relative overflow-hidden",
                    isActive 
                      ? "bg-gradient-to-r from-teal-500 to-teal-400 text-white shadow-md shadow-teal-500/25 dark:shadow-teal-500/20" 
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50",
                    (sidebarExpanded || isMobile) ? "justify-start" : "justify-center"
                  )}
                >
                  <div className={cn(
                    "flex items-center justify-center transition-all duration-200",
                    isActive && "scale-105"
                  )}>
                    <Icon className={cn(
                      "w-[18px] h-[18px] flex-shrink-0 transition-all duration-200",
                      isActive ? "text-white" : "text-gray-600 dark:text-gray-400 group-hover:text-teal-500 dark:group-hover:text-teal-400"
                    )} />
                  </div>
                  <span className={cn(
                    "font-medium transition-all duration-300 whitespace-nowrap text-[13px]",
                    (sidebarExpanded || isMobile) ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 absolute",
                    isActive ? "text-white" : "text-gray-700 dark:text-gray-300"
                  )}>
                    {item.label}
                  </span>
                  {isActive && (sidebarExpanded || isMobile) && (
                    <ChevronRight className="w-4 h-4 ml-auto text-white animate-pulse" />
                  )}
                </button>
              );
            })}
        </nav>

        <div className="border-t border-gray-200 dark:border-gray-800 px-3 py-3">
          <div className="flex items-center justify-center">
            <div className={cn(
              "transition-opacity duration-300",
              (sidebarExpanded || isMobile) ? "opacity-0 w-0" : "opacity-100 w-auto"
            )}>
              <TwilioDeviceStatus variant="dot-only" />
            </div>
            
            <div className={cn(
              "transition-opacity duration-300",
              (sidebarExpanded || isMobile) ? "opacity-100 w-full" : "opacity-0 w-0"
            )}>
              <TwilioDeviceStatus variant="inline" />
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-800 px-3 py-3 bg-white dark:bg-gray-900">
          <div className={cn(
            "flex items-center gap-3",
            (sidebarExpanded || isMobile) ? "justify-between" : "justify-center"
          )}>
            <div className="flex items-center gap-3 min-w-0">
              <div className={cn(
                "rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center flex-shrink-0 ring-2 ring-teal-400/30",
                (sidebarExpanded || isMobile) ? "w-9 h-9" : "w-8 h-8"
              )}>
                <span className={cn(
                  "text-white font-semibold",
                  (sidebarExpanded || isMobile) ? "text-sm" : "text-xs"
                )}>
                  {user?.username?.substring(0, 2).toUpperCase() || 'U'}
                </span>
              </div>
              <div className={cn(
                "transition-all duration-300 min-w-0",
                (sidebarExpanded || isMobile) ? "opacity-100" : "opacity-0 w-0 overflow-hidden"
              )}>
                <p className="text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap truncate">
                  {user?.username || 'User'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap truncate">
                  {user?.role === 'super_admin' ? 'Super Admin' : user?.role || 'User'}
                </p>
              </div>
            </div>
            <div className={cn(
              "flex items-center gap-1 transition-all duration-300",
              (sidebarExpanded || isMobile) ? "opacity-100" : "opacity-0 w-0 overflow-hidden"
            )}>
              <button
                onClick={() => handleItemClick('profile')}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200 hover:scale-110"
                title="Profile Settings"
              >
                <Settings className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              </button>
              <button
                onClick={() => logout.mutate()}
                className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-all duration-200 hover:scale-110"
                title="Logout"
              >
                <LogOut className="w-4 h-4 text-red-600 dark:text-red-400" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
