import { z } from "zod";

// Call states for UI
export type CallState = 'queued' | 'ringing' | 'connected' | 'completed' | 'failed' | 'busy' | 'voicemail' | 'no-answer' | 'canceled';

// Dialer modes
export type DialerMode = 'predictive' | 'power' | 'preview' | 'manual';

// Call card colors for UI
export const CALL_STATE_COLORS = {
  queued: 'bg-yellow-500 dark:bg-yellow-600',
  ringing: 'bg-blue-500 dark:bg-blue-600',
  connected: 'bg-green-500 dark:bg-green-600',
  completed: 'bg-gray-500 dark:bg-gray-600',
  failed: 'bg-red-500 dark:bg-red-600',
  busy: 'bg-orange-500 dark:bg-orange-600',
  voicemail: 'bg-purple-500 dark:bg-purple-600',
  'no-answer': 'bg-amber-500 dark:bg-amber-600',
  canceled: 'bg-gray-400 dark:bg-gray-500'
} as const;

// Active call for real-time display
export interface ActiveCall {
  id: number;
  callSid: string;
  lineId: string;
  state: CallState;
  contactName: string;
  phoneNumber: string;
  leadId?: number;
  campaignName?: string;
  campaignId?: number;
  attemptCount: number;
  lastAttemptTime?: string;
  duration: number; // seconds
  startTime: string;
  agentId?: number;
  agentName?: string;
  answeredBy?: string; // AMD result
  disposition?: string;
  priority: 'high' | 'medium' | 'low';
}

// Dashboard metrics
export interface DashboardMetrics {
  totalQueued: number;
  activeRinging: number;
  connected: number;
  completedToday: number;
  connectionRate: number; // percentage
  averageDialerSpeed: number; // calls per minute
  systemCapacity: number; // percentage
  totalAttempts: number;
  successfulConnections: number;
  failedCalls: number;
  voicemailCount: number;
  averageCallDuration: number; // seconds
}

// Campaign data
export interface DialerCampaign {
  id: number;
  name: string;
  status: 'active' | 'paused' | 'completed' | 'scheduled';
  mode: DialerMode;
  totalLeads: number;
  contactedLeads: number;
  remainingLeads: number;
  successRate: number; // percentage
  assignedAgents: number[];
  startTime?: string;
  endTime?: string;
  dailyCallLimit?: number;
  callsMadeToday: number;
  priority: 'high' | 'medium' | 'low';
  tags: string[];
}

// Lead quick view data
export interface LeadQuickView {
  id: number;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  status: string;
  tags: string[];
  source?: string;
  score?: number;
  interactionHistory: InteractionHistory[];
  notes: Note[];
  scheduledCallbacks: ScheduledCallback[];
  customFields: Record<string, any>;
}

// Interaction history
export interface InteractionHistory {
  id: number;
  type: 'call' | 'sms' | 'email' | 'note';
  date: string;
  duration?: number;
  outcome?: string;
  summary?: string;
  agentName?: string;
  disposition?: string;
}

// Note
export interface Note {
  id: number;
  content: string;
  createdBy: string;
  createdAt: string;
  type: 'general' | 'follow-up' | 'important';
}

// Scheduled callback
export interface ScheduledCallback {
  id: number;
  scheduledFor: string;
  reason: string;
  notes?: string;
  status: 'pending' | 'completed' | 'canceled';
}

// Dialer settings
export interface DialerSettings {
  mode: DialerMode;
  parallelCallLimit: number; // 1-10
  autoPacingEnabled: boolean;
  pacingAlgorithm: 'aggressive' | 'moderate' | 'conservative';
  maxAttemptsPerLead: number;
  retryIntervalMinutes: number;
  retryOnBusy: boolean;
  retryOnNoAnswer: boolean;
  retryOnFailed: boolean;
  amdEnabled: boolean; // Answering Machine Detection
  amdBehavior: 'leave-voicemail' | 'disconnect' | 'mark-callback';
  timeZoneRespect: boolean;
  allowedCallingHours: {
    start: string; // HH:MM format
    end: string;
  };
  allowedCallingDays: number[]; // 0-6 (Sunday-Saturday)
  dncListEnabled: boolean;
  priorityDialingEnabled: boolean;
  callRecordingEnabled: boolean;
}

// Agent metrics
export interface AgentMetrics {
  agentId: number;
  agentName: string;
  status: 'available' | 'on-call' | 'paused' | 'offline';
  currentCall?: ActiveCall;
  callsToday: number;
  connectedCalls: number;
  averageTalkTime: number; // seconds
  averageHandleTime: number; // seconds
  connectionRate: number; // percentage
  dispositionBreakdown: Record<string, number>;
  totalTalkTime: number; // seconds
  idleTime: number; // seconds
  pauseTime: number; // seconds
  loginTime: string;
  lastCallTime?: string;
}

