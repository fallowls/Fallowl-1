import { useStore } from "@/store/useStore";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { canAccessView } from "@/lib/accessControl";
import TwilioDeviceStatus from "@/components/TwilioDeviceStatus";
import { 
  Phone, 
  MessageSquare, 
  Mic, 
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
  User,
  LogOut,
  History,
  Target,
  List,
  Calendar,
  Zap,
  Activity,
  Briefcase
} from "lucide-react";

// Import FallOwl logos
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
      {/* Mobile Overlay */}
      {isMobile && mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-20"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      
      {/* Sidebar */}
      <div 
        className={cn(
          "bg-white dark:bg-gray-800 shadow-lg transition-all duration-300 ease-in-out relative z-30",
          "flex flex-col",
          isMobile ? (
            mobileMenuOpen ? "fixed left-0 top-0 w-64 h-full transform translate-x-0" : "fixed left-0 top-0 w-64 h-full transform -translate-x-full"
          ) : (
            sidebarExpanded ? "w-64 h-screen" : "w-14 h-screen group"
          )
        )}
        onMouseEnter={() => !isMobile && setSidebarExpanded(true)}
        onMouseLeave={() => !isMobile && setSidebarExpanded(false)}
      >
        {/* Logo */}
        <div className={cn(
          "flex items-center justify-center border-b border-gray-200 dark:border-gray-700 py-2 transition-all duration-300",
          (sidebarExpanded || isMobile) ? "h-16 px-3" : "h-16 px-1"
        )}>
          <div className="transition-all duration-300">
            <img 
              src={darkMode ? FallOwlLogoDark : FallOwlLogo} 
              alt="FallOwl" 
              className={cn(
                "object-contain transition-all duration-300",
                (sidebarExpanded || isMobile) ? "h-12 w-auto" : "h-8 w-auto"
              )}
            />
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto min-h-0 scrollbar-hide">
          {menuItems
            .filter((item) => canAccessView(user?.email, item.id))
            .map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item.id)}
                  className={cn(
                    "flex items-center px-2 py-1.5 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200 cursor-pointer w-full text-sm",
                    currentView === item.id && "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300",
                    (sidebarExpanded || isMobile) ? "justify-start" : "justify-center"
                  )}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className={cn(
                    "ml-3 font-medium transition-opacity duration-300 whitespace-nowrap",
                    (sidebarExpanded || isMobile) ? "opacity-100" : "opacity-0 w-0"
                  )}>
                    {item.label}
                  </span>
                </button>
              );
            })}
        </nav>

        {/* Twilio Status */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-2 py-1.5">
          <div className="flex items-center justify-center">
            {/* Always visible status dot */}
            <div className={cn(
              "transition-opacity duration-300",
              (sidebarExpanded || isMobile) ? "opacity-0 w-0" : "opacity-100 w-auto"
            )}>
              <TwilioDeviceStatus variant="dot-only" />
            </div>
            
            {/* Full status when expanded */}
            <div className={cn(
              "transition-opacity duration-300",
              (sidebarExpanded || isMobile) ? "opacity-100 w-full" : "opacity-0 w-0"
            )}>
              <TwilioDeviceStatus variant="inline" />
            </div>
          </div>
        </div>

        {/* User Profile */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-2 py-1.5">
          <div className={cn(
            "flex items-center",
            (sidebarExpanded || isMobile) ? "justify-between" : "justify-center"
          )}>
            <div className="flex items-center">
              <div className={cn(
                "rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0",
                (sidebarExpanded || isMobile) ? "w-7 h-7" : "w-6 h-6"
              )}>
                <span className={cn(
                  "text-blue-600 dark:text-blue-300 font-medium",
                  (sidebarExpanded || isMobile) ? "text-xs" : "text-[10px]"
                )}>
                  {user?.username?.substring(0, 2).toUpperCase() || 'U'}
                </span>
              </div>
              <div className={cn(
                "ml-3 transition-opacity duration-300",
                (sidebarExpanded || isMobile) ? "opacity-100" : "opacity-0 w-0"
              )}>
                <p className="text-sm font-medium text-gray-800 dark:text-white whitespace-nowrap">
                  {user?.username || 'User'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  {user?.role === 'super_admin' ? 'Super Admin' : user?.role || 'User'}
                </p>
              </div>
            </div>
            <div className={cn(
              "flex items-center gap-1 transition-opacity duration-300",
              (sidebarExpanded || isMobile) ? "opacity-100" : "opacity-0 w-0"
            )}>
              <button
                onClick={() => handleItemClick('profile')}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200"
                title="Profile Settings"
              >
                <Settings className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              </button>
              <button
                onClick={() => logout.mutate()}
                className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900 transition-colors duration-200"
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
