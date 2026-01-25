import { useEffect } from 'react';
import type { Contact } from "@shared/schema";
import type { ParallelCallLine } from "@shared/parallelDialerTypes";
import type { DialedContact } from "@/hooks/useParallelDialerState";

interface UseParallelDialerEventsProps {
  filteredContacts: Contact[];
  setCallLines: React.Dispatch<React.SetStateAction<ParallelCallLine[]>>;
  setStats: React.Dispatch<React.SetStateAction<any>>;
  setFirstConnectTime: React.Dispatch<React.SetStateAction<number | null>>;
  recordCompletedCall: (
    callSid: string,
    contact: Contact,
    status: DialedContact['status'],
    duration: number,
    answeredBy?: 'human' | 'machine' | 'fax' | 'unknown'
  ) => void;
  processedCallSidsRef: React.MutableRefObject<Set<string>>;
}

export function useParallelDialerEvents({
  filteredContacts,
  setCallLines,
  setStats,
  setFirstConnectTime,
  recordCompletedCall,
  processedCallSidsRef
}: UseParallelDialerEventsProps) {
  useEffect(() => {
    const handleCallStarted = (event: CustomEvent) => {
      const { lineId, phone, contactId, callSid } = event.detail;
      console.log('[ParallelDialer] Call started:', event.detail);
      
      const contact = filteredContacts.find(c => c.id === contactId);
      
      setCallLines(prev => prev.map(line => 
        line.id === lineId ? {
          ...line,
          phone,
          name: contact?.name || 'Unknown',
          company: contact?.company || undefined,
          email: contact?.email || undefined,
          contactId,
          callSid,
          status: 'dialing',
          startTime: Date.now()
        } : line
      ));
      
      setStats((prev: any) => ({ ...prev, totalDialed: prev.totalDialed + 1 }));
    };

    const handleCallStatus = (event: CustomEvent) => {
      const { lineId, status, callSid, answeredBy, duration } = event.detail;
      console.log('[ParallelDialer] Call status update:', event.detail);
      
      const isTerminal = ['completed', 'failed', 'busy', 'no-answer', 'canceled', 'voicemail', 'machine-detected'].includes(status);
      
      setCallLines(prev => prev.map(line => {
        if (line.id === lineId || (callSid && line.callSid === callSid)) {
          const newLine = { 
            ...line, 
            status: status as ParallelCallLine['status'],
            duration: duration || line.duration,
            answeredBy
          };
          
          if (isTerminal && line.callSid) {
            const contact = filteredContacts.find(c => c.id === line.contactId);
            if (contact) {
              const dialedStatus: DialedContact['status'] = 
                (answeredBy === 'human' || status === 'completed') ? 'connected' :
                (answeredBy === 'machine' || status === 'voicemail' || status === 'machine-detected') ? 'voicemail' :
                status === 'busy' ? 'busy' :
                status === 'no-answer' ? 'no-answer' :
                'failed';
              
              recordCompletedCall(line.callSid, contact, dialedStatus, duration || line.duration, answeredBy);
            }
            
            setTimeout(() => {
              setCallLines(prev => prev.map(l => 
                l.id === lineId ? { ...l, status: 'idle', phone: '', name: '', callSid: undefined, contactId: undefined, duration: 0 } : l
              ));
            }, 3000);
          }
          
          return newLine;
        }
        return line;
      }));
    };

    const handleCallConnected = (event: CustomEvent) => {
      const { lineId, callSid, answeredBy, duration } = event.detail;
      console.log('[ParallelDialer] Call connected:', event.detail);
      
      setFirstConnectTime((prev) => prev || Date.now());
      
      setCallLines(prev => prev.map(line => {
        if (line.id === lineId || (callSid && line.callSid === callSid)) {
          return { 
            ...line, 
            status: answeredBy === 'machine' ? 'machine-detected' : 'human-detected',
            answeredBy,
            duration: duration || line.duration
          };
        }
        return line;
      }));
    };

    const handleCallEnded = (event: CustomEvent) => {
      const { lineId, callSid, status, duration, answeredBy } = event.detail;
      console.log('[ParallelDialer] Call ended:', event.detail);
      
      setCallLines(prev => prev.map(line => {
        if (line.id === lineId || (callSid && line.callSid === callSid)) {
          if (line.callSid && !processedCallSidsRef.current.has(line.callSid)) {
            const contact = filteredContacts.find(c => c.id === line.contactId);
            if (contact) {
              const dialedStatus: DialedContact['status'] = 
                answeredBy === 'human' ? 'connected' :
                answeredBy === 'machine' ? 'voicemail' :
                status === 'busy' ? 'busy' :
                status === 'no-answer' ? 'no-answer' :
                'failed';
              
              recordCompletedCall(line.callSid, contact, dialedStatus, duration || line.duration, answeredBy);
            }
          }
          
          setTimeout(() => {
            setCallLines(prev => prev.map(l => 
              l.id === lineId ? { ...l, status: 'idle', phone: '', name: '', callSid: undefined, contactId: undefined, duration: 0 } : l
            ));
          }, 3000);
          
          return { ...line, status: 'completed', duration: duration || line.duration };
        }
        return line;
      }));
    };

    window.addEventListener('parallel_call_started', handleCallStarted as EventListener);
    window.addEventListener('parallel_call_status', handleCallStatus as EventListener);
    window.addEventListener('parallel_call_connected', handleCallConnected as EventListener);
    window.addEventListener('parallel_call_ended', handleCallEnded as EventListener);

    return () => {
      window.removeEventListener('parallel_call_started', handleCallStarted as EventListener);
      window.removeEventListener('parallel_call_status', handleCallStatus as EventListener);
      window.removeEventListener('parallel_call_connected', handleCallConnected as EventListener);
      window.removeEventListener('parallel_call_ended', handleCallEnded as EventListener);
    };
  }, [filteredContacts, recordCompletedCall, setCallLines, setStats, setFirstConnectTime, processedCallSidsRef]);
}
