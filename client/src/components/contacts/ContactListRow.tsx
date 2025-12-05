import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Phone, MessageSquare, Mail, Edit, Heart, StickyNote, MoreHorizontal, Building, Briefcase
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Contact } from "@shared/schema";
import NotesModal from "@/components/modals/NotesModal";
import { useToast } from "@/hooks/use-toast";
import { useSaveCallNotes, useContactCallNotes } from "@/hooks/useCallNotes";

interface ContactListRowProps {
  contact: Contact;
  onCall?: (phone: string) => void;
  onSms?: (contactId: number) => void;
  onEmail?: (email: string) => void;
  onEdit?: (contact: Contact) => void;
  onMarkFavorite?: (contactId: number) => void;
  selected?: boolean;
  onSelect?: (contactId: number, selected: boolean) => void;
}

export default function ContactListRow({ 
  contact, 
  onCall, 
  onSms, 
  onEmail,
  onEdit,
  onMarkFavorite,
  selected = false,
  onSelect,
}: ContactListRowProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const { toast } = useToast();
  const saveNotesMutation = useSaveCallNotes();
  const { data: callNotes = [] } = useContactCallNotes(contact.id, showNotesModal);

  const getInitials = (name: string) => {
    return name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2);
  };

  const getAvatarColor = (id: number) => {
    const colors = [
      'bg-blue-500',
      'bg-green-500', 
      'bg-purple-500',
      'bg-orange-500',
      'bg-pink-500',
      'bg-cyan-500',
      'bg-red-500',
      'bg-indigo-500',
    ];
    return colors[id % colors.length];
  };

  const combinedNotes = callNotes
    .map(note => note.notes)
    .filter(Boolean)
    .join('\n\n---\n\n');

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

  const isFavorite = contact.tags?.includes('favorite');

  return (
    <>
      <div 
        className={cn(
          "flex items-center px-4 py-3 border-b border-gray-100 dark:border-gray-800 transition-all duration-150 cursor-pointer",
          "hover:bg-gray-50 dark:hover:bg-gray-800/50",
          selected && "bg-blue-50 dark:bg-blue-900/20",
          isHovered && "bg-gray-50 dark:bg-gray-800/50"
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => onEdit?.(contact)}
        data-testid={`row-contact-${contact.id}`}
      >
        {/* Checkbox - visible on hover or when selected */}
        <div className={cn(
          "w-10 flex-shrink-0 transition-opacity duration-150",
          (isHovered || selected) ? "opacity-100" : "opacity-0"
        )}>
          <Checkbox 
            checked={selected}
            onCheckedChange={(checked) => {
              onSelect?.(contact.id, checked as boolean);
            }}
            onClick={(e) => e.stopPropagation()}
            data-testid={`checkbox-contact-${contact.id}`}
          />
        </div>

        {/* Avatar */}
        <div className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center text-white font-medium text-sm flex-shrink-0 mr-4",
          getAvatarColor(contact.id)
        )}>
          {contact.avatar ? (
            <img src={contact.avatar} alt={contact.name} className="w-full h-full rounded-full object-cover" />
          ) : (
            <span>{getInitials(contact.name)}</span>
          )}
        </div>

        {/* Name Column - Primary info */}
        <div className="flex-1 min-w-0 pr-4">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-white truncate" data-testid={`text-name-${contact.id}`}>
              {contact.name}
            </span>
            {isFavorite && (
              <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500 flex-shrink-0" />
            )}
          </div>
        </div>

        {/* Job Title Column */}
        <div className="w-40 flex-shrink-0 hidden md:block pr-4">
          {contact.jobTitle ? (
            <span className="text-sm text-gray-600 dark:text-gray-400 truncate block" data-testid={`text-jobtitle-${contact.id}`}>
              {contact.jobTitle}
            </span>
          ) : (
            <span className="text-sm text-gray-400 dark:text-gray-600">—</span>
          )}
        </div>

        {/* Company Column */}
        <div className="w-44 flex-shrink-0 hidden lg:block pr-4">
          {contact.company ? (
            <span className="text-sm text-gray-600 dark:text-gray-400 truncate block" data-testid={`text-company-${contact.id}`}>
              {contact.company}
            </span>
          ) : (
            <span className="text-sm text-gray-400 dark:text-gray-600">—</span>
          )}
        </div>

        {/* Email Column */}
        <div className="w-56 flex-shrink-0 hidden xl:block pr-4">
          {contact.email ? (
            <span 
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline truncate block cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onEmail?.(contact.email!);
              }}
              data-testid={`text-email-${contact.id}`}
            >
              {contact.email}
            </span>
          ) : (
            <span className="text-sm text-gray-400 dark:text-gray-600">—</span>
          )}
        </div>

        {/* Phone Column - Always visible with call action */}
        <div className="w-36 flex-shrink-0 hidden sm:block">
          <span className="text-sm font-mono text-gray-700 dark:text-gray-300" data-testid={`text-phone-${contact.id}`}>
            {contact.phone}
          </span>
        </div>

        {/* Action Buttons - Visible on hover */}
        <div className={cn(
          "flex items-center gap-1 ml-2 transition-opacity duration-150",
          isHovered ? "opacity-100" : "opacity-0"
        )}>
          {/* Primary Phone Call */}
          {!contact.doNotCall && (
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onCall?.(contact.phone);
              }}
              className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
              data-testid={`button-call-${contact.id}`}
            >
              <Phone className="w-3.5 h-3.5 mr-1.5" />
              Call
            </Button>
          )}

          {/* Alternate Phone - if exists */}
          {contact.alternatePhone && !contact.doNotCall && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onCall?.(contact.alternatePhone!);
              }}
              className="h-8 px-2 text-xs"
              data-testid={`button-call-alt-${contact.id}`}
              title={`Call ${contact.alternatePhone}`}
            >
              <Phone className="w-3.5 h-3.5" />
            </Button>
          )}

          {/* SMS */}
          {!contact.doNotSms && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onSms?.(contact.id);
              }}
              className="h-8 w-8 p-0"
              data-testid={`button-sms-${contact.id}`}
              title="Send SMS"
            >
              <MessageSquare className="w-3.5 h-3.5" />
            </Button>
          )}

          {/* Email */}
          {contact.email && !contact.doNotEmail && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onEmail?.(contact.email!);
              }}
              className="h-8 w-8 p-0"
              data-testid={`button-email-${contact.id}`}
              title="Send Email"
            >
              <Mail className="w-3.5 h-3.5" />
            </Button>
          )}

          {/* More Actions Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                data-testid={`button-more-${contact.id}`}
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={(e) => {
                e.stopPropagation();
                onEdit?.(contact);
              }}>
                <Edit className="w-4 h-4 mr-2" />
                Edit Contact
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => {
                e.stopPropagation();
                setShowNotesModal(true);
              }}>
                <StickyNote className="w-4 h-4 mr-2" />
                Add Notes
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => {
                e.stopPropagation();
                onMarkFavorite?.(contact.id);
              }}>
                <Heart className={cn("w-4 h-4 mr-2", isFavorite && "fill-red-500 text-red-500")} />
                {isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

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
