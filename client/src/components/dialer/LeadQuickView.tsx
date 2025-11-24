import { useState } from "react";
import { X, Phone, Mail, MessageSquare, Calendar, Tag, TrendingUp, Clock, User, Edit } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { LeadQuickView as LeadQuickViewType } from "@shared/parallelDialerTypes";
import { format } from "date-fns";

interface LeadQuickViewProps {
  lead: LeadQuickViewType;
  onClose: () => void;
  onAddNote?: (note: string) => void;
  onScheduleCallback?: (date: string, reason: string) => void;
  onUpdateDisposition?: (disposition: string) => void;
}

export function LeadQuickView({
  lead,
  onClose,
  onAddNote,
  onScheduleCallback,
  onUpdateDisposition
}: LeadQuickViewProps) {
  const [newNote, setNewNote] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);

  const handleAddNote = () => {
    if (newNote.trim() && onAddNote) {
      onAddNote(newNote);
      setNewNote("");
      setIsAddingNote(false);
    }
  };

  const getInteractionIcon = (type: string) => {
    switch (type) {
      case 'call': return <Phone className="w-4 h-4" />;
      case 'sms': return <MessageSquare className="w-4 h-4" />;
      case 'email': return <Mail className="w-4 h-4" />;
      default: return <User className="w-4 h-4" />;
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] bg-white dark:bg-gray-800 shadow-2xl">
        <CardHeader className="flex flex-row items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-4">
          <div className="flex-1">
            <CardTitle className="text-2xl text-gray-900 dark:text-white" data-testid="text-lead-name">
              {lead.name}
            </CardTitle>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="text-sm" data-testid="badge-lead-status">
                {lead.status}
              </Badge>
              {lead.score && (
                <Badge 
                  className={cn(
                    "text-sm",
                    lead.score >= 80 ? "bg-green-500 dark:bg-green-600" :
                    lead.score >= 50 ? "bg-yellow-500 dark:bg-yellow-600" :
                    "bg-gray-500 dark:bg-gray-600"
                  )}
                  data-testid="badge-lead-score"
                >
                  <TrendingUp className="w-3 h-3 mr-1" />
                  Score: {lead.score}
                </Badge>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            data-testid="button-close-lead-view"
          >
            <X className="w-5 h-5" />
          </Button>
        </CardHeader>

        <ScrollArea className="h-[calc(90vh-12rem)]">
          <CardContent className="p-6">
            {/* Contact Information */}
            <div className="space-y-3 mb-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Phone</p>
                  <p className="text-base text-gray-900 dark:text-white font-medium" data-testid="text-lead-phone">
                    {lead.phone}
                  </p>
                </div>
                {lead.email && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Email</p>
                    <p className="text-base text-gray-900 dark:text-white font-medium" data-testid="text-lead-email">
                      {lead.email}
                    </p>
                  </div>
                )}
              </div>
              {lead.company && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Company</p>
                  <p className="text-base text-gray-900 dark:text-white font-medium" data-testid="text-lead-company">
                    {lead.company}
                  </p>
                </div>
              )}
              {lead.source && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Source</p>
                  <p className="text-base text-gray-900 dark:text-white font-medium" data-testid="text-lead-source">
                    {lead.source}
                  </p>
                </div>
              )}
            </div>

            {/* Tags */}
            {lead.tags.length > 0 && (
              <div className="mb-6">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-2">
                  <Tag className="w-4 h-4" />
                  Tags
                </p>
                <div className="flex flex-wrap gap-2">
                  {lead.tags.map((tag, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Tabs */}
            <Tabs defaultValue="history" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="history" data-testid="tab-history">History</TabsTrigger>
                <TabsTrigger value="notes" data-testid="tab-notes">Notes</TabsTrigger>
                <TabsTrigger value="callbacks" data-testid="tab-callbacks">Callbacks</TabsTrigger>
              </TabsList>

              {/* Interaction History */}
              <TabsContent value="history" className="mt-4">
                <div className="space-y-3">
                  {lead.interactionHistory.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                      No interaction history
                    </p>
                  ) : (
                    lead.interactionHistory.map((interaction) => (
                      <div
                        key={interaction.id}
                        className="flex gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50"
                        data-testid={`interaction-${interaction.id}`}
                      >
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400">
                          {getInteractionIcon(interaction.type)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between mb-1">
                            <p className="font-medium text-gray-900 dark:text-white capitalize">
                              {interaction.type}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {format(new Date(interaction.date), 'MMM d, h:mm a')}
                            </p>
                          </div>
                          {interaction.duration && (
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              Duration: {formatDuration(interaction.duration)}
                            </p>
                          )}
                          {interaction.outcome && (
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              Outcome: {interaction.outcome}
                            </p>
                          )}
                          {interaction.summary && (
                            <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                              {interaction.summary}
                            </p>
                          )}
                          {interaction.agentName && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              Agent: {interaction.agentName}
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>

              {/* Notes */}
              <TabsContent value="notes" className="mt-4">
                <div className="space-y-3">
                  {/* Add Note */}
                  {isAddingNote ? (
                    <div className="space-y-2">
                      <Textarea
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder="Add a note..."
                        className="min-h-[100px]"
                        data-testid="textarea-new-note"
                      />
                      <div className="flex gap-2">
                        <Button
                          onClick={handleAddNote}
                          size="sm"
                          data-testid="button-save-note"
                        >
                          Save Note
                        </Button>
                        <Button
                          onClick={() => {
                            setIsAddingNote(false);
                            setNewNote("");
                          }}
                          variant="outline"
                          size="sm"
                          data-testid="button-cancel-note"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      onClick={() => setIsAddingNote(true)}
                      variant="outline"
                      className="w-full"
                      data-testid="button-add-note"
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Add Note
                    </Button>
                  )}

                  {/* Existing Notes */}
                  {lead.notes.length === 0 && !isAddingNote && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                      No notes yet
                    </p>
                  )}
                  {lead.notes.map((note) => (
                    <div
                      key={note.id}
                      className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50"
                      data-testid={`note-${note.id}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {note.createdBy}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {format(new Date(note.createdAt), 'MMM d, h:mm a')}
                        </p>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                        {note.content}
                      </p>
                      {note.type !== 'general' && (
                        <Badge variant="outline" className="text-xs mt-2">
                          {note.type}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </TabsContent>

              {/* Scheduled Callbacks */}
              <TabsContent value="callbacks" className="mt-4">
                <div className="space-y-3">
                  {lead.scheduledCallbacks.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                      No scheduled callbacks
                    </p>
                  ) : (
                    lead.scheduledCallbacks.map((callback) => (
                      <div
                        key={callback.id}
                        className={cn(
                          "p-3 rounded-lg",
                          callback.status === 'pending' ? "bg-blue-50 dark:bg-blue-900/20" :
                          callback.status === 'completed' ? "bg-green-50 dark:bg-green-900/20" :
                          "bg-gray-50 dark:bg-gray-700/50"
                        )}
                        data-testid={`callback-${callback.id}`}
                      >
                        <div className="flex items-start justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                            <p className="font-medium text-gray-900 dark:text-white">
                              {format(new Date(callback.scheduledFor), 'MMM d, yyyy h:mm a')}
                            </p>
                          </div>
                          <Badge
                            variant={callback.status === 'pending' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {callback.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">
                          {callback.reason}
                        </p>
                        {callback.notes && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {callback.notes}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </ScrollArea>
      </Card>
    </div>
  );
}
