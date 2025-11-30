import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Phone, MessageSquare, MapPin, Building, Mail, StickyNote, Edit, Heart, ExternalLink, Briefcase
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type { Contact } from "@shared/schema";
import NotesModal from "@/components/modals/NotesModal";
import { useToast } from "@/hooks/use-toast";
import { useSaveCallNotes, useContactCallNotes } from "@/hooks/useCallNotes";
import { queryClient } from "@/lib/queryClient";

interface SmartContactCardProps {
  contact: Contact;
  onCall?: (phone: string) => void;
  onSms?: (contactId: number) => void;
  onEmail?: (email: string) => void;
  onEdit?: (contact: Contact) => void;
  onViewDetails?: (contact: Contact) => void;
  onMarkFavorite?: (contactId: number) => void;
  onUpdateDisposition?: (contactId: number, disposition: string) => void;
}

export default function SmartContactCard({ 
  contact, 
  onCall, 
  onSms, 
  onEmail,
  onEdit,
  onViewDetails,
  onMarkFavorite,
  onUpdateDisposition,
}: SmartContactCardProps) {
  const [showNotesModal, setShowNotesModal] = useState(false);
  const { toast } = useToast();
  const saveNotesMutation = useSaveCallNotes();
  const { data: callNotes = [] } = useContactCallNotes(contact.id, showNotesModal);

  const combinedNotes = useMemo(() => {
    if (!callNotes.length) return '';
    return callNotes
      .map(note => note.notes)
      .filter(Boolean)
      .join('\n\n---\n\n');
  }, [callNotes]);

  const getInitials = (name: string) => {
    return name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2);
  };

  const getAvatarColor = (id: number) => {
    const colors = [
      'bg-gradient-to-br from-blue-400 to-blue-600',
      'bg-gradient-to-br from-green-400 to-green-600', 
      'bg-gradient-to-br from-purple-400 to-purple-600',
      'bg-gradient-to-br from-orange-400 to-orange-600',
      'bg-gradient-to-br from-pink-400 to-pink-600',
      'bg-gradient-to-br from-cyan-400 to-cyan-600',
    ];
    return colors[id % colors.length];
  };

  const getPriorityBadge = (priority: string) => {
    const colors = {
      high: 'bg-red-500 text-white',
      medium: 'bg-yellow-500 text-white',
      low: 'bg-green-500 text-white',
    };
    return colors[priority as keyof typeof colors] || colors.medium;
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      new: 'bg-blue-500 text-white',
      contacted: 'bg-orange-500 text-white',
      qualified: 'bg-purple-500 text-white',
      converted: 'bg-green-500 text-white',
      lost: 'bg-gray-500 text-white',
    };
    return colors[status as keyof typeof colors] || colors.new;
  };

  const formatStatus = (status: string) => {
    return status?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'New';
  };

  const handleSaveNotes = async (notes: string) => {
    try {
      await saveNotesMutation.mutateAsync({
        phone: contact.phone,
        notes,
        contactId: contact.id,
        tags: []
      });
      
      setShowNotesModal(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save notes.",
        variant: "destructive"
      });
    }
  };

  return (
    <>
      <Card 
        className="hover:shadow-md transition-all border-l-4 border-l-blue-500 bg-white dark:bg-gray-800" 
        data-testid={`card-contact-${contact.id}`}
      >
        <div className="p-3">
          {/* Compact Header */}
          <div className="flex items-center gap-2 mb-2">
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm shadow flex-shrink-0",
              getAvatarColor(contact.id)
            )}>
              {contact.avatar ? (
                <img src={contact.avatar} alt={contact.name} className="w-full h-full rounded-full object-cover" />
              ) : (
                <span>{getInitials(contact.name)}</span>
              )}
            </div>
            
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-gray-900 dark:text-white truncate" data-testid={`text-name-${contact.id}`}>
                  {contact.name}
                </h3>
                <Badge className={cn("text-xs px-1.5 py-0", getPriorityBadge(contact.priority || 'medium'))}>
                  {(contact.priority || 'Medium').charAt(0).toUpperCase()}
                </Badge>
              </div>
              
              <div className="flex flex-col gap-0.5 text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                {contact.jobTitle && (
                  <div className="flex items-center gap-1">
                    <Briefcase className="w-3 h-3 flex-shrink-0" />
                    <span className="break-words">{contact.jobTitle}</span>
                  </div>
                )}
                {contact.company && (
                  <div className="flex items-center gap-1">
                    <Building className="w-3 h-3 flex-shrink-0" />
                    <span className="break-words">{contact.company}</span>
                  </div>
                )}
              </div>
            </div>
            
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onMarkFavorite?.(contact.id)}
              className="h-7 w-7 p-0 flex-shrink-0"
              data-testid={`button-favorite-${contact.id}`}
            >
              <Heart className={cn(
                "w-3.5 h-3.5",
                contact.tags?.includes('favorite') ? "text-red-500 fill-red-500" : "text-gray-400"
              )} />
            </Button>
          </div>

          {/* Contact Info - Compact */}
          <div className="space-y-1.5">
            {/* Phone */}
            <div className="flex items-center gap-1.5">
              <Phone className="w-3 h-3 text-blue-500 flex-shrink-0" />
              <span className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate" data-testid={`text-phone-${contact.id}`}>
                {contact.phone}
              </span>
            </div>

            {/* Alternate Phone */}
            {contact.alternatePhone && (
              <div className="flex items-center gap-1.5">
                <Phone className="w-3 h-3 text-purple-500 flex-shrink-0" />
                <span className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate" data-testid={`text-alternatephone-${contact.id}`}>
                  {contact.alternatePhone}
                </span>
                <Badge variant="outline" className="text-xs px-1 py-0">Alt</Badge>
              </div>
            )}

            {/* Email */}
            {contact.email && (
              <div className="flex items-center gap-1.5">
                <Mail className="w-3 h-3 text-gray-400 flex-shrink-0" />
                <span className="text-xs text-gray-600 dark:text-gray-400 truncate" data-testid={`text-email-${contact.id}`}>
                  {contact.email}
                </span>
              </div>
            )}

            {/* Location */}
            {(contact.city || contact.state) && (
              <div className="flex items-center gap-1.5">
                <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />
                <span className="text-xs text-gray-600 dark:text-gray-400 truncate" data-testid={`text-location-${contact.id}`}>
                  {[contact.city, contact.state].filter(Boolean).join(', ')}
                </span>
              </div>
            )}
          </div>

          {/* Status & Follow-up */}
          <div className="flex items-center gap-1.5 mt-2">
            <Badge className={cn("text-xs px-1.5 py-0", getStatusBadge(contact.leadStatus || 'new'))}>
              {formatStatus(contact.leadStatus || 'new')}
            </Badge>
            {contact.nextFollowUpAt && new Date(contact.nextFollowUpAt) > new Date() && (
              <Badge variant="outline" className="text-xs px-1.5 py-0 border-orange-400 text-orange-600">
                📅 {formatDistanceToNow(new Date(contact.nextFollowUpAt), { addSuffix: true })}
              </Badge>
            )}
          </div>

          {/* Disposition Selector */}
          {onUpdateDisposition && (
            <div className="mt-2">
              <Select
                value={contact.disposition || ''}
                onValueChange={(value) => onUpdateDisposition(contact.id, value)}
              >
                <SelectTrigger className="h-7 text-xs" data-testid={`select-disposition-${contact.id}`}>
                  <SelectValue placeholder="Set disposition..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="answered">Answered</SelectItem>
                  <SelectItem value="human">Human Answered</SelectItem>
                  <SelectItem value="voicemail">Voicemail</SelectItem>
                  <SelectItem value="machine">Machine Detected</SelectItem>
                  <SelectItem value="busy">Busy</SelectItem>
                  <SelectItem value="no-answer">No Answer</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="callback-requested">Callback Requested</SelectItem>
                  <SelectItem value="interested">Interested</SelectItem>
                  <SelectItem value="not-interested">Not Interested</SelectItem>
                  <SelectItem value="qualified">Qualified</SelectItem>
                  <SelectItem value="wrong-number">Wrong Number</SelectItem>
                  <SelectItem value="disconnected">Disconnected</SelectItem>
                  <SelectItem value="dnc-requested">DNC Requested</SelectItem>
                  <SelectItem value="dnc-skipped">DNC Skipped</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Actions - Icon only buttons in footer */}
          <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t dark:border-gray-700">
            {!contact.doNotCall && (
              <Button
                size="sm"
                onClick={() => onCall?.(contact.phone)}
                className="h-7 w-7 p-0 bg-blue-600 hover:bg-blue-700 text-white"
                data-testid={`button-call-${contact.id}`}
                title="Call"
              >
                <Phone className="w-3.5 h-3.5" />
              </Button>
            )}
            {contact.alternatePhone && !contact.doNotCall && (
              <Button
                size="sm"
                onClick={() => onCall?.(contact.alternatePhone!)}
                className="h-7 w-7 p-0 bg-purple-600 hover:bg-purple-700 text-white"
                data-testid={`button-call-alternate-${contact.id}`}
                title="Call Alternate"
              >
                <Phone className="w-3.5 h-3.5" />
              </Button>
            )}
            {!contact.doNotSms && (
              <Button
                size="sm"
                onClick={() => onSms?.(contact.id)}
                className="h-7 w-7 p-0 bg-green-600 hover:bg-green-700 text-white"
                data-testid={`button-sms-${contact.id}`}
                title="SMS"
              >
                <MessageSquare className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => setShowNotesModal(true)}
              className="h-7 w-7 p-0 bg-amber-600 hover:bg-amber-700 text-white"
              data-testid={`button-notes-${contact.id}`}
              title="Make Notes"
            >
              <StickyNote className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              onClick={() => onEdit?.(contact)}
              variant="outline"
              className="h-7 w-7 p-0"
              data-testid={`button-edit-${contact.id}`}
              title="Edit Contact"
            >
              <Edit className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </Card>

      <NotesModal
        isOpen={showNotesModal}
        onClose={() => setShowNotesModal(false)}
        onSave={handleSaveNotes}
        initialNotes={combinedNotes}
        title={`Notes for ${contact.name}`}
      />
    </>
  );
}
