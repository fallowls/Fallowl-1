import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@/store/useStore";
import { apiRequest } from "@/lib/queryClient";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { 
  Users, 
  Phone, 
  MessageSquare, 
  Target, 
  LayoutDashboard,
  Zap,
  History,
  Voicemail,
  Settings,
  HelpCircle,
  User,
  PhoneCall,
  Calendar
} from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";

interface SearchResult {
  contacts: Array<{
    id: number;
    name: string;
    phone: string;
    email?: string;
    company?: string;
  }>;
  calls: Array<{
    id: number;
    phone: string;
    type: string;
    status: string;
    createdAt: string;
  }>;
  messages: Array<{
    id: number;
    phone: string;
    content: string;
    type: string;
  }>;
  leads: Array<{
    id: number;
    firstName: string;
    lastName: string;
    email?: string;
    company?: string;
  }>;
}

const navigationItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, keywords: ['home', 'main', 'overview'] },
  { id: 'dialer', label: 'Dialer', icon: Phone, keywords: ['call', 'phone', 'dial'] },
  { id: 'parallel-dialer', label: 'Parallel Dialer', icon: Zap, keywords: ['bulk', 'mass', 'multiple'] },
  { id: 'call-log', label: 'Call Logs', icon: History, keywords: ['history', 'records', 'past'] },
  { id: 'sms', label: 'SMS', icon: MessageSquare, keywords: ['text', 'message', 'sms'] },
  { id: 'contacts', label: 'Contacts', icon: Users, keywords: ['people', 'contacts', 'address'] },
  { id: 'leads', label: 'Leads', icon: Target, keywords: ['prospects', 'sales', 'pipeline'] },
  { id: 'calendar', label: 'Calendar', icon: Calendar, keywords: ['schedule', 'events', 'meetings'] },
  { id: 'voicemail', label: 'Voicemail', icon: Voicemail, keywords: ['messages', 'voice', 'inbox'] },
  { id: 'call-settings', label: 'Call Settings', icon: Settings, keywords: ['config', 'twilio', 'setup'] },
  { id: 'support', label: 'Support', icon: HelpCircle, keywords: ['help', 'assistance', 'contact'] },
  { id: 'profile', label: 'Profile', icon: User, keywords: ['account', 'user', 'settings'] },
];

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const { setCurrentView } = useStore();

  const { data: searchResults, isLoading } = useQuery<SearchResult>({
    queryKey: ['global-search', debouncedSearch],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/search?q=${encodeURIComponent(debouncedSearch)}`);
      return response.json();
    },
    enabled: debouncedSearch.length >= 2,
  });

  const handleSelect = useCallback((type: string, id?: number | string) => {
    onOpenChange(false);
    setSearch("");
    
    if (type === 'nav') {
      setCurrentView(id as string);
    } else if (type === 'contact') {
      setCurrentView('contacts');
    } else if (type === 'call') {
      setCurrentView('call-log');
    } else if (type === 'message') {
      setCurrentView('sms');
    } else if (type === 'lead') {
      setCurrentView('leads');
    }
  }, [onOpenChange, setCurrentView]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  const filteredNavItems = navigationItems.filter(item => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      item.label.toLowerCase().includes(searchLower) ||
      item.keywords.some(k => k.includes(searchLower))
    );
  });

  const hasResults = searchResults && (
    searchResults.contacts?.length > 0 ||
    searchResults.calls?.length > 0 ||
    searchResults.messages?.length > 0 ||
    searchResults.leads?.length > 0
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput 
        placeholder="Search contacts, calls, messages, pages..." 
        value={search}
        onValueChange={setSearch}
        data-testid="input-global-search"
      />
      <CommandList>
        <CommandEmpty>
          {isLoading ? "Searching..." : "No results found."}
        </CommandEmpty>

        {debouncedSearch.length >= 2 && hasResults && (
          <>
            {searchResults?.contacts && searchResults.contacts.length > 0 && (
              <CommandGroup heading="Contacts">
                {searchResults.contacts.slice(0, 5).map((contact) => (
                  <CommandItem
                    key={`contact-${contact.id}`}
                    value={`contact-${contact.name}-${contact.phone}`}
                    onSelect={() => handleSelect('contact', contact.id)}
                    className="flex items-center gap-3 py-2.5"
                    data-testid={`search-result-contact-${contact.id}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {contact.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {contact.phone} {contact.company && `• ${contact.company}`}
                      </p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {searchResults?.calls && searchResults.calls.length > 0 && (
              <CommandGroup heading="Calls">
                {searchResults.calls.slice(0, 5).map((call) => (
                  <CommandItem
                    key={`call-${call.id}`}
                    value={`call-${call.phone}-${call.id}`}
                    onSelect={() => handleSelect('call', call.id)}
                    className="flex items-center gap-3 py-2.5"
                    data-testid={`search-result-call-${call.id}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                      <PhoneCall className="w-4 h-4 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {call.phone}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {call.type} • {call.status}
                      </p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {searchResults?.messages && searchResults.messages.length > 0 && (
              <CommandGroup heading="Messages">
                {searchResults.messages.slice(0, 5).map((message) => (
                  <CommandItem
                    key={`message-${message.id}`}
                    value={`message-${message.phone}-${message.id}`}
                    onSelect={() => handleSelect('message', message.id)}
                    className="flex items-center gap-3 py-2.5"
                    data-testid={`search-result-message-${message.id}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
                      <MessageSquare className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {message.phone}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {message.content.substring(0, 50)}...
                      </p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {searchResults?.leads && searchResults.leads.length > 0 && (
              <CommandGroup heading="Leads">
                {searchResults.leads.slice(0, 5).map((lead) => (
                  <CommandItem
                    key={`lead-${lead.id}`}
                    value={`lead-${lead.firstName}-${lead.lastName}-${lead.id}`}
                    onSelect={() => handleSelect('lead', lead.id)}
                    className="flex items-center gap-3 py-2.5"
                    data-testid={`search-result-lead-${lead.id}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
                      <Target className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {lead.firstName} {lead.lastName}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {lead.email} {lead.company && `• ${lead.company}`}
                      </p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            <CommandSeparator />
          </>
        )}

        {filteredNavItems.length > 0 && (
          <CommandGroup heading="Navigate to">
            {filteredNavItems.slice(0, 8).map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.id}
                  value={`nav-${item.id}-${item.label}`}
                  onSelect={() => handleSelect('nav', item.id)}
                  className="flex items-center gap-3 py-2"
                  data-testid={`search-nav-${item.id}`}
                >
                  <div className="w-7 h-7 rounded-md bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400" />
                  </div>
                  <span className="text-sm text-gray-900 dark:text-white">{item.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
      </CommandList>
      
      <div className="border-t border-gray-200 dark:border-gray-800 px-3 py-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px] font-medium">↑↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px] font-medium">↵</kbd>
            select
          </span>
        </div>
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px] font-medium">esc</kbd>
          close
        </span>
      </div>
    </CommandDialog>
  );
}
