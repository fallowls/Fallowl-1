import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Contact } from "@shared/schema";

interface DialedContact {
  contact: Contact;
  status: 'connected' | 'voicemail' | 'no-answer' | 'busy' | 'failed';
  duration: number;
  dialedAt: Date;
}

interface CompletedCallsPanelProps {
  dialedContacts: DialedContact[];
  totalDialed: number;
}

export function CompletedCallsPanel({ dialedContacts, totalDialed }: CompletedCallsPanelProps) {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card className="lg:col-span-3 rounded-[16px] border border-gray-200 dark:border-gray-800 shadow-[0_4px_14px_rgba(0,0,0,0.06)]">
      <CardHeader className="pb-3 px-4 pt-4 border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2 font-bold text-gray-900 dark:text-white">
            <div className="p-2 rounded-[12px] bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-900/30 dark:to-emerald-800/20">
              <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            Completed
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {totalDialed} total
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[400px]">
          {dialedContacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="p-3 rounded-full bg-gray-100 dark:bg-gray-800 mb-3">
                <Phone className="h-6 w-6 text-gray-400" />
              </div>
              <p className="text-sm text-muted-foreground">
                Dialed contacts will appear here
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {dialedContacts.slice(-50).reverse().map((item, idx) => {
                const statusColors: Record<string, string> = {
                  connected: "bg-emerald-500",
                  voicemail: "bg-amber-500",
                  'no-answer': "bg-gray-400",
                  busy: "bg-yellow-500",
                  failed: "bg-red-500"
                };
                return (
                  <div 
                    key={`${item.contact.id}-${idx}`} 
                    className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-2 h-2 rounded-full flex-shrink-0",
                        statusColors[item.status] || "bg-gray-400"
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-gray-900 dark:text-white">
                          {item.contact.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {item.status} • {formatDuration(item.duration)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