// Real-time notification
export interface DialerNotification {
  id: string;
  type: 'call-connected' | 'call-failed' | 'lead-queued' | 'campaign-started' | 'campaign-completed' | 'system-alert';
  title: string;
  message: string;
  timestamp: string;
  priority: 'high' | 'medium' | 'low';
  action?: {
    label: string;
    onClick: () => void;
  };
}

// Call funnel data for visualization
export interface CallFunnelData {
  stage: string;
  count: number;
  percentage: number;
  color: string;
}

// Supervisor monitoring
export interface SupervisorMonitoring {
  agentId: number;
  agentName: string;
  currentCallSid?: string;
  monitoringMode?: 'listen' | 'whisper' | 'barge';
  callQuality?: number;
  liveMetrics: {
    callDuration: number;
    sentiment?: 'positive' | 'neutral' | 'negative';
    keywordsDetected: string[];
  };
}

// Filter options
export interface DialerFilters {
  status?: CallState[];
  campaignIds?: number[];
  agentIds?: number[];
  priority?: ('high' | 'medium' | 'low')[];
  outcome?: string[];
  dateRange?: {
    start: string;
    end: string;
  };
  searchQuery?: string;
}

// Zod schemas for validation
export const activeCallSchema = z.object({
  id: z.number(),
  callSid: z.string(),
  lineId: z.string(),
  state: z.enum(['queued', 'ringing', 'connected', 'completed', 'failed', 'busy', 'voicemail', 'no-answer', 'canceled']),
  contactName: z.string(),
  phoneNumber: z.string(),
  leadId: z.number().optional(),
  campaignName: z.string().optional(),
  campaignId: z.number().optional(),
  attemptCount: z.number(),
  lastAttemptTime: z.string().optional(),
  duration: z.number(),
  startTime: z.string(),
  agentId: z.number().optional(),
  agentName: z.string().optional(),
  answeredBy: z.string().optional(),
  disposition: z.string().optional(),
  priority: z.enum(['high', 'medium', 'low'])
});

export const dialerSettingsSchema = z.object({
  mode: z.enum(['predictive', 'power', 'preview', 'manual']),
  parallelCallLimit: z.number().min(1).max(10),
  autoPacingEnabled: z.boolean(),
  pacingAlgorithm: z.enum(['aggressive', 'moderate', 'conservative']),
  maxAttemptsPerLead: z.number().min(1).max(10),
  retryIntervalMinutes: z.number().min(1),
  retryOnBusy: z.boolean(),
  retryOnNoAnswer: z.boolean(),
  retryOnFailed: z.boolean(),
  amdEnabled: z.boolean(),
  amdBehavior: z.enum(['leave-voicemail', 'disconnect', 'mark-callback']),
  timeZoneRespect: z.boolean(),
  allowedCallingHours: z.object({
    start: z.string(),
    end: z.string()
  }),
  allowedCallingDays: z.array(z.number().min(0).max(6)),
  dncListEnabled: z.boolean(),
  priorityDialingEnabled: z.boolean(),
  callRecordingEnabled: z.boolean()
});

export const campaignSchema = z.object({
  id: z.number(),
  name: z.string(),
  status: z.enum(['active', 'paused', 'completed', 'scheduled']),
  mode: z.enum(['predictive', 'power', 'preview', 'manual']),
  totalLeads: z.number(),
  contactedLeads: z.number(),
  remainingLeads: z.number(),
  successRate: z.number(),
  assignedAgents: z.array(z.number()),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  dailyCallLimit: z.number().optional(),
  callsMadeToday: z.number(),
  priority: z.enum(['high', 'medium', 'low']),
  tags: z.array(z.string())
});

// Default dialer settings
export const DEFAULT_DIALER_SETTINGS: DialerSettings = {
  mode: 'power',
  parallelCallLimit: 5,
  autoPacingEnabled: true,
  pacingAlgorithm: 'moderate',
  maxAttemptsPerLead: 3,
  retryIntervalMinutes: 60,
  retryOnBusy: true,
  retryOnNoAnswer: true,
  retryOnFailed: false,
  amdEnabled: true,
  amdBehavior: 'disconnect',
  timeZoneRespect: true,
  allowedCallingHours: {
    start: '09:00',
    end: '17:00'
  },
  allowedCallingDays: [1, 2, 3, 4, 5], // Monday-Friday
  dncListEnabled: true,
  priorityDialingEnabled: true,
  callRecordingEnabled: true
};
