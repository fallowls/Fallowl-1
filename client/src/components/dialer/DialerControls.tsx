import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Play, Pause, PhoneOff, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContactList, Contact } from "@shared/schema";

interface DialerControlsProps {
  isDialing: boolean;
  isPaused: boolean;
  isReady: boolean;
  selectedListId: string;
  parallelLines: number;
  contactLists: ContactList[];
  contacts: Contact[];
  filteredContacts: Contact[];
  showSettings: boolean;
  onListChange: (value: string) => void;
  onLinesChange: (value: number) => void;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onToggleSettings: () => void;
}

export function DialerControls({
  isDialing,
  isPaused,
  isReady,
  selectedListId,
  parallelLines,
  contactLists,
  contacts,
  filteredContacts,
  showSettings,
  onListChange,
  onLinesChange,
  onStart,
  onStop,
  onPause,
  onToggleSettings
}: DialerControlsProps) {
  return (
    <Card className="rounded-[16px] border border-gray-200 dark:border-gray-800 shadow-[0_4px_14px_rgba(0,0,0,0.06)]">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* List Selection */}
          <div className="flex items-center gap-2 min-w-[200px]">
            <Label className="text-xs font-medium text-muted-foreground whitespace-nowrap">List:</Label>
            <Select
              value={selectedListId || "all"}
              onValueChange={(value) => onListChange(value === "all" ? "" : value)}
              disabled={isDialing}
            >
              <SelectTrigger className="h-9" data-testid="select-contact-list">
                <SelectValue placeholder="Select list..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Contacts ({contacts.length})</SelectItem>
                {contactLists.map((list) => (
                  <SelectItem key={list.id} value={list.id.toString()}>
                    {list.name} ({list.contactCount || 0})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Lines Control */}
          <div className="flex items-center gap-3 min-w-[180px]">
            <Label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Lines:</Label>
            <Slider
              min={1}
              max={10}
              step={1}
              value={[parallelLines]}
              onValueChange={(value) => onLinesChange(value[0])}
              disabled={isDialing}
              className="w-24"
              data-testid="slider-parallel-lines"
            />
            <Badge variant="secondary" className="min-w-[28px] justify-center">{parallelLines}</Badge>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Actions */}
          <div className="flex items-center gap-2">
            {!isDialing ? (
              <Button
                onClick={onStart}
                disabled={!isReady || filteredContacts.length === 0}
                className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white shadow-lg shadow-teal-500/25 px-6"
                data-testid="button-start-dialing"
              >
                <Play className="w-4 h-4 mr-2" />
                Start Dialing
              </Button>
            ) : (
              <>
                <Button
                  onClick={onPause}
                  variant="outline"
                  className={cn(
                    "px-4",
                    isPaused && "bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-400"
                  )}
                  data-testid="button-pause-resume"
                >
                  {isPaused ? (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Resume
                    </>
                  ) : (
                    <>
                      <Pause className="w-4 h-4 mr-2" />
                      Pause
                    </>
                  )}
                </Button>
                <Button
                  onClick={onStop}
                  variant="destructive"
                  className="px-4"
                  data-testid="button-stop-dialing"
                >
                  <PhoneOff className="w-4 h-4 mr-2" />
                  Stop
                </Button>
              </>
            )}
            <Button
              onClick={onToggleSettings}
              variant="outline"
              size="icon"
              className={cn(showSettings && "bg-gray-100 dark:bg-gray-800")}
              data-testid="button-settings"
            >
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
