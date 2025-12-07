import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Phone, MessageSquare, Mail, Edit, Heart, StickyNote, MoreHorizontal, Building, Briefcase, Eye, X, MapPin, Calendar, Tag
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const [showQuickView, setShowQuickView] = useState(false);
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
          "grid grid-cols-[auto_auto_1fr_120px_160px_200px_140px_auto] items-center px-4 py-3 border-b border-gray-100 dark:border-gray-800 transition-all duration-150 cursor-pointer gap-x-3",
          "hover:bg-gray-50 dark:hover:bg-gray-800/50",
          selected && "bg-blue-50 dark:bg-blue-900/20"
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => onEdit?.(contact)}
        data-testid={`row-contact-${contact.id}`}
      >
        {/* Checkbox */}
        <div className={cn(
          "w-6 flex-shrink-0 transition-opacity duration-150",
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
          "w-9 h-9 rounded-full flex items-center justify-center text-white font-medium text-sm flex-shrink-0",
          getAvatarColor(contact.id)
        )}>
          {contact.avatar ? (
            <img src={contact.avatar} alt={contact.name} className="w-full h-full rounded-full object-cover" />
          ) : (
            <span>{getInitials(contact.name)}</span>
          )}
        </div>

        {/* Name Column */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-white truncate text-sm" data-testid={`text-name-${contact.id}`}>
              {contact.name}
            </span>
            {isFavorite && (
              <Heart className="w-3 h-3 text-red-500 fill-red-500 flex-shrink-0" />
            )}
          </div>
        </div>

        {/* Job Title Column */}
        <div className="hidden md:block min-w-0">
          <span className="text-sm text-gray-500 dark:text-gray-400 truncate block" data-testid={`text-jobtitle-${contact.id}`}>
            {contact.jobTitle || "—"}
          </span>
        </div>

        {/* Company Column */}
        <div className="hidden lg:block min-w-0">
          <span className="text-sm text-gray-500 dark:text-gray-400 truncate block" data-testid={`text-company-${contact.id}`}>
            {contact.company || "—"}
          </span>
        </div>

        {/* Email Column */}
        <div className="hidden xl:block min-w-0">
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

        {/* Phone Column */}
        <div className="hidden sm:block">
          <span className="text-sm font-mono text-gray-600 dark:text-gray-300 whitespace-nowrap" data-testid={`text-phone-${contact.id}`}>
            {contact.phone}
          </span>
        </div>

        {/* Action Buttons */}
        <div className={cn(
          "flex items-center gap-1 transition-opacity duration-150 justify-end",
          isHovered ? "opacity-100" : "opacity-0"
        )}>
          {/* Quick View Eye Icon */}
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              setShowQuickView(true);
            }}
            className="h-8 w-8 p-0 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
            data-testid={`button-quickview-${contact.id}`}
            title="Quick View"
          >
            <Eye className="w-4 h-4" />
          </Button>

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
              <Phone className="w-3.5 h-3.5 mr-1" />
              Call
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

      {/* Quick View Dialog */}
      <Dialog open={showQuickView} onOpenChange={setShowQuickView}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-lg",
                getAvatarColor(contact.id)
              )}>
                {contact.avatar ? (
                  <img src={contact.avatar} alt={contact.name} className="w-full h-full rounded-full object-cover" />
                ) : (
                  <span>{getInitials(contact.name)}</span>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span>{contact.name}</span>
                  {isFavorite && (
                    <Heart className="w-4 h-4 text-red-500 fill-red-500" />
                  )}
                </div>
                {contact.jobTitle && (
                  <p className="text-sm font-normal text-gray-500 dark:text-gray-400">{contact.jobTitle}</p>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            {/* Contact Information */}
            <div className="space-y-3">
              {contact.company && (
                <div className="flex items-center gap-3 text-sm">
                  <Building className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">{contact.company}</span>
                </div>
              )}
              
              <div className="flex items-center gap-3 text-sm">
                <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-gray-700 dark:text-gray-300 font-mono">{contact.phone}</span>
                {contact.doNotCall && (
                  <Badge variant="destructive" className="text-xs">Do Not Call</Badge>
                )}
              </div>
              
              {contact.alternatePhone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300 font-mono">{contact.alternatePhone}</span>
                  <Badge variant="outline" className="text-xs">Alt</Badge>
                </div>
              )}
              
              {contact.email && (
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <a 
                    href={`mailto:${contact.email}`} 
                    className="text-blue-600 dark:text-blue-400 hover:underline truncate"
                  >
                    {contact.email}
                  </a>
                  {contact.doNotEmail && (
                    <Badge variant="destructive" className="text-xs">Do Not Email</Badge>
                  )}
                </div>
              )}
              
              {contact.address && (
                <div className="flex items-start gap-3 text-sm">
                  <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700 dark:text-gray-300">{contact.address}</span>
                </div>
              )}
            </div>

            {/* Tags */}
            {contact.tags && contact.tags.length > 0 && (
              <div className="flex items-start gap-3 text-sm">
                <Tag className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                <div className="flex flex-wrap gap-1.5">
                  {contact.tags.map((tag, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {contact.notes && (
              <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 font-medium">Notes</p>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{contact.notes}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
              {!contact.doNotCall && (
                <Button
                  size="sm"
                  onClick={() => {
                    setShowQuickView(false);
                    onCall?.(contact.phone);
                  }}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                  data-testid={`quickview-call-${contact.id}`}
                >
                  <Phone className="w-4 h-4 mr-2" />
                  Call
                </Button>
              )}
              
              {!contact.doNotSms && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowQuickView(false);
                    onSms?.(contact.id);
                  }}
                  className="flex-1"
                  data-testid={`quickview-sms-${contact.id}`}
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  SMS
                </Button>
              )}
              
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowQuickView(false);
                  onEdit?.(contact);
                }}
                data-testid={`quickview-edit-${contact.id}`}
              >
                <Edit className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
