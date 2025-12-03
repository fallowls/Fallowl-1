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
  LayoutDashboard,
  HelpCircle,
  History,
  Target,
  Calendar,
  Zap
} from "lucide-react";

import FallOwlLogo from "@assets/FallOwl_logo_1759278988195.png";
import FallOwlLogoDark from "@assets/FallOwl_logo_1759339763714.png";

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'dialer', label: 'Dialer', icon: Phone },
  { id: 'parallel-dialer', label: 'Parallel Dialer', icon: Zap },
  { id: 'call-log', label: 'Call Logs', icon: History },
  { id: 'sms', label: 'SMS', icon: MessageSquare },
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'leads', label: 'Leads', icon: Target },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'voicemail', label: 'Voicemail', icon: Voicemail },
  { id: 'users', label: 'Users', icon: UserCheck },
  { id: 'smtp', label: 'SMTP', icon: Mail },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'cdn', label: 'CDN', icon: Cloud },
  { id: 'call-settings', label: 'Call Settings', icon: Settings },
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
  const { user } = useAuth();
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
          "bg-white dark:bg-gray-950 shadow-sm transition-all duration-200 ease-out relative z-30 border-r border-gray-200/60 dark:border-gray-800/60",
          "flex flex-col will-change-[width]",
          isMobile ? (
            mobileMenuOpen ? "fixed left-0 top-0 w-56 h-full transform translate-x-0" : "fixed left-0 top-0 w-56 h-full transform -translate-x-full"
          ) : (
            sidebarExpanded ? "w-56 h-screen" : "w-14 h-screen group"
          )
        )}
        onMouseEnter={() => !isMobile && setSidebarExpanded(true)}
        onMouseLeave={() => !isMobile && setSidebarExpanded(false)}
      >
        <div className={cn(
          "flex items-center border-b border-gray-200/60 dark:border-gray-800/60 py-2.5 transition-all duration-200 ease-out",
          (sidebarExpanded || isMobile) ? "h-14 px-3" : "h-14 px-2 justify-center"
        )}>
          <div className="transition-all duration-200 ease-out">
            <img 
              src={darkMode ? FallOwlLogoDark : FallOwlLogo} 
              alt="FallOwl" 
              className="h-8 w-auto object-contain"
            />
          </div>
        </div>

        <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {menuItems
            .filter((item) => canAccessView(user?.email, item.id))
            .map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item.id)}
                  data-testid={`sidebar-${item.id}`}
                  className={cn(
                    "group flex items-center rounded-lg transition-all duration-200 ease-out w-full relative overflow-hidden",
                    isActive 
                      ? "bg-gray-900 dark:bg-gray-800 text-white shadow-sm" 
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-100/80 dark:hover:bg-gray-800/50",
                    (sidebarExpanded || isMobile) ? "gap-2.5 px-2.5 py-2 justify-start" : "py-2 justify-center"
                  )}
                >
                  <div className={cn(
                    "flex items-center justify-center flex-shrink-0",
                    (sidebarExpanded || isMobile) ? "" : "w-full"
                  )}>
                    <Icon className={cn(
                      "w-[17px] h-[17px] transition-colors duration-150",
                      isActive ? "text-white" : "text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-200"
                    )} />
                  </div>
                  <span className={cn(
                    "font-medium transition-all duration-200 ease-out whitespace-nowrap text-[13px]",
                    (sidebarExpanded || isMobile) ? "opacity-100 translate-x-0" : "opacity-0 w-0 absolute pointer-events-none",
                    isActive ? "text-white" : "text-gray-700 dark:text-gray-300"
                  )}>
                    {item.label}
                  </span>
                </button>
              );
            })}
        </nav>

        <div className="border-t border-gray-200/60 dark:border-gray-800/60 px-2.5 py-2.5">
          <div className="flex items-center justify-center">
            <div className={cn(
              "transition-all duration-200 ease-out",
              (sidebarExpanded || isMobile) ? "opacity-0 w-0" : "opacity-100 w-auto"
            )}>
              <TwilioDeviceStatus variant="dot-only" />
            </div>
            
            <div className={cn(
              "transition-all duration-200 ease-out",
              (sidebarExpanded || isMobile) ? "opacity-100 w-full" : "opacity-0 w-0"
            )}>
              <TwilioDeviceStatus variant="inline" />
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200/60 dark:border-gray-800/60 px-2.5 py-2.5 bg-white dark:bg-gray-950">
          <button
            onClick={() => handleItemClick('settings')}
            className={cn(
              "group flex items-center rounded-lg transition-all duration-200 ease-out w-full",
              currentView === 'settings'
                ? "bg-gray-900 dark:bg-gray-800 text-white" 
                : "text-gray-700 dark:text-gray-300 hover:bg-gray-100/80 dark:hover:bg-gray-800/50",
              (sidebarExpanded || isMobile) ? "gap-2.5 px-2.5 py-2 justify-start" : "py-2 justify-center"
            )}
            data-testid="sidebar-settings-bottom"
          >
            <Settings className={cn(
              "w-[17px] h-[17px] transition-colors duration-150",
              currentView === 'settings' ? "text-white" : "text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-200"
            )} />
            <span className={cn(
              "font-medium transition-all duration-200 ease-out whitespace-nowrap text-[13px]",
              (sidebarExpanded || isMobile) ? "opacity-100 translate-x-0" : "opacity-0 w-0 absolute pointer-events-none",
              currentView === 'settings' ? "text-white" : "text-gray-700 dark:text-gray-300"
            )}>
              Settings
            </span>
          </button>
        </div>
      </div>
    </>
  );
}
