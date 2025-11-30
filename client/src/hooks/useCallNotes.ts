import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { CallNote, InsertCallNote } from '@shared/schema';

export const useSaveCallNotes = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (noteData: InsertCallNote) => {
      const res = await apiRequest('POST', '/api/call-notes', noteData);
      return await res.json();
    },
    onSuccess: (newNote) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['/api/call-notes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      
      toast({
        title: "Notes Saved",
        description: "Call notes have been saved successfully",
      });
      
      return newNote;
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save notes",
        variant: "destructive"
      });
    },
  });
};

export const useUpdateCallNotes = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, notes }: { id: number; notes: string }) => {
      const res = await apiRequest('PATCH', `/api/call-notes/${id}`, { notes });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/call-notes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
      
      toast({
        title: "Notes Updated",
        description: "Call notes have been updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update notes",
        variant: "destructive"
      });
    },
  });
};

export const useContactCallNotes = (contactId: number, enabled: boolean = true) => {
  return useQuery<CallNote[]>({
    queryKey: ['/api/call-notes/contact', contactId],
    enabled: !!contactId && enabled,
  });
};