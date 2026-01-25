import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ListOrdered, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Contact } from "@shared/schema";

interface DialerQueueProps {
  queuedContacts: Contact[];
  currentContactIndex: number;
  isDialing: boolean;
}

export function DialerQueue({ queuedContacts, currentContactIndex, isDialing }: DialerQueueProps) {
  const remainingContacts = queuedContacts.slice(currentContactIndex);

  return (
    <Card className="lg:col-span-3 rounded-[16px] border border-gray-200 dark:border-gray-800 shadow-[0_4px_14px_rgba(0,0,0,0.06)]">
      <CardHeader className="pb-3 px-4 pt-4 border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2 font-bold text-gray-900 dark:text-white">
            <div className="p-2 rounded-[12px] bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/30 dark:to-blue-800/20">
              <ListOrdered className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            Queue
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {remainingContacts.length} waiting
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[400px]">
          {remainingContacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="p-3 rounded-full bg-gray-100 dark:bg-gray-800 mb-3">
                <Users className="h-6 w-6 text-gray-400" />
              </div>
              <p className="text-sm text-muted-foreground">
                {isDialing ? "All contacts have been dialed" : "Select a list and start dialing"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {remainingContacts.slice(0, 50).map((contact, idx) => (
                <div 
                  key={contact.id} 
                  className={cn(
                    "px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors",
                    idx === 0 && isDialing && "bg-blue-50 dark:bg-blue-950/30"
                  )}
                  data-testid={`queue-contact-${contact.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                      idx === 0 && isDialing 
                        ? "bg-blue-500 text-white" 
                        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                    )}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate text-gray-900 dark:text-white">
                        {contact.name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {contact.phone}
                      </p>
                    </div>
                    {idx === 0 && isDialing && (
                      <Badge className="bg-blue-500 text-white text-xs">Next</Badge>
                    )}
                  </div>
                </div>
              ))}
              {remainingContacts.length > 50 && (
                <div className="px-4 py-3 text-center text-sm text-muted-foreground">
                  +{remainingContacts.length - 50} more contacts
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
