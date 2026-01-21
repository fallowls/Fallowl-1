import { 
  users, contacts, calls, messages, recordings, voicemails, settings,
  roles, loginHistory, userActivity, subscriptionPlans, invoices, callNotes,
  smsTemplates, smsCampaigns, conversationThreads, contactLists, contactListMemberships,
  leadSources, leadStatuses, leadCampaigns, leads, leadActivities, leadTasks, leadScoring, leadNurturing,
  aiLeadScores, callIntelligence, aiInsights, tenants, tenantMemberships,
  type User, type InsertUser, type Contact, type InsertContact,
  type Call, type InsertCall, type Message, type InsertMessage,
  type Recording, type InsertRecording, type Voicemail, type InsertVoicemail,
  type Setting, type InsertSetting, type Role, type InsertRole,
  type LoginHistory, type InsertLoginHistory, type UserActivity, type InsertUserActivity,
  type SubscriptionPlan, type InsertSubscriptionPlan, type Invoice, type InsertInvoice,
  type CallNote, type InsertCallNote, type SmsTemplate, type InsertSmsTemplate,
  type SmsCampaign, type InsertSmsCampaign, type ConversationThread, type InsertConversationThread,
  type ContactList, type InsertContactList, type ContactListMembership, type InsertContactListMembership,
  type LeadSource, type InsertLeadSource, type LeadStatus, type InsertLeadStatus,
  type LeadCampaign, type InsertLeadCampaign, type Lead, type InsertLead,
  type LeadActivity, type InsertLeadActivity, type LeadTask, type InsertLeadTask,
  type LeadScoring, type InsertLeadScoring, type LeadNurturing, type InsertLeadNurturing,
  type AiLeadScore, type InsertAiLeadScore, type CallIntelligence, type InsertCallIntelligence,
  type AiInsight, type InsertAiInsight,
  type Tenant, type InsertTenant, type TenantMembership, type InsertTenantMembership
} from "@shared/schema";
import { normalizePhoneNumber, arePhoneNumbersEqual } from "@shared/phoneUtils";
import { eq, and, or, desc, asc, count, sum, gte, lte, lt, gt, ilike, isNotNull, isNull, sql, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { encryptCredential, decryptCredential } from "./encryption";

function warnIfTenantScopedParamsInvalid(
  method: string,
  params: Record<string, unknown>
): void {
  // Only log when params are suspicious; avoids spamming normal traffic.
  const isBadInt = (v: unknown) =>
    typeof v !== 'number' || !Number.isFinite(v) || Number.isNaN(v) || !Number.isInteger(v);

  const badKeys = Object.entries(params)
    .filter(([k, v]) => k.endsWith('Id') && v !== undefined && isBadInt(v))
    .map(([k]) => k);

  if (badKeys.length === 0) return;

  // This is the most common failure mode when legacy call-sites still use the old
  // (userId, id) signature after migrating to (tenantId, userId, id).
  console.warn(`[MULTITENANT][PARAMS] Suspicious call to storage.${method}: bad=${badKeys.join(',')} params=${JSON.stringify(params)}`);
  const stack = new Error().stack;
  if (stack) {
    console.warn(`[MULTITENANT][PARAMS] stack (top):\n${stack.split('\n').slice(0, 6).join('\n')}`);
  }
}

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByAuth0Id(auth0Id: string): Promise<User | undefined>;
  getUserByTwilioPhoneNumber(phoneNumber: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<InsertUser>): Promise<User>;
  deleteUser(id: number): Promise<void>;
  getAllUsers(): Promise<User[]>;
  searchUsers(query: string): Promise<User[]>;
  bulkUpdateUsers(userIds: number[], updates: Partial<InsertUser>): Promise<User[]>;
  authenticateUser(email: string, password: string): Promise<User | undefined>;
  createUserWithTenant(user: InsertUser): Promise<User>;
  
  // Per-user Twilio credentials
  updateUserTwilioCredentials(userId: number, credentials: {
    twilioAccountSid?: string;
    twilioAuthToken?: string;
    twilioApiKeySid?: string;
    twilioApiKeySecret?: string;
    twilioPhoneNumber?: string;
    twilioTwimlAppSid?: string;
    twilioConfigured?: boolean;
  }): Promise<User>;
  getUserTwilioCredentials(userId: number): Promise<{
    twilioAccountSid?: string | null;
    twilioAuthToken?: string | null;
    twilioApiKeySid?: string | null;
    twilioApiKeySecret?: string | null;
    twilioPhoneNumber?: string | null;
    twilioTwimlAppSid?: string | null;
    twilioConfigured?: boolean;
  } | undefined>;

  // Roles
  getRole(id: number): Promise<Role | undefined>;
  getRoleByName(name: string): Promise<Role | undefined>;
  createRole(role: InsertRole): Promise<Role>;
  updateRole(id: number, role: Partial<InsertRole>): Promise<Role>;
  deleteRole(id: number): Promise<void>;
  getAllRoles(): Promise<Role[]>;

  // Login History
  getLoginHistory(userId: number, limit?: number): Promise<LoginHistory[]>;
  createLoginHistoryEntry(entry: InsertLoginHistory): Promise<LoginHistory>;
  getAllLoginHistory(limit?: number): Promise<LoginHistory[]>;

  // User Activity
  getUserActivity(userId: number, limit?: number): Promise<UserActivity[]>;
  createUserActivityEntry(entry: InsertUserActivity): Promise<UserActivity>;
  getAllUserActivity(limit?: number): Promise<UserActivity[]>;

  // Subscription Plans
  getSubscriptionPlan(id: number): Promise<SubscriptionPlan | undefined>;
  getSubscriptionPlanByName(name: string): Promise<SubscriptionPlan | undefined>;
  createSubscriptionPlan(plan: InsertSubscriptionPlan): Promise<SubscriptionPlan>;
  updateSubscriptionPlan(id: number, plan: Partial<InsertSubscriptionPlan>): Promise<SubscriptionPlan>;
  deleteSubscriptionPlan(id: number): Promise<void>;
  getAllSubscriptionPlans(): Promise<SubscriptionPlan[]>;

  // Invoices
  getInvoice(id: number): Promise<Invoice | undefined>;
  getInvoicesByUser(userId: number): Promise<Invoice[]>;
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: number, invoice: Partial<InsertInvoice>): Promise<Invoice>;
  deleteInvoice(id: number): Promise<void>;
  getAllInvoices(): Promise<Invoice[]>;

  // Contacts (tenant-scoped)
  getContact(tenantId: number, userId: number, id: number): Promise<Contact | undefined>;
  getContactByPhone(tenantId: number, userId: number, phone: string): Promise<Contact | undefined>;
  getContactByNormalizedPhone(tenantId: number, userId: number, normalizedPhone: string): Promise<Contact | undefined>;
  findContactByAnyPhoneFormat(tenantId: number, userId: number, phone: string): Promise<Contact | undefined>;
  createContact(tenantId: number, userId: number, contact: InsertContact): Promise<Contact>;
  updateContact(tenantId: number, userId: number, id: number, contact: Partial<InsertContact>): Promise<Contact>;
  upsertContact(tenantId: number, userId: number, contactData: InsertContact): Promise<Contact>;
  deleteContact(tenantId: number, userId: number, id: number): Promise<void>;
  getAllContacts(tenantId: number, userId: number): Promise<Contact[]>;
  searchContacts(tenantId: number, userId: number, query: string): Promise<Contact[]>;

  // Calls (tenant-scoped)
  getCall(tenantId: number, userId: number, id: number): Promise<Call | undefined>;
  getCallByTwilioSid(tenantId: number, twilioCallSid: string): Promise<Call | undefined>;
  getCallBySipCallId(tenantId: number, sipCallId: string): Promise<Call | null>;
  createCall(tenantId: number, userId: number, call: InsertCall): Promise<Call>;
  updateCall(tenantId: number, userId: number, id: number, call: Partial<InsertCall>): Promise<Call>;
  deleteCall(tenantId: number, userId: number, id: number): Promise<void>;
  getAllCalls(tenantId: number, userId: number, options?: { page?: number; limit?: number }): Promise<{ calls: Call[]; total: number }>;
  getCallsByContact(tenantId: number, userId: number, contactId: number): Promise<Call[]>;
  getRecentCalls(tenantId: number, userId: number, limit?: number): Promise<Call[]>;
  getCallsByStatus(tenantId: number, userId: number, statuses: string[]): Promise<Call[]>;
  getActiveCalls(tenantId: number, userId: number): Promise<Call[]>;
  getCallStats(tenantId: number, userId: number): Promise<{
    totalCalls: number;
    completedCalls: number;
    missedCalls: number;
    totalDuration: number;
    averageDuration: number;
    totalCost: number;
    inboundCalls: number;
    outboundCalls: number;
    callSuccessRate: number;
    averageCallQuality: number;
  }>;

  // Messages (tenant-scoped)
  getMessage(tenantId: number, userId: number, id: number): Promise<Message | undefined>;
  getMessageByTwilioSid(tenantId: number, twilioMessageSid: string): Promise<Message | undefined>;
  createMessage(tenantId: number, userId: number, message: InsertMessage): Promise<Message>;
  updateMessage(tenantId: number, userId: number, id: number, message: Partial<InsertMessage>): Promise<Message>;
  deleteMessage(tenantId: number, userId: number, id: number): Promise<void>;
  getAllMessages(tenantId: number, userId: number): Promise<Message[]>;
  getMessagesByContact(tenantId: number, userId: number, contactId: number): Promise<Message[]>;
  getMessagesByPhone(tenantId: number, userId: number, phone: string): Promise<Message[]>;
  searchMessages(tenantId: number, userId: number, query: string): Promise<Message[]>;
  getConversationThread(tenantId: number, userId: number, contactId: number): Promise<ConversationThread | undefined>;
  createConversationThread(tenantId: number, userId: number, thread: InsertConversationThread): Promise<ConversationThread>;
  updateConversationThread(tenantId: number, userId: number, threadId: string, thread: Partial<InsertConversationThread>): Promise<ConversationThread>;
  markMessageAsRead(tenantId: number, userId: number, id: number): Promise<Message>;
  getUnreadMessageCount(tenantId: number, userId: number): Promise<number>;
  getMessageAnalytics(tenantId: number, userId: number): Promise<any>;

  // SMS Templates (tenant-scoped)
  getSmsTemplate(tenantId: number, userId: number, id: number): Promise<SmsTemplate | undefined>;
  createSmsTemplate(tenantId: number, userId: number, template: InsertSmsTemplate): Promise<SmsTemplate>;
  updateSmsTemplate(tenantId: number, userId: number, id: number, template: Partial<InsertSmsTemplate>): Promise<SmsTemplate>;
  deleteSmsTemplate(tenantId: number, userId: number, id: number): Promise<void>;
  getAllSmsTemplates(tenantId: number, userId: number): Promise<SmsTemplate[]>;
  getSmsTemplatesByCategory(tenantId: number, userId: number, category: string): Promise<SmsTemplate[]>;
  incrementTemplateUsage(tenantId: number, userId: number, id: number): Promise<void>;

  // SMS Campaigns (tenant-scoped)
  getSmsCampaign(tenantId: number, userId: number, id: number): Promise<SmsCampaign | undefined>;
  createSmsCampaign(tenantId: number, userId: number, campaign: InsertSmsCampaign): Promise<SmsCampaign>;
  updateSmsCampaign(tenantId: number, userId: number, id: number, campaign: Partial<InsertSmsCampaign>): Promise<SmsCampaign>;
  deleteSmsCampaign(tenantId: number, userId: number, id: number): Promise<void>;
  getAllSmsCampaigns(tenantId: number, userId: number): Promise<SmsCampaign[]>;
  getCampaignsByStatus(tenantId: number, userId: number, status: string): Promise<SmsCampaign[]>;
  updateCampaignStats(tenantId: number, userId: number, id: number, stats: Partial<SmsCampaign>): Promise<SmsCampaign>;

  // Advanced Recording Management (tenant-scoped)
  getRecording(tenantId: number, userId: number, id: number): Promise<Recording | undefined>;
  getRecordingByTwilioSid(tenantId: number, userId: number, twilioSid: string): Promise<Recording | undefined>;
  createRecording(tenantId: number, userId: number, recording: InsertRecording): Promise<Recording>;
  updateRecording(tenantId: number, userId: number, id: number, recording: Partial<InsertRecording>): Promise<Recording>;
  deleteRecording(tenantId: number, userId: number, id: number): Promise<void>;
  getAllRecordings(tenantId: number, userId: number): Promise<Recording[]>;
  getRecordings(tenantId: number, userId: number, options: {
    page: number;
    limit: number;
    filters: {
      search?: string;
      status?: string;
      category?: string;
      direction?: string;
      startDate?: Date;
      endDate?: Date;
      hasTranscript?: boolean;
      sentiment?: string;
      starred?: boolean;
      archived?: boolean;
    };
    sortBy: string;
    sortOrder: 'asc' | 'desc';
  }): Promise<{
    recordings: Recording[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
  getRecordingsByContact(tenantId: number, userId: number, contactId: number): Promise<Recording[]>;
  getRecordingsOlderThan(tenantId: number, userId: number, date: Date): Promise<Recording[]>;
  getRecordingStats(tenantId: number, userId: number): Promise<{
    total: number;
    totalDuration: number;
    totalSize: number;
    byStatus: Record<string, number>;
    byCategory: Record<string, number>;
    recentActivity: any[];
  }>;

  // Voicemails (tenant-scoped)
  getVoicemail(tenantId: number, userId: number, id: number): Promise<Voicemail | undefined>;
  createVoicemail(tenantId: number, userId: number, voicemail: InsertVoicemail): Promise<Voicemail>;
  updateVoicemail(tenantId: number, userId: number, id: number, voicemail: Partial<InsertVoicemail>): Promise<Voicemail>;
  deleteVoicemail(tenantId: number, userId: number, id: number): Promise<void>;
  getAllVoicemails(tenantId: number, userId: number): Promise<Voicemail[]>;
  getVoicemailsByContact(tenantId: number, userId: number, contactId: number): Promise<Voicemail[]>;
  getUnreadVoicemails(tenantId: number, userId: number): Promise<Voicemail[]>;

  // Settings (tenant-scoped)
  getSetting(tenantId: number, key: string): Promise<Setting | undefined>;
  setSetting(tenantId: number, key: string, value: any): Promise<Setting>;
  getAllSettings(tenantId: number): Promise<Setting[]>;

  // Call Notes (tenant-scoped)
  getCallNote(tenantId: number, userId: number, id: number): Promise<CallNote | undefined>;
  createCallNote(tenantId: number, userId: number, note: InsertCallNote): Promise<CallNote>;
  updateCallNote(tenantId: number, userId: number, id: number, note: Partial<InsertCallNote>): Promise<CallNote>;
  deleteCallNote(tenantId: number, userId: number, id: number): Promise<void>;
  getAllCallNotes(tenantId: number, userId: number): Promise<CallNote[]>;
  getCallNotesByCall(tenantId: number, userId: number, callId: number): Promise<CallNote[]>;
  getCallNotesByContact(tenantId: number, userId: number, contactId: number): Promise<CallNote[]>;
  getCallNotesByPhone(tenantId: number, userId: number, phone: string): Promise<CallNote[]>;

  // Lead Sources (tenant-scoped)
  getLeadSource(tenantId: number, userId: number, id: number): Promise<LeadSource | undefined>;
  getLeadSourceByName(tenantId: number, userId: number, name: string): Promise<LeadSource | undefined>;
  createLeadSource(tenantId: number, userId: number, source: InsertLeadSource): Promise<LeadSource>;
  updateLeadSource(tenantId: number, userId: number, id: number, source: Partial<InsertLeadSource>): Promise<LeadSource>;
  deleteLeadSource(tenantId: number, userId: number, id: number): Promise<void>;
  getAllLeadSources(tenantId: number, userId: number): Promise<LeadSource[]>;
  getActiveLeadSources(tenantId: number, userId: number): Promise<LeadSource[]>;

  // Lead Statuses (tenant-scoped)
  getLeadStatus(tenantId: number, userId: number, id: number): Promise<LeadStatus | undefined>;
  getLeadStatusByName(tenantId: number, userId: number, name: string): Promise<LeadStatus | undefined>;
  createLeadStatus(tenantId: number, userId: number, status: InsertLeadStatus): Promise<LeadStatus>;
  updateLeadStatus(tenantId: number, userId: number, id: number, status: Partial<InsertLeadStatus>): Promise<LeadStatus>;
  deleteLeadStatus(tenantId: number, userId: number, id: number): Promise<void>;
  getAllLeadStatuses(tenantId: number, userId: number): Promise<LeadStatus[]>;
  getActiveLeadStatuses(tenantId: number, userId: number): Promise<LeadStatus[]>;

  // Lead Campaigns (tenant-scoped)
  getLeadCampaign(tenantId: number, userId: number, id: number): Promise<LeadCampaign | undefined>;
  createLeadCampaign(tenantId: number, userId: number, campaign: InsertLeadCampaign): Promise<LeadCampaign>;
  updateLeadCampaign(tenantId: number, userId: number, id: number, campaign: Partial<InsertLeadCampaign>): Promise<LeadCampaign>;
  deleteLeadCampaign(tenantId: number, userId: number, id: number): Promise<void>;
  getAllLeadCampaigns(tenantId: number, userId: number): Promise<LeadCampaign[]>;
  getLeadCampaignsByStatus(tenantId: number, userId: number, status: string): Promise<LeadCampaign[]>;
  getLeadCampaignsByType(tenantId: number, userId: number, type: string): Promise<LeadCampaign[]>;

  // Leads (tenant-scoped)
  getLead(tenantId: number, userId: number, id: number): Promise<Lead | undefined>;
  getLeadByEmail(tenantId: number, userId: number, email: string): Promise<Lead | undefined>;
  getLeadByPhone(tenantId: number, userId: number, phone: string): Promise<Lead | undefined>;
  createLead(tenantId: number, userId: number, lead: InsertLead): Promise<Lead>;
  updateLead(tenantId: number, userId: number, id: number, lead: Partial<InsertLead>): Promise<Lead>;
  deleteLead(tenantId: number, userId: number, id: number): Promise<void>;
  getAllLeads(tenantId: number, userId: number): Promise<Lead[]>;
  getLeadsByStatus(tenantId: number, userId: number, statusId: number): Promise<Lead[]>;
  getLeadsBySource(tenantId: number, userId: number, sourceId: number): Promise<Lead[]>;
  getLeadsByAssignee(tenantId: number, userId: number, assigneeId: number): Promise<Lead[]>;
  getLeadsByPriority(tenantId: number, userId: number, priority: string): Promise<Lead[]>;
  getLeadsByTemperature(tenantId: number, userId: number, temperature: string): Promise<Lead[]>;
  searchLeads(tenantId: number, userId: number, query: string): Promise<Lead[]>;
  getLeadsWithFilters(tenantId: number, userId: number, filters: {
    status?: number;
    source?: number;
    assignee?: number;
    priority?: string;
    temperature?: string;
    score?: { min?: number; max?: number };
    value?: { min?: number; max?: number };
    tags?: string[];
    dateRange?: { start: Date; end: Date };
  }): Promise<Lead[]>;
  getLeadStats(tenantId: number, userId: number): Promise<{
    total: number;
    new: number;
    qualified: number;
    converted: number;
    totalValue: number;
    avgScore: number;
    conversionRate: number;
    byStatus: Record<string, number>;
    bySource: Record<string, number>;
    byAssignee: Record<string, number>;
  }>;

  // Lead Activities (tenant-scoped)
  getLeadActivity(tenantId: number, userId: number, id: number): Promise<LeadActivity | undefined>;
  createLeadActivity(tenantId: number, userId: number, activity: InsertLeadActivity): Promise<LeadActivity>;
  updateLeadActivity(tenantId: number, userId: number, id: number, activity: Partial<InsertLeadActivity>): Promise<LeadActivity>;
  deleteLeadActivity(tenantId: number, userId: number, id: number): Promise<void>;
  getLeadActivities(tenantId: number, userId: number, leadId: number): Promise<LeadActivity[]>;
  getLeadActivitiesByType(tenantId: number, userId: number, leadId: number, type: string): Promise<LeadActivity[]>;
  getLeadActivitiesByUser(tenantId: number, userId: number, performedByUserId: number): Promise<LeadActivity[]>;
  getRecentLeadActivities(tenantId: number, userId: number, limit?: number): Promise<LeadActivity[]>;

  // Lead Tasks (tenant-scoped)
  getLeadTask(tenantId: number, userId: number, id: number): Promise<LeadTask | undefined>;
  createLeadTask(tenantId: number, userId: number, task: InsertLeadTask): Promise<LeadTask>;
  updateLeadTask(tenantId: number, userId: number, id: number, task: Partial<InsertLeadTask>): Promise<LeadTask>;
  deleteLeadTask(tenantId: number, userId: number, id: number): Promise<void>;
  getLeadTasks(tenantId: number, userId: number, leadId: number): Promise<LeadTask[]>;
  getLeadTasksByAssignee(tenantId: number, userId: number, assigneeId: number): Promise<LeadTask[]>;
  getLeadTasksByStatus(tenantId: number, userId: number, status: string): Promise<LeadTask[]>;
  getOverdueTasks(tenantId: number, userId: number): Promise<LeadTask[]>;
  getUpcomingTasks(tenantId: number, userId: number, days?: number): Promise<LeadTask[]>;

  // Lead Scoring (tenant-scoped)
  getLeadScoring(tenantId: number, userId: number, id: number): Promise<LeadScoring | undefined>;
  getLeadScoringByLead(tenantId: number, userId: number, leadId: number): Promise<LeadScoring[]>;
  createLeadScoring(tenantId: number, userId: number, scoring: InsertLeadScoring): Promise<LeadScoring>;
  updateLeadScoring(tenantId: number, userId: number, id: number, scoring: Partial<InsertLeadScoring>): Promise<LeadScoring>;
  deleteLeadScoring(tenantId: number, userId: number, id: number): Promise<void>;
  getLeadScoringHistory(tenantId: number, userId: number, leadId: number): Promise<LeadScoring[]>;

  // Lead Nurturing (tenant-scoped)
  getLeadNurturing(tenantId: number, userId: number, id: number): Promise<LeadNurturing | undefined>;
  getLeadNurturingByLead(tenantId: number, userId: number, leadId: number): Promise<LeadNurturing[]>;
  createLeadNurturing(tenantId: number, userId: number, nurturing: InsertLeadNurturing): Promise<LeadNurturing>;
  updateLeadNurturing(tenantId: number, userId: number, id: number, nurturing: Partial<InsertLeadNurturing>): Promise<LeadNurturing>;
  deleteLeadNurturing(tenantId: number, userId: number, id: number): Promise<void>;
  getActiveNurturingSequences(tenantId: number, userId: number): Promise<LeadNurturing[]>;
  getNurturingSequencesByStatus(tenantId: number, userId: number, status: string): Promise<LeadNurturing[]>;

  // Contact Lists (tenant-scoped)
  getContactList(tenantId: number, id: number): Promise<ContactList | undefined>;
  getContactListByName(tenantId: number, name: string): Promise<ContactList | undefined>;
  createContactList(tenantId: number, list: InsertContactList): Promise<ContactList>;
  updateContactList(tenantId: number, id: number, list: Partial<InsertContactList>): Promise<ContactList>;
  deleteContactList(tenantId: number, id: number): Promise<void>;
  getAllContactLists(tenantId: number): Promise<ContactList[]>;
  getContactListsByCategory(tenantId: number, category: string): Promise<ContactList[]>;
  getContactListsByType(tenantId: number, type: string): Promise<ContactList[]>;

  // Contact List Memberships (tenant-scoped)
  getContactListMembership(tenantId: number, id: number): Promise<ContactListMembership | undefined>;
  createContactListMembership(tenantId: number, membership: InsertContactListMembership): Promise<ContactListMembership>;
  updateContactListMembership(tenantId: number, id: number, membership: Partial<InsertContactListMembership>): Promise<ContactListMembership>;
  deleteContactListMembership(tenantId: number, id: number): Promise<void>;
  getContactListMemberships(tenantId: number, listId: number): Promise<ContactListMembership[]>;
  getContactMemberships(tenantId: number, contactId: number): Promise<ContactListMembership[]>;
  addContactToList(tenantId: number, contactId: number, listId: number, addedBy?: number): Promise<ContactListMembership>;
  removeContactFromList(tenantId: number, contactId: number, listId: number): Promise<void>;
  getContactsInList(tenantId: number, listId: number): Promise<Contact[]>;

  // AI Lead Scoring (tenant-scoped)
  getAiLeadScore(tenantId: number, contactId: number): Promise<AiLeadScore | undefined>;
  upsertAiLeadScore(tenantId: number, score: Omit<InsertAiLeadScore, 'tenantId'>): Promise<AiLeadScore>;
  getTopScoredContacts(tenantId: number, limit: number): Promise<Array<Contact & { aiScore: AiLeadScore }>>;

  // Call Intelligence (tenant-scoped)
  getCallIntelligence(tenantId: number, callId: number): Promise<CallIntelligence | undefined>;
  createCallIntelligence(tenantId: number, intelligence: Omit<InsertCallIntelligence, 'tenantId'>): Promise<CallIntelligence>;
  updateCallIntelligence(tenantId: number, id: number, intelligence: Partial<InsertCallIntelligence>): Promise<CallIntelligence>;

  // AI Insights (tenant-scoped)
  getAiInsight(tenantId: number, id: number): Promise<AiInsight | undefined>;
  getAiInsights(tenantId: number, filters: { status?: string; type?: string }): Promise<AiInsight[]>;
  createAiInsight(tenantId: number, insight: Omit<InsertAiInsight, 'tenantId'>): Promise<AiInsight>;
  updateAiInsight(tenantId: number, id: number, insight: Partial<InsertAiInsight>): Promise<AiInsight>;
  deleteAiInsight(tenantId: number, id: number): Promise<void>;

  // Tenants
  getTenant(id: number): Promise<Tenant | undefined>;
  getTenantBySlug(slug: string): Promise<Tenant | undefined>;
  createTenant(tenant: InsertTenant): Promise<Tenant>;
  updateTenant(id: number, tenant: Partial<InsertTenant>): Promise<Tenant>;
  deleteTenant(id: number): Promise<void>;
  getAllTenants(): Promise<Tenant[]>;
  
  // Tenant Memberships
  getTenantMembership(tenantId: number, userId: number): Promise<TenantMembership | undefined>;
  getTenantMembershipsByUserId(userId: number): Promise<TenantMembership[]>;
  getTenantMembers(tenantId: number): Promise<TenantMembership[]>;
  createTenantMembership(membership: InsertTenantMembership): Promise<TenantMembership>;
  updateTenantMembership(id: number, membership: Partial<InsertTenantMembership>): Promise<TenantMembership>;
  deleteTenantMembership(id: number): Promise<void>;
  getDefaultTenantForUser(userId: number): Promise<TenantMembership | undefined>;
  ensureDefaultTenant(userId: number): Promise<TenantMembership>;
}


export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async getUserByAuth0Id(auth0Id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.auth0Id, auth0Id));
    return user || undefined;
  }

  async getUserByTwilioPhoneNumber(phoneNumber: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.twilioPhoneNumber, phoneNumber));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    // Hash password if provided and not an Auth0 user
    let hashedPassword = insertUser.password;
    if (insertUser.password && !insertUser.auth0Id) {
      hashedPassword = await bcrypt.hash(insertUser.password, 10);
    }

    const [user] = await db
      .insert(users)
      .values({
        ...insertUser,
        password: hashedPassword
      })
      .returning();
    return user;
  }

  async updateUser(id: number, updateData: Partial<InsertUser>): Promise<User> {
    // Hash password if it's being updated
    let dataToUpdate = { ...updateData };
    if (updateData.password) {
      dataToUpdate.password = await bcrypt.hash(updateData.password, 10);
    }

    const [user] = await db
      .update(users)
      .set(dataToUpdate)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async deleteUser(id: number): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async searchUsers(query: string): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .where(
        or(
          ilike(users.username, `%${query}%`),
          ilike(users.email, `%${query}%`),
          ilike(users.firstName, `%${query}%`),
          ilike(users.lastName, `%${query}%`)
        )
      )
      .orderBy(desc(users.createdAt));
  }

  async bulkUpdateUsers(userIds: number[], updates: Partial<InsertUser>): Promise<User[]> {
    // Update users in batch
    await db
      .update(users)
      .set(updates)
      .where(inArray(users.id, userIds));
    
    // Return updated users
    return await db
      .select()
      .from(users)
      .where(inArray(users.id, userIds));
  }

  async authenticateUser(email: string, password: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));
    
    if (!user || !user.password) {
      return undefined;
    }

    // For Auth0 users (no password), always return undefined
    if (user.auth0Id && !user.password) {
      return undefined;
    }

    // Use bcrypt to compare passwords
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return undefined;
    }

    // Update last login
    await db
      .update(users)
      .set({ lastLogin: new Date() })
      .where(eq(users.id, user.id));

    return { ...user, lastLogin: new Date() };
  }

  // Per-user Twilio credentials (with encryption)
  async updateUserTwilioCredentials(userId: number, credentials: {
    twilioAccountSid?: string;
    twilioAuthToken?: string;
    twilioApiKeySid?: string;
    twilioApiKeySecret?: string;
    twilioPhoneNumber?: string;
    twilioTwimlAppSid?: string;
    twilioConfigured?: boolean;
  }): Promise<User> {
    // Encrypt sensitive credentials before storing
    const encryptedCredentials = {
      twilioAccountSid: credentials.twilioAccountSid ? encryptCredential(credentials.twilioAccountSid) : undefined,
      twilioAuthToken: credentials.twilioAuthToken ? encryptCredential(credentials.twilioAuthToken) : undefined,
      twilioApiKeySid: credentials.twilioApiKeySid ? encryptCredential(credentials.twilioApiKeySid) : undefined,
      twilioApiKeySecret: credentials.twilioApiKeySecret ? encryptCredential(credentials.twilioApiKeySecret) : undefined,
      twilioPhoneNumber: credentials.twilioPhoneNumber,
      twilioTwimlAppSid: credentials.twilioTwimlAppSid,
      twilioConfigured: credentials.twilioConfigured,
    };

    const [updatedUser] = await db
      .update(users)
      .set(encryptedCredentials)
      .where(eq(users.id, userId))
      .returning();
    
    if (!updatedUser) {
      throw new Error('User not found');
    }
    
    console.log(`🔐 Encrypted Twilio credentials updated for user ${userId}`);
    return updatedUser;
  }

  async getUserTwilioCredentials(userId: number): Promise<{
    twilioAccountSid?: string | null;
    twilioAuthToken?: string | null;
    twilioApiKeySid?: string | null;
    twilioApiKeySecret?: string | null;
    twilioPhoneNumber?: string | null;
    twilioTwimlAppSid?: string | null;
    twilioConfigured?: boolean;
  } | undefined> {
    const [user] = await db
      .select({
        twilioAccountSid: users.twilioAccountSid,
        twilioAuthToken: users.twilioAuthToken,
        twilioApiKeySid: users.twilioApiKeySid,
        twilioApiKeySecret: users.twilioApiKeySecret,
        twilioPhoneNumber: users.twilioPhoneNumber,
        twilioTwimlAppSid: users.twilioTwimlAppSid,
        twilioConfigured: users.twilioConfigured,
      })
      .from(users)
      .where(eq(users.id, userId));
    
    if (!user) {
      return undefined;
    }

    // Decrypt sensitive credentials
    return {
      twilioAccountSid: decryptCredential(user.twilioAccountSid),
      twilioAuthToken: decryptCredential(user.twilioAuthToken),
      twilioApiKeySid: decryptCredential(user.twilioApiKeySid),
      twilioApiKeySecret: decryptCredential(user.twilioApiKeySecret),
      twilioPhoneNumber: user.twilioPhoneNumber,
      twilioTwimlAppSid: user.twilioTwimlAppSid,
      twilioConfigured: user.twilioConfigured || false,
    };
  }

  // Roles
  async getRole(id: number): Promise<Role | undefined> {
    const [role] = await db.select().from(roles).where(eq(roles.id, id));
    return role || undefined;
  }

  async getRoleByName(name: string): Promise<Role | undefined> {
    const [role] = await db.select().from(roles).where(eq(roles.name, name));
    return role || undefined;
  }

  async createRole(insertRole: InsertRole): Promise<Role> {
    const [role] = await db
      .insert(roles)
      .values(insertRole)
      .returning();
    return role;
  }

  async updateRole(id: number, updateData: Partial<InsertRole>): Promise<Role> {
    const [role] = await db
      .update(roles)
      .set(updateData)
      .where(eq(roles.id, id))
      .returning();
    return role;
  }

  async deleteRole(id: number): Promise<void> {
    await db.delete(roles).where(eq(roles.id, id));
  }

  async getAllRoles(): Promise<Role[]> {
    return await db.select().from(roles).orderBy(asc(roles.name));
  }

  // Login History
  async getLoginHistory(userId: number, limit: number = 50): Promise<LoginHistory[]> {
    return await db
      .select()
      .from(loginHistory)
      .where(eq(loginHistory.userId, userId))
      .orderBy(desc(loginHistory.timestamp))
      .limit(limit);
  }

  async createLoginHistoryEntry(insertEntry: InsertLoginHistory): Promise<LoginHistory> {
    const [entry] = await db
      .insert(loginHistory)
      .values(insertEntry)
      .returning();
    return entry;
  }

  async getAllLoginHistory(limit: number = 100): Promise<LoginHistory[]> {
    return await db
      .select()
      .from(loginHistory)
      .orderBy(desc(loginHistory.timestamp))
      .limit(limit);
  }

  // User Activity
  async getUserActivity(userId: number, limit: number = 50): Promise<UserActivity[]> {
    return await db
      .select()
      .from(userActivity)
      .where(eq(userActivity.userId, userId))
      .orderBy(desc(userActivity.timestamp))
      .limit(limit);
  }

  async createUserActivityEntry(insertEntry: InsertUserActivity): Promise<UserActivity> {
    const [entry] = await db
      .insert(userActivity)
      .values(insertEntry)
      .returning();
    return entry;
  }

  async getAllUserActivity(limit: number = 100): Promise<UserActivity[]> {
    return await db
      .select()
      .from(userActivity)
      .orderBy(desc(userActivity.timestamp))
      .limit(limit);
  }

  // Subscription Plans
  async getSubscriptionPlan(id: number): Promise<SubscriptionPlan | undefined> {
    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, id));
    return plan || undefined;
  }

  async getSubscriptionPlanByName(name: string): Promise<SubscriptionPlan | undefined> {
    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.name, name));
    return plan || undefined;
  }

  async createSubscriptionPlan(insertPlan: InsertSubscriptionPlan): Promise<SubscriptionPlan> {
    const [plan] = await db
      .insert(subscriptionPlans)
      .values(insertPlan)
      .returning();
    return plan;
  }

  async updateSubscriptionPlan(id: number, updateData: Partial<InsertSubscriptionPlan>): Promise<SubscriptionPlan> {
    const [plan] = await db
      .update(subscriptionPlans)
      .set(updateData)
      .where(eq(subscriptionPlans.id, id))
      .returning();
    return plan;
  }

  async deleteSubscriptionPlan(id: number): Promise<void> {
    await db.delete(subscriptionPlans).where(eq(subscriptionPlans.id, id));
  }

  async getAllSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    return await db.select().from(subscriptionPlans).orderBy(asc(subscriptionPlans.name));
  }

  // Invoices
  async getInvoice(id: number): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    return invoice || undefined;
  }

  async getInvoicesByUser(userId: number): Promise<Invoice[]> {
    return await db
      .select()
      .from(invoices)
      .where(eq(invoices.userId, userId))
      .orderBy(desc(invoices.createdAt));
  }

  async createInvoice(insertInvoice: InsertInvoice): Promise<Invoice> {
    const [invoice] = await db
      .insert(invoices)
      .values(insertInvoice)
      .returning();
    return invoice;
  }

  async updateInvoice(id: number, updateData: Partial<InsertInvoice>): Promise<Invoice> {
    const [invoice] = await db
      .update(invoices)
      .set(updateData)
      .where(eq(invoices.id, id))
      .returning();
    return invoice;
  }

  async deleteInvoice(id: number): Promise<void> {
    await db.delete(invoices).where(eq(invoices.id, id));
  }

  async getAllInvoices(): Promise<Invoice[]> {
    return await db.select().from(invoices).orderBy(desc(invoices.createdAt));
  }

  // Contacts (tenant-scoped)
  async getContact(tenantId: number, userId: number, id: number): Promise<Contact | undefined> {
    warnIfTenantScopedParamsInvalid('getContact', { tenantId, userId, id });
    const [contact] = await db.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.tenantId, tenantId)));
    return contact || undefined;
  }

  async getContactByPhone(tenantId: number, userId: number, phone: string): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(and(eq(contacts.phone, phone), eq(contacts.tenantId, tenantId)));
    return contact || undefined;
  }

  async getContactByNormalizedPhone(tenantId: number, userId: number, normalizedPhone: string): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(and(eq(contacts.phone, normalizedPhone), eq(contacts.tenantId, tenantId)));
    return contact || undefined;
  }

  async findContactByAnyPhoneFormat(tenantId: number, userId: number, phone: string): Promise<Contact | undefined> {
    const normalized = normalizePhoneNumber(phone);
    
    if (!normalized.isValid) {
      return undefined;
    }

    // Try exact match first
    let contact = await this.getContactByPhone(tenantId, userId, phone);
    if (contact) return contact;

    // Try normalized phone
    contact = await this.getContactByPhone(tenantId, userId, normalized.normalized);
    if (contact) return contact;

    // Search through tenant's contacts to find any with equivalent phone numbers
    const allContacts = await db.select().from(contacts).where(eq(contacts.tenantId, tenantId));
    for (const existingContact of allContacts) {
      if (arePhoneNumbersEqual(phone, existingContact.phone)) {
        return existingContact;
      }
    }

    return undefined;
  }

  async createContact(tenantId: number, userId: number, insertContact: InsertContact): Promise<Contact> {
    warnIfTenantScopedParamsInvalid('createContact', { tenantId, userId });
    // Normalize phone number before creating
    const normalized = normalizePhoneNumber(insertContact.phone);
    const contactData = {
      ...insertContact,
      userId: userId,
      tenantId: tenantId,
      phone: normalized.isValid ? normalized.normalized : insertContact.phone
    };

    const [contact] = await db
      .insert(contacts)
      .values(contactData)
      .returning();
    return contact;
  }

  async updateContact(tenantId: number, userId: number, id: number, updateData: Partial<InsertContact>): Promise<Contact> {
    warnIfTenantScopedParamsInvalid('updateContact', { tenantId, userId, id });
    // Normalize phone number if being updated
    const normalizedUpdateData = { ...updateData };
    if (updateData.phone) {
      const normalized = normalizePhoneNumber(updateData.phone);
      normalizedUpdateData.phone = normalized.isValid ? normalized.normalized : updateData.phone;
    }

    const [contact] = await db
      .update(contacts)
      .set(normalizedUpdateData)
      .where(and(eq(contacts.id, id), eq(contacts.tenantId, tenantId)))
      .returning();
    return contact;
  }

  async upsertContact(tenantId: number, userId: number, contactData: InsertContact): Promise<Contact> {
    // Normalize the phone number
    const normalized = normalizePhoneNumber(contactData.phone);
    const normalizedPhone = normalized.isValid ? normalized.normalized : contactData.phone;
    
    // Try to find existing contact using smart phone matching
    const existingContact = await this.findContactByAnyPhoneFormat(tenantId, userId, contactData.phone);
    
    if (existingContact) {
      // Update existing contact - merge data intelligently
      const mergedData: Partial<InsertContact> = {
        // Keep existing name if new one is empty/default
        name: contactData.name && contactData.name !== 'Unknown Caller' ? contactData.name : existingContact.name,
        // Always use normalized phone
        phone: normalizedPhone,
        // Merge other fields, preferring new data over empty/null values
        email: contactData.email || existingContact.email,
        company: contactData.company || existingContact.company,
        jobTitle: contactData.jobTitle || existingContact.jobTitle,
        address: contactData.address || existingContact.address,
        city: contactData.city || existingContact.city,
        state: contactData.state || existingContact.state,
        zipCode: contactData.zipCode || existingContact.zipCode,
        country: contactData.country || existingContact.country,
        // Merge notes - append new notes to existing ones
        notes: contactData.notes 
          ? (existingContact.notes ? `${existingContact.notes}\n\n${contactData.notes}` : contactData.notes)
          : existingContact.notes,
        // Preserve or upgrade priority and lead status
        priority: contactData.priority || existingContact.priority,
        leadStatus: contactData.leadStatus || existingContact.leadStatus,
        leadSource: contactData.leadSource || existingContact.leadSource,
        // Merge tags
        tags: contactData.tags && contactData.tags.length > 0 
          ? Array.from(new Set([...(existingContact.tags || []), ...contactData.tags]))
          : existingContact.tags,
        // Update timestamps
        lastContactedAt: new Date()
      };
      
      return this.updateContact(tenantId, userId, existingContact.id, mergedData);
    } else {
      // Create new contact with normalized phone
      const newContactData = {
        ...contactData,
        phone: normalizedPhone,
        lastContactedAt: new Date()
      };
      
      return this.createContact(tenantId, userId, newContactData);
    }
  }

  async deleteContact(tenantId: number, userId: number, id: number): Promise<void> {
    warnIfTenantScopedParamsInvalid('deleteContact', { tenantId, userId, id });
    await db.delete(contacts).where(and(eq(contacts.id, id), eq(contacts.tenantId, tenantId)));
  }

  async getAllContacts(tenantId: number, userId: number): Promise<Contact[]> {
    warnIfTenantScopedParamsInvalid('getAllContacts', { tenantId, userId });
    return await db
      .select({
        id: contacts.id,
        tenantId: contacts.tenantId,
        userId: contacts.userId,
        name: contacts.name,
        email: contacts.email,
        phone: contacts.phone,
        company: contacts.company,
        jobTitle: contacts.jobTitle,
        leadStatus: contacts.leadStatus,
        priority: contacts.priority,
        lastContactedAt: contacts.lastContactedAt,
        createdAt: contacts.createdAt,
      })
      .from(contacts)
      .where(eq(contacts.tenantId, tenantId))
      .orderBy(asc(contacts.name)) as Contact[];
  }

  async searchContacts(tenantId: number, userId: number, query: string): Promise<Contact[]> {
    return await db
      .select({
        id: contacts.id,
        tenantId: contacts.tenantId,
        userId: contacts.userId,
        name: contacts.name,
        email: contacts.email,
        phone: contacts.phone,
        company: contacts.company,
        jobTitle: contacts.jobTitle,
        leadStatus: contacts.leadStatus,
        priority: contacts.priority,
        lastContactedAt: contacts.lastContactedAt,
        createdAt: contacts.createdAt,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.tenantId, tenantId),
          or(
            ilike(contacts.name, `%${query}%`),
            ilike(contacts.phone, `%${query}%`),
            ilike(contacts.email, `%${query}%`)
          )
        )
      )
      .orderBy(asc(contacts.name)) as Contact[];
  }

  // Calls (tenant-scoped)
  async getCall(tenantId: number, userId: number, id: number): Promise<Call | undefined> {
    warnIfTenantScopedParamsInvalid('getCall', { tenantId, userId, id });
    const [call] = await db.select().from(calls).where(and(eq(calls.id, id), eq(calls.tenantId, tenantId)));
    return call || undefined;
  }

  async createCall(tenantId: number, userId: number, insertCall: InsertCall): Promise<Call> {
    warnIfTenantScopedParamsInvalid('createCall', { tenantId, userId });
    try {
      const [call] = await db
        .insert(calls)
        .values({
          tenantId,
          userId,
          contactId: insertCall.contactId || null,
          phone: insertCall.phone,
          type: insertCall.type,
          status: insertCall.status,
          duration: insertCall.duration || 0,
          recordingUrl: insertCall.recordingUrl || null,
          metadata: insertCall.metadata || {},
          callQuality: insertCall.callQuality || null,
          cost: insertCall.cost || "0",
          carrier: insertCall.carrier || null,
          location: insertCall.location || null,
          deviceType: insertCall.deviceType || null,
          sipCallId: insertCall.sipCallId || null,
          ringDuration: insertCall.ringDuration || null,
          connectionTime: insertCall.connectionTime || null,
          answeredBy: insertCall.answeredBy || null,
          amdComment: insertCall.amdComment || null,
          disposition: insertCall.disposition || null,
          isParallelDialer: insertCall.isParallelDialer || false,
          lineId: insertCall.lineId || null,
          droppedReason: insertCall.droppedReason || null,
        })
        .returning();
      return call;
    } catch (error) {
      console.error("CRITICAL: createCall database error:", error);
      throw error;
    }
  }

  async updateCall(tenantId: number, userId: number, id: number, updateData: Partial<InsertCall>): Promise<Call> {
    warnIfTenantScopedParamsInvalid('updateCall', { tenantId, userId, id });
    const [call] = await db
      .update(calls)
      .set(updateData)
      .where(and(eq(calls.id, id), eq(calls.tenantId, tenantId)))
      .returning();
    return call;
  }

  async deleteCall(tenantId: number, userId: number, id: number): Promise<void> {
    warnIfTenantScopedParamsInvalid('deleteCall', { tenantId, userId, id });
    await db.delete(calls).where(and(eq(calls.id, id), eq(calls.tenantId, tenantId)));
  }

  async getAllCalls(tenantId: number, userId: number, options: { page?: number; limit?: number } = {}): Promise<{ calls: Call[]; total: number }> {
    warnIfTenantScopedParamsInvalid('getAllCalls', { tenantId, userId });
    const page = options.page || 1;
    const limit = options.limit || 50;
    const offset = (page - 1) * limit;

    const [totalResult] = await db
      .select({ count: count() })
      .from(calls)
      .where(and(eq(calls.tenantId, tenantId), eq(calls.userId, userId)));
    
    const total = Number(totalResult?.count || 0);

    const results = await db
      .select()
      .from(calls)
      .where(and(eq(calls.tenantId, tenantId), eq(calls.userId, userId)))
      .orderBy(desc(calls.createdAt))
      .limit(limit)
      .offset(offset);

    return { calls: results, total };
  }

  async getCallsByContact(tenantId: number, userId: number, contactId: number): Promise<Call[]> {
    return await db
      .select()
      .from(calls)
      .where(and(eq(calls.contactId, contactId), eq(calls.tenantId, tenantId)))
      .orderBy(desc(calls.createdAt));
  }

  async getRecentCalls(tenantId: number, userId: number, limit: number = 10): Promise<Call[]> {
    warnIfTenantScopedParamsInvalid('getRecentCalls', { tenantId, userId });
    return await db
      .select()
      .from(calls)
      .where(eq(calls.tenantId, tenantId))
      .orderBy(desc(calls.createdAt))
      .limit(limit);
  }

  async getCallsByStatus(tenantId: number, userId: number, statuses: string[]): Promise<Call[]> {
    warnIfTenantScopedParamsInvalid('getCallsByStatus', { tenantId, userId });
    if (statuses.length === 0) {
      return [];
    }
    return await db
      .select()
      .from(calls)
      .where(and(
        eq(calls.tenantId, tenantId),
        inArray(calls.status, statuses)
      ))
      .orderBy(desc(calls.createdAt));
  }

  async getActiveCalls(tenantId: number, userId: number): Promise<Call[]> {
    warnIfTenantScopedParamsInvalid('getActiveCalls', { tenantId, userId });
    const activeStatuses = ['queued', 'initiated', 'ringing', 'in-progress'];
    return this.getCallsByStatus(tenantId, userId, activeStatuses);
  }

  async getCallByTwilioSid(tenantId: number, callSid: string): Promise<Call | undefined> {
    warnIfTenantScopedParamsInvalid('getCallByTwilioSid', { tenantId });
    const results = await db
      .select()
      .from(calls)
      .where(and(eq(calls.sipCallId, callSid), eq(calls.tenantId, tenantId)))
      .limit(1);
    
    if (results.length > 0) {
      return results[0];
    }
    
    const metadataResults = await db
      .select()
      .from(calls)
      .where(and(
        sql`${calls.metadata}->>'twilioCallSid' = ${callSid}`,
        eq(calls.tenantId, tenantId)
      ))
      .limit(1);
    
    return metadataResults.length > 0 ? metadataResults[0] : undefined;
  }

  async getCallBySipCallId(tenantId: number, sipCallId: string): Promise<Call | null> {
    warnIfTenantScopedParamsInvalid('getCallBySipCallId', { tenantId });
    const results = await db
      .select()
      .from(calls)
      .where(and(eq(calls.sipCallId, sipCallId), eq(calls.tenantId, tenantId)))
      .limit(1);
    return results.length > 0 ? results[0] : null;
  }

  async getCallStats(tenantId: number, userId: number): Promise<{
    totalCalls: number;
    completedCalls: number;
    missedCalls: number;
    totalDuration: number;
    averageDuration: number;
    totalCost: number;
    inboundCalls: number;
    outboundCalls: number;
    callSuccessRate: number;
    averageCallQuality: number;
  }> {
    warnIfTenantScopedParamsInvalid('getCallStats', { tenantId, userId });
    const allCalls = await db
      .select({
        status: calls.status,
        type: calls.type,
        duration: calls.duration,
        cost: calls.cost,
        callQuality: calls.callQuality,
      })
      .from(calls)
      .where(eq(calls.tenantId, tenantId));
    
    const totalCalls = allCalls.length;
    
    const completedCalls = allCalls.filter(call => call.status === 'completed').length;
    const missedCalls = allCalls.filter(call => call.status === 'missed').length;
    const inboundCalls = allCalls.filter(call => call.type === 'incoming').length;
    const outboundCalls = allCalls.filter(call => call.type === 'outgoing').length;
    
    const totalDuration = allCalls.reduce((sum, call) => sum + (call.duration || 0), 0);
    const averageDuration = totalCalls > 0 ? totalDuration / totalCalls : 0;
    
    const totalCost = allCalls.reduce((sum, call) => sum + (Number(call.cost) || 0), 0);
    const callSuccessRate = totalCalls > 0 ? (completedCalls / totalCalls) * 100 : 0;
    
    const callsWithQuality = allCalls.filter(call => call.callQuality !== null);
    const averageCallQuality = callsWithQuality.length > 0 ? 
      callsWithQuality.reduce((sum, call) => sum + (call.callQuality || 0), 0) / callsWithQuality.length : 0;
 
    return {
      totalCalls,
      completedCalls,
      missedCalls,
      totalDuration,
      averageDuration,
      totalCost,
      inboundCalls,
      outboundCalls,
      callSuccessRate,
      averageCallQuality
    };
  }

  // Messages (tenant-scoped)
  async getMessage(tenantId: number, userId: number, id: number): Promise<Message | undefined> {
    warnIfTenantScopedParamsInvalid('getMessage', { tenantId, userId, id });
    const [message] = await db.select().from(messages).where(and(eq(messages.id, id), eq(messages.tenantId, tenantId)));
    return message || undefined;
  }

  async getMessageByTwilioSid(tenantId: number, twilioMessageSid: string): Promise<Message | undefined> {
    warnIfTenantScopedParamsInvalid('getMessageByTwilioSid', { tenantId });
    const [message] = await db.select().from(messages).where(
      and(
        sql`${messages.metadata}->>'twilioMessageSid' = ${twilioMessageSid}`,
        eq(messages.tenantId, tenantId)
      )
    );
    return message || undefined;
  }

  async createMessage(tenantId: number, userId: number, insertMessage: InsertMessage): Promise<Message> {
    warnIfTenantScopedParamsInvalid('createMessage', { tenantId, userId });
    const messageData = {
      ...insertMessage,
      userId: userId,
      tenantId: tenantId
    };
    const [message] = await db
      .insert(messages)
      .values(messageData)
      .returning();
    return message;
  }

  async updateMessage(tenantId: number, userId: number, id: number, updateData: Partial<InsertMessage>): Promise<Message> {
    warnIfTenantScopedParamsInvalid('updateMessage', { tenantId, userId, id });
    const [message] = await db
      .update(messages)
      .set(updateData)
      .where(and(eq(messages.id, id), eq(messages.tenantId, tenantId)))
      .returning();
    return message;
  }

  async deleteMessage(tenantId: number, userId: number, id: number): Promise<void> {
    warnIfTenantScopedParamsInvalid('deleteMessage', { tenantId, userId, id });
    await db.delete(messages).where(and(eq(messages.id, id), eq(messages.tenantId, tenantId)));
  }

  async getAllMessages(tenantId: number, userId: number): Promise<Message[]> {
    warnIfTenantScopedParamsInvalid('getAllMessages', { tenantId, userId });
    return await db
      .select({
        id: messages.id,
        tenantId: messages.tenantId,
        userId: messages.userId,
        contactId: messages.contactId,
        phone: messages.phone,
        type: messages.type,
        content: messages.content,
        status: messages.status,
        isRead: messages.isRead,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.tenantId, tenantId))
      .orderBy(desc(messages.createdAt)) as Message[];
  }

  async getMessagesByContact(tenantId: number, userId: number, contactId: number): Promise<Message[]> {
    return await db
      .select()
      .from(messages)
      .where(and(eq(messages.contactId, contactId), eq(messages.tenantId, tenantId)))
      .orderBy(desc(messages.createdAt));
  }

  async getMessagesByPhone(tenantId: number, userId: number, phone: string): Promise<Message[]> {
    return await db
      .select()
      .from(messages)
      .where(and(eq(messages.phone, phone), eq(messages.tenantId, tenantId)))
      .orderBy(desc(messages.createdAt));
  }

  async searchMessages(tenantId: number, userId: number, query: string): Promise<Message[]> {
    return await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.tenantId, tenantId),
          or(
            ilike(messages.content, `%${query}%`),
            ilike(messages.phone, `%${query}%`)
          )
        )
      )
      .orderBy(desc(messages.createdAt));
  }

  async getConversationThread(tenantId: number, userId: number, contactId: number): Promise<ConversationThread | undefined> {
    const [thread] = await db
      .select()
      .from(conversationThreads)
      .where(and(eq(conversationThreads.contactId, contactId), eq(conversationThreads.tenantId, tenantId)));
    return thread || undefined;
  }

  async createConversationThread(tenantId: number, userId: number, thread: InsertConversationThread): Promise<ConversationThread> {
    const threadData = {
      ...thread,
      userId: userId,
      tenantId: tenantId
    };
    const [created] = await db
      .insert(conversationThreads)
      .values(threadData)
      .returning();
    return created;
  }

  async updateConversationThread(tenantId: number, userId: number, threadId: string, thread: Partial<InsertConversationThread>): Promise<ConversationThread> {
    const [updated] = await db
      .update(conversationThreads)
      .set(thread)
      .where(and(eq(conversationThreads.threadId, threadId), eq(conversationThreads.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async markMessageAsRead(tenantId: number, userId: number, id: number): Promise<Message> {
    const [message] = await db
      .update(messages)
      .set({ isRead: true, readAt: new Date() })
      .where(and(eq(messages.id, id), eq(messages.tenantId, tenantId)))
      .returning();
    return message;
  }

  async getUnreadMessageCount(tenantId: number, userId: number): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(messages)
      .where(and(eq(messages.isRead, false), eq(messages.tenantId, tenantId)));
    return result.count;
  }

  async getMessageAnalytics(tenantId: number, userId: number): Promise<any> {
    const [totalMessages] = await db
      .select({ count: count() })
      .from(messages)
      .where(eq(messages.tenantId, tenantId));
    
    const [sentMessages] = await db
      .select({ count: count() })
      .from(messages)
      .where(and(eq(messages.type, 'sent'), eq(messages.tenantId, tenantId)));
    
    const [deliveredMessages] = await db
      .select({ count: count() })
      .from(messages)
      .where(and(eq(messages.status, 'delivered'), eq(messages.tenantId, tenantId)));
    
    return {
      totalMessages: totalMessages.count,
      sentMessages: sentMessages.count,
      deliveredMessages: deliveredMessages.count,
      deliveryRate: totalMessages.count > 0 ? (deliveredMessages.count / totalMessages.count) * 100 : 0
    };
  }

  // SMS Templates (tenant-scoped)
  async getSmsTemplate(tenantId: number, userId: number, id: number): Promise<SmsTemplate | undefined> {
    warnIfTenantScopedParamsInvalid('getSmsTemplate', { tenantId, userId, id });
    const [template] = await db
      .select()
      .from(smsTemplates)
      .where(and(eq(smsTemplates.id, id), eq(smsTemplates.tenantId, tenantId)));
    return template || undefined;
  }

  async createSmsTemplate(tenantId: number, userId: number, template: InsertSmsTemplate): Promise<SmsTemplate> {
    warnIfTenantScopedParamsInvalid('createSmsTemplate', { tenantId, userId });
    const templateData = {
      ...template,
      userId: userId,
      tenantId: tenantId
    };
    const [created] = await db
      .insert(smsTemplates)
      .values(templateData)
      .returning();
    return created;
  }

  async updateSmsTemplate(tenantId: number, userId: number, id: number, template: Partial<InsertSmsTemplate>): Promise<SmsTemplate> {
    warnIfTenantScopedParamsInvalid('updateSmsTemplate', { tenantId, userId, id });
    const [updated] = await db
      .update(smsTemplates)
      .set(template)
      .where(and(eq(smsTemplates.id, id), eq(smsTemplates.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async deleteSmsTemplate(tenantId: number, userId: number, id: number): Promise<void> {
    warnIfTenantScopedParamsInvalid('deleteSmsTemplate', { tenantId, userId, id });
    await db.delete(smsTemplates).where(and(eq(smsTemplates.id, id), eq(smsTemplates.tenantId, tenantId)));
  }

  async getAllSmsTemplates(tenantId: number, userId: number): Promise<SmsTemplate[]> {
    warnIfTenantScopedParamsInvalid('getAllSmsTemplates', { tenantId, userId });
    return await db
      .select()
      .from(smsTemplates)
      .where(and(
        eq(smsTemplates.isActive, true),
        eq(smsTemplates.tenantId, tenantId)
      ))
      .orderBy(asc(smsTemplates.name));
  }

  async getSmsTemplatesByCategory(tenantId: number, userId: number, category: string): Promise<SmsTemplate[]> {
    warnIfTenantScopedParamsInvalid('getSmsTemplatesByCategory', { tenantId, userId });
    return await db
      .select()
      .from(smsTemplates)
      .where(and(
        eq(smsTemplates.category, category),
        eq(smsTemplates.isActive, true),
        eq(smsTemplates.tenantId, tenantId)
      ))
      .orderBy(asc(smsTemplates.name));
  }

  async incrementTemplateUsage(tenantId: number, userId: number, id: number): Promise<void> {
    warnIfTenantScopedParamsInvalid('incrementTemplateUsage', { tenantId, userId, id });
    await db
      .update(smsTemplates)
      .set({ usageCount: sql`${smsTemplates.usageCount} + 1` })
      .where(and(eq(smsTemplates.id, id), eq(smsTemplates.tenantId, tenantId)));
  }

  // SMS Campaigns (tenant-scoped)
  async getSmsCampaign(tenantId: number, userId: number, id: number): Promise<SmsCampaign | undefined> {
    warnIfTenantScopedParamsInvalid('getSmsCampaign', { tenantId, userId, id });
    const [campaign] = await db
      .select()
      .from(smsCampaigns)
      .where(and(eq(smsCampaigns.id, id), eq(smsCampaigns.tenantId, tenantId)));
    return campaign || undefined;
  }

  async createSmsCampaign(tenantId: number, userId: number, campaign: InsertSmsCampaign): Promise<SmsCampaign> {
    warnIfTenantScopedParamsInvalid('createSmsCampaign', { tenantId, userId });
    const campaignData = {
      ...campaign,
      userId: userId,
      tenantId: tenantId
    };
    const [created] = await db
      .insert(smsCampaigns)
      .values(campaignData)
      .returning();
    return created;
  }

  async updateSmsCampaign(tenantId: number, userId: number, id: number, campaign: Partial<InsertSmsCampaign>): Promise<SmsCampaign> {
    warnIfTenantScopedParamsInvalid('updateSmsCampaign', { tenantId, userId, id });
    const [updated] = await db
      .update(smsCampaigns)
      .set(campaign)
      .where(and(eq(smsCampaigns.id, id), eq(smsCampaigns.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async deleteSmsCampaign(tenantId: number, userId: number, id: number): Promise<void> {
    warnIfTenantScopedParamsInvalid('deleteSmsCampaign', { tenantId, userId, id });
    await db.delete(smsCampaigns).where(and(eq(smsCampaigns.id, id), eq(smsCampaigns.tenantId, tenantId)));
  }

  async getAllSmsCampaigns(tenantId: number, userId: number): Promise<SmsCampaign[]> {
    warnIfTenantScopedParamsInvalid('getAllSmsCampaigns', { tenantId, userId });
    return await db
      .select()
      .from(smsCampaigns)
      .where(eq(smsCampaigns.tenantId, tenantId))
      .orderBy(desc(smsCampaigns.createdAt));
  }

  async getCampaignsByStatus(tenantId: number, userId: number, status: string): Promise<SmsCampaign[]> {
    warnIfTenantScopedParamsInvalid('getCampaignsByStatus', { tenantId, userId });
    return await db
      .select()
      .from(smsCampaigns)
      .where(and(eq(smsCampaigns.status, status), eq(smsCampaigns.tenantId, tenantId)))
      .orderBy(desc(smsCampaigns.createdAt));
  }

  async updateCampaignStats(tenantId: number, userId: number, id: number, stats: Partial<SmsCampaign>): Promise<SmsCampaign> {
    warnIfTenantScopedParamsInvalid('updateCampaignStats', { tenantId, userId, id });
    const [updated] = await db
      .update(smsCampaigns)
      .set(stats)
      .where(and(eq(smsCampaigns.id, id), eq(smsCampaigns.tenantId, tenantId)))
      .returning();
    return updated;
  }

  // Advanced Recording Management (tenant-scoped)
  async getRecording(tenantId: number, userId: number, id: number): Promise<Recording | undefined> {
    warnIfTenantScopedParamsInvalid('getRecording', { tenantId, userId, id });
    const [recording] = await db.select().from(recordings).where(and(eq(recordings.id, id), eq(recordings.tenantId, tenantId)));
    return recording || undefined;
  }

  async getRecordingByTwilioSid(tenantId: number, userId: number, twilioSid: string): Promise<Recording | undefined> {
    const [recording] = await db
      .select()
      .from(recordings)
      .where(and(eq(recordings.twilioRecordingSid, twilioSid), eq(recordings.tenantId, tenantId)));
    return recording || undefined;
  }

  async createRecording(tenantId: number, userId: number, insertRecording: InsertRecording): Promise<Recording> {
    warnIfTenantScopedParamsInvalid('createRecording', { tenantId, userId });
    const recordingData = {
      ...insertRecording,
      userId: userId,
      tenantId: tenantId
    };
    const [recording] = await db
      .insert(recordings)
      .values(recordingData)
      .returning();
    return recording;
  }

  async updateRecording(tenantId: number, userId: number, id: number, updateData: Partial<InsertRecording>): Promise<Recording> {
    warnIfTenantScopedParamsInvalid('updateRecording', { tenantId, userId, id });
    const [recording] = await db
      .update(recordings)
      .set({ ...updateData, updatedAt: new Date() })
      .where(and(eq(recordings.id, id), eq(recordings.tenantId, tenantId)))
      .returning();
    return recording;
  }

  async deleteRecording(tenantId: number, userId: number, id: number): Promise<void> {
    warnIfTenantScopedParamsInvalid('deleteRecording', { tenantId, userId, id });
    await db.delete(recordings).where(and(eq(recordings.id, id), eq(recordings.tenantId, tenantId)));
  }

  async getAllRecordings(tenantId: number, userId: number): Promise<Recording[]> {
    warnIfTenantScopedParamsInvalid('getAllRecordings', { tenantId, userId });
    return await db.select().from(recordings).where(eq(recordings.tenantId, tenantId)).orderBy(desc(recordings.createdAt));
  }

  async getRecordings(tenantId: number, userId: number, options: {
    page: number;
    limit: number;
    filters: {
      search?: string;
      status?: string;
      category?: string;
      direction?: string;
      startDate?: Date;
      endDate?: Date;
      hasTranscript?: boolean;
      sentiment?: string;
      starred?: boolean;
      archived?: boolean;
    };
    sortBy: string;
    sortOrder: 'asc' | 'desc';
  }): Promise<{
    recordings: Recording[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page, limit, filters, sortBy, sortOrder } = options;
    const offset = (page - 1) * limit;

    // Build where conditions - always include tenantId
    const whereConditions = [eq(recordings.tenantId, tenantId)];

    if (filters.search) {
      const searchCondition = or(
        ilike(recordings.phone, `%${filters.search}%`),
        ilike(recordings.callerName, `%${filters.search}%`),
        ilike(recordings.transcript, `%${filters.search}%`),
        ilike(recordings.summary, `%${filters.search}%`)
      );
      if (searchCondition) {
        whereConditions.push(searchCondition);
      }
    }

    if (filters.status) {
      whereConditions.push(eq(recordings.status, filters.status));
    }

    if (filters.category) {
      whereConditions.push(eq(recordings.category, filters.category));
    }

    if (filters.direction) {
      whereConditions.push(eq(recordings.direction, filters.direction));
    }

    if (filters.startDate) {
      whereConditions.push(gte(recordings.createdAt, filters.startDate));
    }

    if (filters.endDate) {
      whereConditions.push(lte(recordings.createdAt, filters.endDate));
    }

    if (filters.hasTranscript) {
      whereConditions.push(isNotNull(recordings.transcript));
    }

    if (filters.sentiment) {
      whereConditions.push(eq(recordings.sentiment, filters.sentiment));
    }

    if (filters.starred !== undefined) {
      whereConditions.push(eq(recordings.isStarred, filters.starred));
    }

    if (filters.archived !== undefined) {
      whereConditions.push(eq(recordings.isArchived, filters.archived));
    }

    const whereClause = and(...whereConditions);

    // Build order by - use createdAt as default
    let orderByColumn = recordings.createdAt;
    if (sortBy && sortBy in recordings) {
      orderByColumn = (recordings as any)[sortBy];
    }
    const orderByClause = sortOrder === 'asc' ? asc(orderByColumn) : desc(orderByColumn);

    // Get total count
    const totalResult = await db
      .select({ count: count() })
      .from(recordings)
      .where(whereClause);
    
    const total = totalResult[0]?.count || 0;

    // Get recordings
    const recordingsResult = await db
      .select()
      .from(recordings)
      .where(whereClause)
      .orderBy(orderByClause)
      .limit(limit)
      .offset(offset);

    return {
      recordings: recordingsResult,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async getRecordingsByContact(tenantId: number, userId: number, contactId: number): Promise<Recording[]> {
    return await db
      .select()
      .from(recordings)
      .where(and(eq(recordings.contactId, contactId), eq(recordings.tenantId, tenantId)))
      .orderBy(desc(recordings.createdAt));
  }

  async getRecordingsOlderThan(tenantId: number, userId: number, date: Date): Promise<Recording[]> {
    return await db
      .select()
      .from(recordings)
      .where(and(lt(recordings.createdAt, date), eq(recordings.tenantId, tenantId)))
      .orderBy(desc(recordings.createdAt));
  }

  async getRecordingStats(tenantId: number, userId: number): Promise<{
    total: number;
    totalDuration: number;
    totalSize: number;
    byStatus: Record<string, number>;
    byCategory: Record<string, number>;
    recentActivity: any[];
  }> {
    // Get total count and duration
    const totalStats = await db
      .select({
        count: count(),
        totalDuration: sum(recordings.duration),
        totalSize: sum(recordings.fileSize)
      })
      .from(recordings)
      .where(eq(recordings.tenantId, tenantId));

    const total = totalStats[0]?.count || 0;
    const totalDuration = Number(totalStats[0]?.totalDuration) || 0;
    const totalSize = Number(totalStats[0]?.totalSize) || 0;

    // Get status breakdown
    const statusStats = await db
      .select({
        status: recordings.status,
        count: count()
      })
      .from(recordings)
      .where(eq(recordings.tenantId, tenantId))
      .groupBy(recordings.status);

    const byStatus: Record<string, number> = {};
    statusStats.forEach(stat => {
      if (stat.status) {
        byStatus[stat.status] = stat.count;
      }
    });

    // Get category breakdown
    const categoryStats = await db
      .select({
        category: recordings.category,
        count: count()
      })
      .from(recordings)
      .where(and(isNotNull(recordings.category), eq(recordings.tenantId, tenantId)))
      .groupBy(recordings.category);

    const byCategory: Record<string, number> = {};
    categoryStats.forEach(stat => {
      if (stat.category) {
        byCategory[stat.category] = stat.count;
      }
    });

    // Get recent activity (last 10 recordings)
    const recentActivity = await db
      .select({
        id: recordings.id,
        phone: recordings.phone,
        duration: recordings.duration,
        status: recordings.status,
        createdAt: recordings.createdAt
      })
      .from(recordings)
      .where(eq(recordings.tenantId, tenantId))
      .orderBy(desc(recordings.createdAt))
      .limit(10);

    return {
      total,
      totalDuration,
      totalSize,
      byStatus,
      byCategory,
      recentActivity
    };
  }


  // Voicemails (tenant-scoped)
  async getVoicemail(tenantId: number, userId: number, id: number): Promise<Voicemail | undefined> {
    warnIfTenantScopedParamsInvalid('getVoicemail', { tenantId, userId, id });
    const [voicemail] = await db.select().from(voicemails).where(and(eq(voicemails.id, id), eq(voicemails.tenantId, tenantId)));
    return voicemail || undefined;
  }

  async createVoicemail(tenantId: number, userId: number, insertVoicemail: InsertVoicemail): Promise<Voicemail> {
    warnIfTenantScopedParamsInvalid('createVoicemail', { tenantId, userId });
    const voicemailData = {
      ...insertVoicemail,
      userId: userId,
      tenantId: tenantId
    };
    const [voicemail] = await db
      .insert(voicemails)
      .values(voicemailData)
      .returning();
    return voicemail;
  }

  async updateVoicemail(tenantId: number, userId: number, id: number, updateData: Partial<InsertVoicemail>): Promise<Voicemail> {
    warnIfTenantScopedParamsInvalid('updateVoicemail', { tenantId, userId, id });
    const [voicemail] = await db
      .update(voicemails)
      .set(updateData)
      .where(and(eq(voicemails.id, id), eq(voicemails.tenantId, tenantId)))
      .returning();
    return voicemail;
  }

  async deleteVoicemail(tenantId: number, userId: number, id: number): Promise<void> {
    warnIfTenantScopedParamsInvalid('deleteVoicemail', { tenantId, userId, id });
    await db.delete(voicemails).where(and(eq(voicemails.id, id), eq(voicemails.tenantId, tenantId)));
  }

  async getAllVoicemails(tenantId: number, userId: number): Promise<Voicemail[]> {
    warnIfTenantScopedParamsInvalid('getAllVoicemails', { tenantId, userId });
    return await db.select().from(voicemails).where(eq(voicemails.tenantId, tenantId)).orderBy(desc(voicemails.createdAt));
  }

  async getVoicemailsByContact(tenantId: number, userId: number, contactId: number): Promise<Voicemail[]> {
    warnIfTenantScopedParamsInvalid('getVoicemailsByContact', { tenantId, userId, contactId });
    return await db
      .select()
      .from(voicemails)
      .where(and(eq(voicemails.contactId, contactId), eq(voicemails.tenantId, tenantId)))
      .orderBy(desc(voicemails.createdAt));
  }

  async getUnreadVoicemails(tenantId: number, userId: number): Promise<Voicemail[]> {
    warnIfTenantScopedParamsInvalid('getUnreadVoicemails', { tenantId, userId });
    return await db
      .select()
      .from(voicemails)
      .where(and(eq(voicemails.isRead, false), eq(voicemails.tenantId, tenantId)))
      .orderBy(desc(voicemails.createdAt));
  }

  // Settings (tenant-scoped)
  async getSetting(tenantId: number, key: string): Promise<Setting | undefined> {
    warnIfTenantScopedParamsInvalid('getSetting', { tenantId });
    const [setting] = await db.select().from(settings).where(
      and(
        eq(settings.key, key),
        eq(settings.tenantId, tenantId)
      )
    );
    return setting || undefined;
  }

  async setSetting(tenantId: number, key: string, value: any): Promise<Setting> {
    warnIfTenantScopedParamsInvalid('setSetting', { tenantId });
    const [setting] = await db
      .insert(settings)
      .values({ key, value, tenantId })
      .onConflictDoUpdate({
        target: [settings.key, settings.tenantId],
        set: { value, updatedAt: new Date() }
      })
      .returning();
    return setting;
  }

  async getAllSettings(tenantId: number): Promise<Setting[]> {
    warnIfTenantScopedParamsInvalid('getAllSettings', { tenantId });
    return await db
      .select()
      .from(settings)
      .where(eq(settings.tenantId, tenantId))
      .orderBy(asc(settings.key));
  }

  // Call Notes (tenant-scoped)
  async getCallNote(tenantId: number, userId: number, id: number): Promise<CallNote | undefined> {
    warnIfTenantScopedParamsInvalid('getCallNote', { tenantId, userId, id });
    const [note] = await db.select().from(callNotes).where(
      and(
        eq(callNotes.id, id),
        eq(callNotes.tenantId, tenantId)
      )
    );
    return note || undefined;
  }

  async createCallNote(tenantId: number, userId: number, insertNote: InsertCallNote): Promise<CallNote> {
    warnIfTenantScopedParamsInvalid('createCallNote', { tenantId, userId });
    // Normalize phone number
    const normalized = normalizePhoneNumber(insertNote.phone);
    const normalizedPhone = normalized.isValid ? normalized.normalized : insertNote.phone;
    
    // Smart contact linking - try to find the contact using smart phone matching
    let contactIdToUse = insertNote.contactId;
    if (!contactIdToUse) {
      const existingContact = await this.findContactByAnyPhoneFormat(tenantId, userId, insertNote.phone);
      if (existingContact) {
        contactIdToUse = existingContact.id;
      }
    }
    
    const noteData = {
      ...insertNote,
      userId: userId,
      tenantId: tenantId,
      phone: normalizedPhone,
      contactId: contactIdToUse
    };
    
    const [note] = await db
      .insert(callNotes)
      .values(noteData)
      .returning();
    return note;
  }

  async updateCallNote(tenantId: number, userId: number, id: number, updateData: Partial<InsertCallNote>): Promise<CallNote> {
    warnIfTenantScopedParamsInvalid('updateCallNote', { tenantId, userId, id });
    const [note] = await db
      .update(callNotes)
      .set({ ...updateData, updatedAt: new Date() })
      .where(and(eq(callNotes.id, id), eq(callNotes.tenantId, tenantId)))
      .returning();
    return note;
  }

  async deleteCallNote(tenantId: number, userId: number, id: number): Promise<void> {
    warnIfTenantScopedParamsInvalid('deleteCallNote', { tenantId, userId, id });
    await db.delete(callNotes).where(and(eq(callNotes.id, id), eq(callNotes.tenantId, tenantId)));
  }

  async getAllCallNotes(tenantId: number, userId: number): Promise<CallNote[]> {
    warnIfTenantScopedParamsInvalid('getAllCallNotes', { tenantId, userId });
    return await db.select().from(callNotes).where(eq(callNotes.tenantId, tenantId)).orderBy(desc(callNotes.createdAt));
  }

  async getCallNotesByCall(tenantId: number, userId: number, callId: number): Promise<CallNote[]> {
    warnIfTenantScopedParamsInvalid('getCallNotesByCall', { tenantId, userId, callId });
    return await db
      .select()
      .from(callNotes)
      .where(and(eq(callNotes.callId, callId), eq(callNotes.tenantId, tenantId)))
      .orderBy(desc(callNotes.createdAt));
  }

  async getCallNotesByContact(tenantId: number, userId: number, contactId: number): Promise<CallNote[]> {
    warnIfTenantScopedParamsInvalid('getCallNotesByContact', { tenantId, userId, contactId });
    return await db
      .select()
      .from(callNotes)
      .where(and(eq(callNotes.contactId, contactId), eq(callNotes.tenantId, tenantId)))
      .orderBy(desc(callNotes.createdAt));
  }

  async getCallNotesByPhone(tenantId: number, userId: number, phone: string): Promise<CallNote[]> {
    warnIfTenantScopedParamsInvalid('getCallNotesByPhone', { tenantId, userId });
    return await db
      .select()
      .from(callNotes)
      .where(and(eq(callNotes.phone, phone), eq(callNotes.tenantId, tenantId)))
      .orderBy(desc(callNotes.createdAt));
  }

  // Lead Sources (tenant-scoped)
  async getLeadSource(tenantId: number, userId: number, id: number): Promise<LeadSource | undefined> {
    warnIfTenantScopedParamsInvalid('getLeadSource', { tenantId, userId, id });
    const [source] = await db.select().from(leadSources).where(and(eq(leadSources.id, id), eq(leadSources.tenantId, tenantId)));
    return source || undefined;
  }

  async getLeadSourceByName(tenantId: number, name: string): Promise<LeadSource | undefined> {
    const [source] = await db.select().from(leadSources).where(and(eq(leadSources.name, name), eq(leadSources.tenantId, tenantId)));
    return source || undefined;
  }

  async createLeadSource(tenantId: number, source: InsertLeadSource): Promise<LeadSource> {
    const sourceData = { ...source, tenantId };
    const [created] = await db.insert(leadSources).values(sourceData).returning();
    return created;
  }

  async updateLeadSource(tenantId: number, id: number, source: Partial<InsertLeadSource>): Promise<LeadSource> {
    const [updated] = await db.update(leadSources).set(source).where(and(eq(leadSources.id, id), eq(leadSources.tenantId, tenantId))).returning();
    return updated;
  }

  async deleteLeadSource(tenantId: number, id: number): Promise<void> {
    await db.delete(leadSources).where(and(eq(leadSources.id, id), eq(leadSources.tenantId, tenantId)));
  }

  async getAllLeadSources(tenantId: number): Promise<LeadSource[]> {
    return await db.select().from(leadSources).where(eq(leadSources.tenantId, tenantId)).orderBy(asc(leadSources.name));
  }

  async getActiveLeadSources(tenantId: number): Promise<LeadSource[]> {
    return await db.select().from(leadSources).where(and(eq(leadSources.isActive, true), eq(leadSources.tenantId, tenantId))).orderBy(asc(leadSources.name));
  }

  // Lead Statuses (tenant-scoped)
  async getLeadStatus(tenantId: number, id: number): Promise<LeadStatus | undefined> {
    const [status] = await db.select().from(leadStatuses).where(and(eq(leadStatuses.id, id), eq(leadStatuses.tenantId, tenantId)));
    return status || undefined;
  }

  async getLeadStatusByName(tenantId: number, name: string): Promise<LeadStatus | undefined> {
    const [status] = await db.select().from(leadStatuses).where(and(eq(leadStatuses.name, name), eq(leadStatuses.tenantId, tenantId)));
    return status || undefined;
  }

  async createLeadStatus(tenantId: number, status: InsertLeadStatus): Promise<LeadStatus> {
    const statusData = { ...status, tenantId };
    const [created] = await db.insert(leadStatuses).values(statusData).returning();
    return created;
  }

  async updateLeadStatus(tenantId: number, userId: number, id: number, status: Partial<InsertLeadStatus>): Promise<LeadStatus> {
    warnIfTenantScopedParamsInvalid('updateLeadStatus', { tenantId, userId, id });
    const [updated] = await db.update(leadStatuses).set(status).where(and(eq(leadStatuses.id, id), eq(leadStatuses.tenantId, tenantId))).returning();
    return updated;
  }

  async deleteLeadStatus(tenantId: number, userId: number, id: number): Promise<void> {
    warnIfTenantScopedParamsInvalid('deleteLeadStatus', { tenantId, userId, id });
    await db.delete(leadStatuses).where(and(eq(leadStatuses.id, id), eq(leadStatuses.tenantId, tenantId)));
  }

  async getAllLeadStatuses(tenantId: number, userId: number): Promise<LeadStatus[]> {
    warnIfTenantScopedParamsInvalid('getAllLeadStatuses', { tenantId, userId });
    return await db.select().from(leadStatuses).where(eq(leadStatuses.tenantId, tenantId)).orderBy(asc(leadStatuses.sortOrder));
  }

  async getActiveLeadStatuses(tenantId: number, userId: number): Promise<LeadStatus[]> {
    warnIfTenantScopedParamsInvalid('getActiveLeadStatuses', { tenantId, userId });
    return await db.select().from(leadStatuses).where(and(eq(leadStatuses.isActive, true), eq(leadStatuses.tenantId, tenantId))).orderBy(asc(leadStatuses.sortOrder));
  }

  // Lead Campaigns (tenant-scoped)
  async getLeadCampaign(tenantId: number, userId: number, id: number): Promise<LeadCampaign | undefined> {
    warnIfTenantScopedParamsInvalid('getLeadCampaign', { tenantId, userId, id });
    const [campaign] = await db.select().from(leadCampaigns).where(and(eq(leadCampaigns.id, id), eq(leadCampaigns.tenantId, tenantId)));
    return campaign || undefined;
  }

  async createLeadCampaign(tenantId: number, userId: number, campaign: InsertLeadCampaign): Promise<LeadCampaign> {
    warnIfTenantScopedParamsInvalid('createLeadCampaign', { tenantId, userId });
    const campaignData = { ...campaign, userId, tenantId };
    const [created] = await db.insert(leadCampaigns).values(campaignData).returning();
    return created;
  }

  async updateLeadCampaign(tenantId: number, userId: number, id: number, campaign: Partial<InsertLeadCampaign>): Promise<LeadCampaign> {
    warnIfTenantScopedParamsInvalid('updateLeadCampaign', { tenantId, userId, id });
    const [updated] = await db.update(leadCampaigns).set(campaign).where(and(eq(leadCampaigns.id, id), eq(leadCampaigns.tenantId, tenantId))).returning();
    return updated;
  }

  async deleteLeadCampaign(tenantId: number, userId: number, id: number): Promise<void> {
    warnIfTenantScopedParamsInvalid('deleteLeadCampaign', { tenantId, userId, id });
    await db.delete(leadCampaigns).where(and(eq(leadCampaigns.id, id), eq(leadCampaigns.tenantId, tenantId)));
  }

  async getAllLeadCampaigns(tenantId: number, userId: number): Promise<LeadCampaign[]> {
    warnIfTenantScopedParamsInvalid('getAllLeadCampaigns', { tenantId, userId });
    return await db.select().from(leadCampaigns).where(eq(leadCampaigns.tenantId, tenantId)).orderBy(desc(leadCampaigns.createdAt));
  }

  async getLeadCampaignsByStatus(tenantId: number, userId: number, status: string): Promise<LeadCampaign[]> {
    warnIfTenantScopedParamsInvalid('getLeadCampaignsByStatus', { tenantId, userId });
    return await db.select().from(leadCampaigns).where(and(eq(leadCampaigns.status, status), eq(leadCampaigns.tenantId, tenantId))).orderBy(desc(leadCampaigns.createdAt));
  }

  async getLeadCampaignsByType(tenantId: number, userId: number, type: string): Promise<LeadCampaign[]> {
    warnIfTenantScopedParamsInvalid('getLeadCampaignsByType', { tenantId, userId });
    return await db.select().from(leadCampaigns).where(and(eq(leadCampaigns.type, type), eq(leadCampaigns.tenantId, tenantId))).orderBy(desc(leadCampaigns.createdAt));
  }

  // Leads (tenant-scoped)
  async getLead(tenantId: number, userId: number, id: number): Promise<Lead | undefined> {
    warnIfTenantScopedParamsInvalid('getLead', { tenantId, userId, id });
    const [lead] = await db.select().from(leads).where(and(eq(leads.id, id), eq(leads.tenantId, tenantId)));
    return lead || undefined;
  }

  async getLeadByEmail(tenantId: number, userId: number, email: string): Promise<Lead | undefined> {
    warnIfTenantScopedParamsInvalid('getLeadByEmail', { tenantId, userId });
    const [lead] = await db.select().from(leads).where(and(eq(leads.email, email), eq(leads.tenantId, tenantId)));
    return lead || undefined;
  }

  async getLeadByPhone(tenantId: number, userId: number, phone: string): Promise<Lead | undefined> {
    warnIfTenantScopedParamsInvalid('getLeadByPhone', { tenantId, userId });
    const [lead] = await db.select().from(leads).where(and(eq(leads.phone, phone), eq(leads.tenantId, tenantId)));
    return lead || undefined;
  }

  async createLead(tenantId: number, userId: number, lead: InsertLead): Promise<Lead> {
    warnIfTenantScopedParamsInvalid('createLead', { tenantId, userId });
    const leadData = {
      ...lead,
      userId: userId,
      tenantId: tenantId,
    };
    const [created] = await db.insert(leads).values(leadData).returning();
    return created;
  }

  async updateLead(tenantId: number, userId: number, id: number, lead: Partial<InsertLead>): Promise<Lead> {
    warnIfTenantScopedParamsInvalid('updateLead', { tenantId, userId, id });
    const [updated] = await db.update(leads)
      .set({ ...lead, updatedAt: new Date() })
      .where(and(eq(leads.id, id), eq(leads.tenantId, tenantId)))
      .returning();
    if (!updated) throw new Error("Lead not found");
    return updated;
  }

  async deleteLead(tenantId: number, userId: number, id: number): Promise<void> {
    warnIfTenantScopedParamsInvalid('deleteLead', { tenantId, userId, id });
    await db.delete(leads).where(and(eq(leads.id, id), eq(leads.tenantId, tenantId)));
  }

  async getAllLeads(tenantId: number, userId: number): Promise<Lead[]> {
    warnIfTenantScopedParamsInvalid('getAllLeads', { tenantId, userId });
    return await db
      .select()
      .from(leads)
      .where(eq(leads.tenantId, tenantId))
      .orderBy(desc(leads.createdAt));
  }

  async getLeadsByStatus(tenantId: number, userId: number, statusId: number): Promise<Lead[]> {
    warnIfTenantScopedParamsInvalid('getLeadsByStatus', { tenantId, userId, statusId });
    return await db.select().from(leads).where(and(eq(leads.leadStatusId, statusId), eq(leads.tenantId, tenantId))).orderBy(desc(leads.createdAt));
  }

  async getLeadsBySource(tenantId: number, userId: number, sourceId: number): Promise<Lead[]> {
    warnIfTenantScopedParamsInvalid('getLeadsBySource', { tenantId, userId, sourceId });
    return await db.select().from(leads).where(and(eq(leads.leadSourceId, sourceId), eq(leads.tenantId, tenantId))).orderBy(desc(leads.createdAt));
  }

  async getLeadsByAssignee(tenantId: number, userId: number, assigneeId: number): Promise<Lead[]> {
    warnIfTenantScopedParamsInvalid('getLeadsByAssignee', { tenantId, userId, assigneeId });
    return await db.select().from(leads).where(and(eq(leads.assignedTo, assigneeId), eq(leads.tenantId, tenantId))).orderBy(desc(leads.createdAt));
  }

  async getLeadsByPriority(tenantId: number, userId: number, priority: string): Promise<Lead[]> {
    warnIfTenantScopedParamsInvalid('getLeadsByPriority', { tenantId, userId });
    return await db.select().from(leads).where(and(eq(leads.priority, priority), eq(leads.tenantId, tenantId))).orderBy(desc(leads.createdAt));
  }

  async getLeadsByTemperature(tenantId: number, userId: number, temperature: string): Promise<Lead[]> {
    warnIfTenantScopedParamsInvalid('getLeadsByTemperature', { tenantId, userId });
    return await db.select().from(leads).where(and(eq(leads.temperature, temperature), eq(leads.tenantId, tenantId))).orderBy(desc(leads.createdAt));
  }

  async searchLeads(tenantId: number, userId: number, query: string): Promise<Lead[]> {
    warnIfTenantScopedParamsInvalid('searchLeads', { tenantId, userId });
    return await db.select().from(leads).where(
      and(
        eq(leads.tenantId, tenantId),
        or(
          ilike(leads.firstName, `%${query}%`),
          ilike(leads.lastName, `%${query}%`),
          ilike(leads.email, `%${query}%`),
          ilike(leads.phone, `%${query}%`),
          ilike(leads.company, `%${query}%`)
        )
      )
    ).orderBy(desc(leads.createdAt));
  }

  async getLeadsWithFilters(tenantId: number, userId: number, filters: any): Promise<Lead[]> {
    warnIfTenantScopedParamsInvalid('getLeadsWithFilters', { tenantId, userId });
    const conditions = [eq(leads.tenantId, tenantId)];
    if (filters.status) conditions.push(eq(leads.leadStatusId, filters.status));
    if (filters.source) conditions.push(eq(leads.leadSourceId, filters.source));
    if (filters.assignee) conditions.push(eq(leads.assignedTo, filters.assignee));
    if (filters.priority) conditions.push(eq(leads.priority, filters.priority));
    return await db.select().from(leads).where(and(...conditions)).orderBy(desc(leads.createdAt));
  }

  async getLeadStats(tenantId: number, userId: number): Promise<any> {
    warnIfTenantScopedParamsInvalid('getLeadStats', { tenantId, userId });
    const allLeads = await this.getAllLeads(tenantId, userId);
    return {
      total: allLeads.length,
      new: allLeads.filter(l => l.temperature === 'cold').length,
      qualified: allLeads.filter(l => l.isQualified).length,
      converted: allLeads.filter(l => l.isConverted).length,
      totalValue: allLeads.reduce((sum, l) => sum + parseFloat(l.estimatedValue || '0'), 0),
      avgScore: allLeads.length > 0 ? allLeads.reduce((sum, l) => sum + (l.leadScore || 0), 0) / allLeads.length : 0,
      conversionRate: allLeads.length > 0 ? (allLeads.filter(l => l.isConverted).length / allLeads.length) * 100 : 0,
      byStatus: {},
      bySource: {},
      byAssignee: {}
    };
  }

  // Initialize default data (admin user and sample data)
  async initializeDefaultData(): Promise<void> {
    try {
      // Check if admin user already exists
      const adminUser = await this.getUserByEmail('admin@demonflare.com');
      
      if (!adminUser) {
        // Create admin user with password from environment variable
        if (!process.env.ADMIN_PASSWORD) {
          throw new Error('ADMIN_PASSWORD environment variable must be set for security. Please set ADMIN_PASSWORD before starting the application.');
        }
        
        await this.createUser({
          username: 'admin',
          email: 'admin@demonflare.com',
          password: process.env.ADMIN_PASSWORD,
          firstName: 'Admin',
          lastName: 'User',
          role: 'admin',
          status: 'active',
          emailVerified: true,
          gdprConsent: true,
          gdprConsentDate: new Date(),
        });
        console.log('✓ Admin user created successfully');
      }

      // Resolve tenant for the admin user
      const admin = await this.getUserByEmail('admin@demonflare.com');
      if (admin) {
          
      }

      // Mark that sample data initialization has been checked
      await this.setSetting(1, 'sample_data_initialized', true); // Use tenant 1 for system setting
      console.log('✓ Sample data initialization skipped (multi-tenant mode)');

      // Initialize default system and twilio settings to prevent 404 errors
      const systemSetting = await this.getSetting(1, 'system');
      if (!systemSetting) {
        await this.setSetting(1, 'system', {
          appName: 'DialPax CRM',
          timezone: 'America/New_York',
          dateFormat: 'MM/DD/YYYY',
          currency: 'USD',
          autoSave: true,
          theme: 'light'
        });
        console.log('✓ Default system settings created');
      }

      const twilioSetting = await this.getSetting(1, 'twilio');
      if (!twilioSetting) {
        await this.setSetting(1, 'twilio', {
          configured: false,
          accountSid: null,
          authToken: null,
          phoneNumber: null,
          apiKeySid: null,
          apiKeySecret: null,
          twimlAppSid: null
        });
        console.log('✓ Default twilio settings created');
      }

    } catch (error) {
      console.error('Error initializing default data:', error);
    }
  }

  // Lead Activities (tenant-scoped)
  async getLeadActivity(tenantId: number, userId: number, id: number): Promise<LeadActivity | undefined> {
    warnIfTenantScopedParamsInvalid('getLeadActivity', { tenantId, userId, id });
    const result = await db
      .select({ activity: leadActivities })
      .from(leadActivities)
      .innerJoin(leads, eq(leadActivities.leadId, leads.id))
      .where(and(eq(leadActivities.id, id), eq(leads.tenantId, tenantId)));
    return result[0]?.activity || undefined;
  }

  async createLeadActivity(tenantId: number, userId: number, activity: InsertLeadActivity): Promise<LeadActivity> {
    warnIfTenantScopedParamsInvalid('createLeadActivity', { tenantId, userId });
    const activityData = {
      ...activity,
      userId: userId
    };
    const [created] = await db.insert(leadActivities).values(activityData).returning();
    return created;
  }

  async updateLeadActivity(tenantId: number, userId: number, id: number, activity: Partial<InsertLeadActivity>): Promise<LeadActivity> {
    warnIfTenantScopedParamsInvalid('updateLeadActivity', { tenantId, userId, id });
    const checkResult = await db
      .select({ activity: leadActivities })
      .from(leadActivities)
      .innerJoin(leads, eq(leadActivities.leadId, leads.id))
      .where(and(eq(leadActivities.id, id), eq(leads.tenantId, tenantId)));
    
    if (!checkResult[0]) {
      throw new Error('Lead activity not found');
    }

    const [updated] = await db.update(leadActivities).set(activity).where(eq(leadActivities.id, id)).returning();
    return updated;
  }

  async deleteLeadActivity(tenantId: number, userId: number, id: number): Promise<void> {
    warnIfTenantScopedParamsInvalid('deleteLeadActivity', { tenantId, userId, id });
    const checkResult = await db
      .select({ activity: leadActivities })
      .from(leadActivities)
      .innerJoin(leads, eq(leadActivities.leadId, leads.id))
      .where(and(eq(leadActivities.id, id), eq(leads.tenantId, tenantId)));
    
    if (checkResult[0]) {
      await db.delete(leadActivities).where(eq(leadActivities.id, id));
    }
  }

  async getLeadActivities(tenantId: number, userId: number, leadId: number): Promise<LeadActivity[]> {
    warnIfTenantScopedParamsInvalid('getLeadActivities', { tenantId, userId, leadId });
    const result = await db
      .select({ activity: leadActivities })
      .from(leadActivities)
      .innerJoin(leads, eq(leadActivities.leadId, leads.id))
      .where(and(eq(leadActivities.leadId, leadId), eq(leads.tenantId, tenantId)))
      .orderBy(desc(leadActivities.createdAt));
    return result.map(r => r.activity);
  }

  async getLeadActivitiesByType(tenantId: number, userId: number, leadId: number, type: string): Promise<LeadActivity[]> {
    warnIfTenantScopedParamsInvalid('getLeadActivitiesByType', { tenantId, userId, leadId });
    const result = await db
      .select({ activity: leadActivities })
      .from(leadActivities)
      .innerJoin(leads, eq(leadActivities.leadId, leads.id))
      .where(and(eq(leadActivities.leadId, leadId), eq(leadActivities.type, type), eq(leads.tenantId, tenantId)))
      .orderBy(desc(leadActivities.createdAt));
    return result.map(r => r.activity);
  }

  async getLeadActivitiesByUser(tenantId: number, userId: number, targetUserId: number): Promise<LeadActivity[]> {
    warnIfTenantScopedParamsInvalid('getLeadActivitiesByUser', { tenantId, userId, targetUserId });
    const result = await db
      .select({ activity: leadActivities })
      .from(leadActivities)
      .innerJoin(leads, eq(leadActivities.leadId, leads.id))
      .where(and(eq(leadActivities.userId, targetUserId), eq(leads.tenantId, tenantId)))
      .orderBy(desc(leadActivities.createdAt));
    return result.map(r => r.activity);
  }

  async getRecentLeadActivities(tenantId: number, userId: number, limit: number = 50): Promise<LeadActivity[]> {
    warnIfTenantScopedParamsInvalid('getRecentLeadActivities', { tenantId, userId });
    const result = await db
      .select({ activity: leadActivities })
      .from(leadActivities)
      .innerJoin(leads, eq(leadActivities.leadId, leads.id))
      .where(eq(leads.tenantId, tenantId))
      .orderBy(desc(leadActivities.createdAt))
      .limit(limit);
    return result.map(r => r.activity);
  }

  // Lead Tasks (tenant-scoped)
  async getLeadTask(tenantId: number, userId: number, id: number): Promise<LeadTask | undefined> {
    warnIfTenantScopedParamsInvalid('getLeadTask', { tenantId, userId, id });
    const result = await db
      .select({ task: leadTasks })
      .from(leadTasks)
      .innerJoin(leads, eq(leadTasks.leadId, leads.id))
      .where(and(eq(leadTasks.id, id), eq(leads.tenantId, tenantId)));
    return result[0]?.task || undefined;
  }

  async createLeadTask(tenantId: number, userId: number, task: InsertLeadTask): Promise<LeadTask> {
    warnIfTenantScopedParamsInvalid('createLeadTask', { tenantId, userId });
    const [created] = await db.insert(leadTasks).values(task).returning();
    return created;
  }

  async updateLeadTask(tenantId: number, userId: number, id: number, task: Partial<InsertLeadTask>): Promise<LeadTask> {
    warnIfTenantScopedParamsInvalid('updateLeadTask', { tenantId, userId, id });
    const result = await db
      .select({ task: leadTasks })
      .from(leadTasks)
      .innerJoin(leads, eq(leadTasks.leadId, leads.id))
      .where(and(eq(leadTasks.id, id), eq(leads.tenantId, tenantId)));
    
    if (!result[0]) {
      throw new Error('Task not found');
    }
    
    const [updated] = await db.update(leadTasks).set(task).where(eq(leadTasks.id, id)).returning();
    return updated;
  }

  async deleteLeadTask(tenantId: number, userId: number, id: number): Promise<void> {
    warnIfTenantScopedParamsInvalid('deleteLeadTask', { tenantId, userId, id });
    const result = await db
      .select({ task: leadTasks })
      .from(leadTasks)
      .innerJoin(leads, eq(leadTasks.leadId, leads.id))
      .where(and(eq(leadTasks.id, id), eq(leads.tenantId, tenantId)));
    
    if (result[0]) {
      await db.delete(leadTasks).where(eq(leadTasks.id, id));
    }
  }

  async getLeadTasks(tenantId: number, userId: number, leadId: number): Promise<LeadTask[]> {
    warnIfTenantScopedParamsInvalid('getLeadTasks', { tenantId, userId, leadId });
    const result = await db
      .select({ task: leadTasks })
      .from(leadTasks)
      .innerJoin(leads, eq(leadTasks.leadId, leads.id))
      .where(and(eq(leadTasks.leadId, leadId), eq(leads.tenantId, tenantId)))
      .orderBy(desc(leadTasks.createdAt));
    return result.map(r => r.task);
  }

  async getLeadTasksByAssignee(tenantId: number, userId: number, assigneeId: number): Promise<LeadTask[]> {
    warnIfTenantScopedParamsInvalid('getLeadTasksByAssignee', { tenantId, userId, assigneeId });
    const result = await db
      .select({ task: leadTasks })
      .from(leadTasks)
      .innerJoin(leads, eq(leadTasks.leadId, leads.id))
      .where(and(eq(leadTasks.assignedTo, assigneeId), eq(leads.tenantId, tenantId)))
      .orderBy(desc(leadTasks.createdAt));
    return result.map(r => r.task);
  }

  async getLeadTasksByStatus(tenantId: number, userId: number, status: string): Promise<LeadTask[]> {
    warnIfTenantScopedParamsInvalid('getLeadTasksByStatus', { tenantId, userId });
    const result = await db
      .select({ task: leadTasks })
      .from(leadTasks)
      .innerJoin(leads, eq(leadTasks.leadId, leads.id))
      .where(and(eq(leadTasks.status, status), eq(leads.tenantId, tenantId)))
      .orderBy(desc(leadTasks.createdAt));
    return result.map(r => r.task);
  }

  async getOverdueTasks(tenantId: number, userId: number): Promise<LeadTask[]> {
    warnIfTenantScopedParamsInvalid('getOverdueTasks', { tenantId, userId });
    const result = await db
      .select({ task: leadTasks })
      .from(leadTasks)
      .innerJoin(leads, eq(leadTasks.leadId, leads.id))
      .where(
        and(
          eq(leadTasks.status, 'pending'),
          lt(leadTasks.dueDate, new Date()),
          eq(leads.tenantId, tenantId)
        )
      )
      .orderBy(asc(leadTasks.dueDate));
    return result.map(r => r.task);
  }

  async getUpcomingTasks(tenantId: number, userId: number, days: number = 7): Promise<LeadTask[]> {
    warnIfTenantScopedParamsInvalid('getUpcomingTasks', { tenantId, userId });
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    
    const result = await db
      .select({ task: leadTasks })
      .from(leadTasks)
      .innerJoin(leads, eq(leadTasks.leadId, leads.id))
      .where(
        and(
          eq(leadTasks.status, 'pending'),
          gte(leadTasks.dueDate, new Date()),
          lte(leadTasks.dueDate, futureDate),
          eq(leads.tenantId, tenantId)
        )
      )
      .orderBy(asc(leadTasks.dueDate));
    return result.map(r => r.task);
  }

  // Lead Scoring (tenant-scoped)
  async getLeadScoring(tenantId: number, userId: number, id: number): Promise<LeadScoring | undefined> {
    warnIfTenantScopedParamsInvalid('getLeadScoring', { tenantId, userId, id });
    const result = await db
      .select({ scoring: leadScoring })
      .from(leadScoring)
      .innerJoin(leads, eq(leadScoring.leadId, leads.id))
      .where(and(eq(leadScoring.id, id), eq(leads.tenantId, tenantId)));
    return result[0]?.scoring || undefined;
  }

  async getLeadScoringByLead(tenantId: number, userId: number, leadId: number): Promise<LeadScoring[]> {
    warnIfTenantScopedParamsInvalid('getLeadScoringByLead', { tenantId, userId, leadId });
    const result = await db
      .select({ scoring: leadScoring })
      .from(leadScoring)
      .innerJoin(leads, eq(leadScoring.leadId, leads.id))
      .where(and(eq(leadScoring.leadId, leadId), eq(leads.tenantId, tenantId)))
      .orderBy(desc(leadScoring.createdAt));
    return result.map(r => r.scoring);
  }

  async createLeadScoring(tenantId: number, userId: number, scoring: InsertLeadScoring): Promise<LeadScoring> {
    warnIfTenantScopedParamsInvalid('createLeadScoring', { tenantId, userId });
    const scoringData = {
      ...scoring,
      userId: userId
    };
    const [created] = await db.insert(leadScoring).values(scoringData).returning();
    return created;
  }

  async updateLeadScoring(tenantId: number, userId: number, id: number, scoring: Partial<InsertLeadScoring>): Promise<LeadScoring> {
    warnIfTenantScopedParamsInvalid('updateLeadScoring', { tenantId, userId, id });
    const checkResult = await db
      .select({ scoring: leadScoring })
      .from(leadScoring)
      .innerJoin(leads, eq(leadScoring.leadId, leads.id))
      .where(and(eq(leadScoring.id, id), eq(leads.tenantId, tenantId)));
    
    if (!checkResult[0]) {
      throw new Error('Lead scoring record not found');
    }

    const [updated] = await db.update(leadScoring).set(scoring).where(eq(leadScoring.id, id)).returning();
    return updated;
  }

  async deleteLeadScoring(tenantId: number, userId: number, id: number): Promise<void> {
    warnIfTenantScopedParamsInvalid('deleteLeadScoring', { tenantId, userId, id });
    const checkResult = await db
      .select({ scoring: leadScoring })
      .from(leadScoring)
      .innerJoin(leads, eq(leadScoring.leadId, leads.id))
      .where(and(eq(leadScoring.id, id), eq(leads.tenantId, tenantId)));
    
    if (checkResult[0]) {
      await db.delete(leadScoring).where(eq(leadScoring.id, id));
    }
  }

  async getLeadScoringHistory(tenantId: number, userId: number, leadId: number): Promise<LeadScoring[]> {
    warnIfTenantScopedParamsInvalid('getLeadScoringHistory', { tenantId, userId, leadId });
    const result = await db
      .select({ scoring: leadScoring })
      .from(leadScoring)
      .innerJoin(leads, eq(leadScoring.leadId, leads.id))
      .where(and(eq(leadScoring.leadId, leadId), eq(leads.tenantId, tenantId)))
      .orderBy(desc(leadScoring.createdAt));
    return result.map(r => r.scoring);
  }

  // Lead Nurturing (tenant-scoped)
  async getLeadNurturing(tenantId: number, userId: number, id: number): Promise<LeadNurturing | undefined> {
    warnIfTenantScopedParamsInvalid('getLeadNurturing', { tenantId, userId, id });
    const result = await db
      .select({ nurturing: leadNurturing })
      .from(leadNurturing)
      .innerJoin(leads, eq(leadNurturing.leadId, leads.id))
      .where(and(eq(leadNurturing.id, id), eq(leads.tenantId, tenantId)));
    return result[0]?.nurturing || undefined;
  }

  async getLeadNurturingByLead(tenantId: number, userId: number, leadId: number): Promise<LeadNurturing[]> {
    warnIfTenantScopedParamsInvalid('getLeadNurturingByLead', { tenantId, userId, leadId });
    const result = await db
      .select({ nurturing: leadNurturing })
      .from(leadNurturing)
      .innerJoin(leads, eq(leadNurturing.leadId, leads.id))
      .where(and(eq(leadNurturing.leadId, leadId), eq(leads.tenantId, tenantId)))
      .orderBy(desc(leadNurturing.createdAt));
    return result.map(r => r.nurturing);
  }

  async createLeadNurturing(tenantId: number, userId: number, nurturing: InsertLeadNurturing): Promise<LeadNurturing> {
    warnIfTenantScopedParamsInvalid('createLeadNurturing', { tenantId, userId });
    const nurturingData = {
      ...nurturing,
      userId: userId
    };
    const [created] = await db.insert(leadNurturing).values(nurturingData).returning();
    return created;
  }

  async updateLeadNurturing(tenantId: number, userId: number, id: number, nurturing: Partial<InsertLeadNurturing>): Promise<LeadNurturing> {
    warnIfTenantScopedParamsInvalid('updateLeadNurturing', { tenantId, userId, id });
    const checkResult = await db
      .select({ nurturing: leadNurturing })
      .from(leadNurturing)
      .innerJoin(leads, eq(leadNurturing.leadId, leads.id))
      .where(and(eq(leadNurturing.id, id), eq(leads.tenantId, tenantId)));
    
    if (!checkResult[0]) {
      throw new Error('Lead nurturing record not found');
    }

    const [updated] = await db.update(leadNurturing).set(nurturing).where(eq(leadNurturing.id, id)).returning();
    return updated;
  }

  async deleteLeadNurturing(tenantId: number, userId: number, id: number): Promise<void> {
    warnIfTenantScopedParamsInvalid('deleteLeadNurturing', { tenantId, userId, id });
    const checkResult = await db
      .select({ nurturing: leadNurturing })
      .from(leadNurturing)
      .innerJoin(leads, eq(leadNurturing.leadId, leads.id))
      .where(and(eq(leadNurturing.id, id), eq(leads.tenantId, tenantId)));
    
    if (checkResult[0]) {
      await db.delete(leadNurturing).where(eq(leadNurturing.id, id));
    }
  }

  async getActiveNurturingSequences(tenantId: number, userId: number): Promise<LeadNurturing[]> {
    warnIfTenantScopedParamsInvalid('getActiveNurturingSequences', { tenantId, userId });
    const result = await db
      .select({ nurturing: leadNurturing })
      .from(leadNurturing)
      .innerJoin(leads, eq(leadNurturing.leadId, leads.id))
      .where(and(eq(leadNurturing.status, 'active'), eq(leads.tenantId, tenantId)))
      .orderBy(desc(leadNurturing.createdAt));
    return result.map(r => r.nurturing);
  }

  async getNurturingSequencesByStatus(tenantId: number, userId: number, status: string): Promise<LeadNurturing[]> {
    warnIfTenantScopedParamsInvalid('getNurturingSequencesByStatus', { tenantId, userId });
    const result = await db
      .select({ nurturing: leadNurturing })
      .from(leadNurturing)
      .innerJoin(leads, eq(leadNurturing.leadId, leads.id))
      .where(and(eq(leadNurturing.status, status), eq(leads.tenantId, tenantId)))
      .orderBy(desc(leadNurturing.createdAt));
    return result.map(r => r.nurturing);
  }

  // Contact Lists
  async getContactList(tenantId: number, id: number): Promise<ContactList | undefined> {
    warnIfTenantScopedParamsInvalid('getContactList', { tenantId, id });
    const [list] = await db.select().from(contactLists).where(and(eq(contactLists.id, id), eq(contactLists.tenantId, tenantId)));
    return list || undefined;
  }

  async getContactListByName(tenantId: number, name: string): Promise<ContactList | undefined> {
    warnIfTenantScopedParamsInvalid('getContactListByName', { tenantId });
    const [list] = await db.select().from(contactLists).where(and(eq(contactLists.name, name), eq(contactLists.tenantId, tenantId)));
    return list || undefined;
  }

  async createContactList(tenantId: number, list: InsertContactList): Promise<ContactList> {
    warnIfTenantScopedParamsInvalid('createContactList', { tenantId });
    const listData = { ...list, tenantId };
    const [created] = await db.insert(contactLists).values(listData).returning();
    return created;
  }

  async updateContactList(tenantId: number, id: number, list: Partial<InsertContactList>): Promise<ContactList> {
    warnIfTenantScopedParamsInvalid('updateContactList', { tenantId, id });
    const [updated] = await db.update(contactLists).set(list).where(and(eq(contactLists.id, id), eq(contactLists.tenantId, tenantId))).returning();
    return updated;
  }

  async deleteContactList(tenantId: number, id: number): Promise<void> {
    warnIfTenantScopedParamsInvalid('deleteContactList', { tenantId, id });
    // First, remove all memberships
    await db.delete(contactListMemberships).where(and(eq(contactListMemberships.listId, id), eq(contactListMemberships.tenantId, tenantId)));
    // Then delete the list
    await db.delete(contactLists).where(and(eq(contactLists.id, id), eq(contactLists.tenantId, tenantId)));
  }

  async getAllContactLists(tenantId: number): Promise<ContactList[]> {
    warnIfTenantScopedParamsInvalid('getAllContactLists', { tenantId });
    return await db.select().from(contactLists).where(eq(contactLists.tenantId, tenantId)).orderBy(asc(contactLists.name));
  }

  async getContactListsByCategory(tenantId: number, category: string): Promise<ContactList[]> {
    warnIfTenantScopedParamsInvalid('getContactListsByCategory', { tenantId });
    return await db.select().from(contactLists).where(and(eq(contactLists.category, category), eq(contactLists.tenantId, tenantId))).orderBy(asc(contactLists.name));
  }

  async getContactListsByType(tenantId: number, type: string): Promise<ContactList[]> {
    warnIfTenantScopedParamsInvalid('getContactListsByType', { tenantId });
    return await db.select().from(contactLists).where(and(eq(contactLists.type, type), eq(contactLists.tenantId, tenantId))).orderBy(asc(contactLists.name));
  }

  // Contact List Memberships
  async getContactListMembership(tenantId: number, id: number): Promise<ContactListMembership | undefined> {
    warnIfTenantScopedParamsInvalid('getContactListMembership', { tenantId, id });
    const [membership] = await db.select().from(contactListMemberships).where(and(eq(contactListMemberships.id, id), eq(contactListMemberships.tenantId, tenantId)));
    return membership || undefined;
  }

  async createContactListMembership(tenantId: number, membership: InsertContactListMembership): Promise<ContactListMembership> {
    warnIfTenantScopedParamsInvalid('createContactListMembership', { tenantId });
    const membershipData = { ...membership, tenantId };
    const [created] = await db.insert(contactListMemberships).values(membershipData).returning();
    
    // Update contact count in the list
    const contactCount = await db.select({ count: count() })
      .from(contactListMemberships)
      .where(and(
        eq(contactListMemberships.listId, membership.listId),
        eq(contactListMemberships.status, 'active'),
        eq(contactListMemberships.tenantId, tenantId)
      ));
    
    await db.update(contactLists)
      .set({ 
        contactCount: contactCount[0].count,
        lastContactAdded: new Date()
      })
      .where(and(eq(contactLists.id, membership.listId), eq(contactLists.tenantId, tenantId)));

    return created;
  }

  async updateContactListMembership(tenantId: number, id: number, membership: Partial<InsertContactListMembership>): Promise<ContactListMembership> {
    warnIfTenantScopedParamsInvalid('updateContactListMembership', { tenantId, id });
    const [updated] = await db.update(contactListMemberships).set(membership).where(and(eq(contactListMemberships.id, id), eq(contactListMemberships.tenantId, tenantId))).returning();
    return updated;
  }

  async deleteContactListMembership(tenantId: number, id: number): Promise<void> {
    warnIfTenantScopedParamsInvalid('deleteContactListMembership', { tenantId, id });
    const membership = await this.getContactListMembership(tenantId, id);
    if (membership) {
      await db.delete(contactListMemberships).where(and(eq(contactListMemberships.id, id), eq(contactListMemberships.tenantId, tenantId)));
      
      // Update contact count in the list
      const contactCount = await db.select({ count: count() })
        .from(contactListMemberships)
        .where(and(
          eq(contactListMemberships.listId, membership.listId),
          eq(contactListMemberships.status, 'active'),
          eq(contactListMemberships.tenantId, tenantId)
        ));
      
      await db.update(contactLists)
        .set({ contactCount: contactCount[0].count })
        .where(and(eq(contactLists.id, membership.listId), eq(contactLists.tenantId, tenantId)));
    }
  }

  async getContactListMemberships(tenantId: number, listId: number): Promise<ContactListMembership[]> {
    warnIfTenantScopedParamsInvalid('getContactListMemberships', { tenantId, listId });
    return await db.select().from(contactListMemberships).where(and(eq(contactListMemberships.listId, listId), eq(contactListMemberships.tenantId, tenantId))).orderBy(desc(contactListMemberships.addedAt));
  }

  async getContactMemberships(tenantId: number, contactId: number): Promise<ContactListMembership[]> {
    warnIfTenantScopedParamsInvalid('getContactMemberships', { tenantId, contactId });
    return await db.select().from(contactListMemberships).where(and(eq(contactListMemberships.contactId, contactId), eq(contactListMemberships.tenantId, tenantId))).orderBy(desc(contactListMemberships.addedAt));
  }

  async addContactToList(tenantId: number, contactId: number, listId: number, addedBy?: number): Promise<ContactListMembership> {
    warnIfTenantScopedParamsInvalid('addContactToList', { tenantId, contactId, listId });
    // Check if already exists
    const existing = await db.select().from(contactListMemberships)
      .where(and(
        eq(contactListMemberships.contactId, contactId),
        eq(contactListMemberships.listId, listId),
        eq(contactListMemberships.tenantId, tenantId)
      ));

    if (existing.length > 0) {
      // Update status to active if it exists
      const [updated] = await db.update(contactListMemberships)
        .set({ status: 'active' })
        .where(and(eq(contactListMemberships.id, existing[0].id), eq(contactListMemberships.tenantId, tenantId)))
        .returning();
      return updated;
    }

    // Create new membership
    return await this.createContactListMembership(tenantId, {
      userId: addedBy || 0, // Fallback to 0 if not provided, assuming it's required by schema now
      contactId,
      listId,
      addedBy,
      status: 'active'
    });
  }

  async removeContactFromList(tenantId: number, contactId: number, listId: number): Promise<void> {
    warnIfTenantScopedParamsInvalid('removeContactFromList', { tenantId, contactId, listId });
    await db.delete(contactListMemberships)
      .where(and(
        eq(contactListMemberships.contactId, contactId),
        eq(contactListMemberships.listId, listId),
        eq(contactListMemberships.tenantId, tenantId)
      ));
    
    // Update contact count in the list
    const contactCount = await db.select({ count: count() })
      .from(contactListMemberships)
      .where(and(
        eq(contactListMemberships.listId, listId),
        eq(contactListMemberships.status, 'active'),
        eq(contactListMemberships.tenantId, tenantId)
      ));
    
    await db.update(contactLists)
      .set({ contactCount: contactCount[0].count })
      .where(and(eq(contactLists.id, listId), eq(contactLists.tenantId, tenantId)));
  }

  async getContactsInList(tenantId: number, listId: number): Promise<Contact[]> {
    warnIfTenantScopedParamsInvalid('getContactsInList', { tenantId, listId });
    const result = await db
      .select({ contact: contacts })
      .from(contacts)
      .innerJoin(contactListMemberships, eq(contacts.id, contactListMemberships.contactId))
      .where(and(
        eq(contactListMemberships.listId, listId),
        eq(contactListMemberships.status, 'active'),
        eq(contactListMemberships.tenantId, tenantId)
      ))
      .orderBy(asc(contacts.name));

    return result.map(r => r.contact);
  }

  // AI Lead Scoring
  async getAiLeadScore(tenantId: number, contactId: number): Promise<AiLeadScore | undefined> {
    warnIfTenantScopedParamsInvalid('getAiLeadScore', { tenantId, contactId });
    const [score] = await db.select()
      .from(aiLeadScores)
      .where(and(
        eq(aiLeadScores.tenantId, tenantId),
        eq(aiLeadScores.contactId, contactId)
      ))
      .orderBy(desc(aiLeadScores.lastCalculated))
      .limit(1);
    return score || undefined;
  }

  async upsertAiLeadScore(tenantId: number, score: Omit<InsertAiLeadScore, 'tenantId'>): Promise<AiLeadScore> {
    warnIfTenantScopedParamsInvalid('upsertAiLeadScore', { tenantId });
    // Check if score exists for this contact
    const existing = await this.getAiLeadScore(tenantId, score.contactId);

    if (existing) {
      // Update existing score
      const [updated] = await db.update(aiLeadScores)
        .set({
          ...score,
          updatedAt: new Date(),
          lastCalculated: new Date(),
        })
        .where(and(
          eq(aiLeadScores.tenantId, tenantId),
          eq(aiLeadScores.contactId, score.contactId)
        ))
        .returning();
      return updated;
    } else {
      // Create new score
      const [newScore] = await db.insert(aiLeadScores)
        .values({
          ...score,
          tenantId
        })
        .returning();
      return newScore;
    }
  }

  async getTopScoredContacts(tenantId: number, limit: number): Promise<Array<Contact & { aiScore: AiLeadScore }>> {
    warnIfTenantScopedParamsInvalid('getTopScoredContacts', { tenantId });
    const result = await db
      .select({ contact: contacts, aiScore: aiLeadScores })
      .from(contacts)
      .innerJoin(aiLeadScores, and(
        eq(contacts.id, aiLeadScores.contactId),
        eq(aiLeadScores.tenantId, tenantId)
      ))
      .where(eq(contacts.tenantId, tenantId))
      .orderBy(desc(aiLeadScores.overallScore))
      .limit(limit);

    return result.map(r => ({
      ...r.contact,
      aiScore: r.aiScore
    }));
  }

  // Call Intelligence
  async getCallIntelligence(tenantId: number, callId: number): Promise<CallIntelligence | undefined> {
    warnIfTenantScopedParamsInvalid('getCallIntelligence', { tenantId, callId });
    const [intelligence] = await db.select()
      .from(callIntelligence)
      .where(and(
        eq(callIntelligence.tenantId, tenantId),
        eq(callIntelligence.callId, callId)
      ));
    return intelligence || undefined;
  }

  async createCallIntelligence(tenantId: number, intelligence: Omit<InsertCallIntelligence, 'tenantId'>): Promise<CallIntelligence> {
    warnIfTenantScopedParamsInvalid('createCallIntelligence', { tenantId });
    const [newIntelligence] = await db.insert(callIntelligence)
      .values({
        ...intelligence,
        tenantId
      })
      .returning();
    return newIntelligence;
  }

  async updateCallIntelligence(tenantId: number, id: number, intelligence: Partial<InsertCallIntelligence>): Promise<CallIntelligence> {
    warnIfTenantScopedParamsInvalid('updateCallIntelligence', { tenantId, id });
    const [updated] = await db.update(callIntelligence)
      .set({
        ...intelligence,
        updatedAt: new Date(),
      })
      .where(and(
        eq(callIntelligence.id, id),
        eq(callIntelligence.tenantId, tenantId)
      ))
      .returning();
    return updated;
  }

  // AI Insights (tenant-scoped)
  async getAiInsight(tenantId: number, id: number): Promise<AiInsight | undefined> {
    warnIfTenantScopedParamsInvalid('getAiInsight', { tenantId, id });
    const [insight] = await db.select()
      .from(aiInsights)
      .where(and(
        eq(aiInsights.id, id),
        eq(aiInsights.tenantId, tenantId)
      ));
    return insight || undefined;
  }

  async getAiInsights(tenantId: number, filters: { status?: string; type?: string }): Promise<AiInsight[]> {
    warnIfTenantScopedParamsInvalid('getAiInsights', { tenantId });
    const conditions = [eq(aiInsights.tenantId, tenantId)];
    
    if (filters.status) {
      conditions.push(eq(aiInsights.status, filters.status));
    }
    if (filters.type) {
      conditions.push(eq(aiInsights.type, filters.type));
    }

    const insights = await db.select()
      .from(aiInsights)
      .where(and(...conditions))
      .orderBy(desc(aiInsights.createdAt));
    
    return insights;
  }

  async createAiInsight(tenantId: number, insight: Omit<InsertAiInsight, 'tenantId'>): Promise<AiInsight> {
    warnIfTenantScopedParamsInvalid('createAiInsight', { tenantId });
    const [newInsight] = await db.insert(aiInsights)
      .values({
        ...insight,
        tenantId
      })
      .returning();
    return newInsight;
  }

  async updateAiInsight(tenantId: number, id: number, insight: Partial<InsertAiInsight>): Promise<AiInsight> {
    warnIfTenantScopedParamsInvalid('updateAiInsight', { tenantId, id });
    const [updated] = await db.update(aiInsights)
      .set({
        ...insight,
        updatedAt: new Date(),
      })
      .where(and(
        eq(aiInsights.id, id),
        eq(aiInsights.tenantId, tenantId)
      ))
      .returning();
    return updated;
  }

  async deleteAiInsight(tenantId: number, id: number): Promise<void> {
    warnIfTenantScopedParamsInvalid('deleteAiInsight', { tenantId, id });
    await db.delete(aiInsights)
      .where(and(
        eq(aiInsights.id, id),
        eq(aiInsights.tenantId, tenantId)
      ));
  }

  // Tenants
  async getTenant(id: number): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    return tenant || undefined;
  }

  async getTenantBySlug(slug: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug));
    return tenant || undefined;
  }

  async createTenant(tenant: InsertTenant): Promise<Tenant> {
    const [newTenant] = await db.insert(tenants).values(tenant).returning();
    return newTenant;
  }

  async updateTenant(id: number, tenant: Partial<InsertTenant>): Promise<Tenant> {
    const [updated] = await db.update(tenants)
      .set({
        ...tenant,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, id))
      .returning();
    return updated;
  }

  async deleteTenant(id: number): Promise<void> {
    await db.delete(tenants).where(eq(tenants.id, id));
  }

  async getAllTenants(): Promise<Tenant[]> {
    return await db.select().from(tenants).orderBy(asc(tenants.name));
  }

  // Tenant Memberships
  async getTenantMembership(tenantId: number, userId: number): Promise<TenantMembership | undefined> {
    const [membership] = await db.select()
      .from(tenantMemberships)
      .where(and(
        eq(tenantMemberships.tenantId, tenantId),
        eq(tenantMemberships.userId, userId)
      ));
    return membership || undefined;
  }

  async getTenantMembershipsByUserId(userId: number): Promise<TenantMembership[]> {
    return await db.select()
      .from(tenantMemberships)
      .where(eq(tenantMemberships.userId, userId));
  }

  async getTenantMembers(tenantId: number): Promise<TenantMembership[]> {
    return await db.select()
      .from(tenantMemberships)
      .where(eq(tenantMemberships.tenantId, tenantId));
  }

  async createTenantMembership(membership: InsertTenantMembership): Promise<TenantMembership> {
    const [newMembership] = await db.insert(tenantMemberships).values(membership).returning();
    return newMembership;
  }

  async updateTenantMembership(id: number, membership: Partial<InsertTenantMembership>): Promise<TenantMembership> {
    const [updated] = await db.update(tenantMemberships)
      .set({
        ...membership,
        updatedAt: new Date(),
      })
      .where(eq(tenantMemberships.id, id))
      .returning();
    return updated;
  }

  async deleteTenantMembership(id: number): Promise<void> {
    await db.delete(tenantMemberships).where(eq(tenantMemberships.id, id));
  }

  async getDefaultTenantForUser(userId: number): Promise<TenantMembership | undefined> {
    const [membership] = await db.select()
      .from(tenantMemberships)
      .where(and(
        eq(tenantMemberships.userId, userId),
        eq(tenantMemberships.isDefault, true),
        eq(tenantMemberships.status, 'active')
      ));
    
    if (membership) return membership;
    
    // If no default, return the first active membership
    const [firstMembership] = await db.select()
      .from(tenantMemberships)
      .where(and(
        eq(tenantMemberships.userId, userId),
        eq(tenantMemberships.status, 'active')
      ))
      .limit(1);
    
    return firstMembership || undefined;
  }

  async ensureDefaultTenant(userId: number): Promise<TenantMembership> {
    // Check if user already has a default tenant
    const existing = await this.getDefaultTenantForUser(userId);
    if (existing) return existing;
    
    // Get or create the default organization tenant
    let defaultTenant = await this.getTenantBySlug('default');
    if (!defaultTenant) {
      defaultTenant = await this.createTenant({
        name: 'Default Organization',
        slug: 'default',
        status: 'active',
        plan: 'free',
      });
    }
    
    // Create membership for the user
    const membership = await this.createTenantMembership({
      tenantId: defaultTenant.id,
      userId,
      role: 'member',
      status: 'active',
      isDefault: true,
    });
    
    return membership;
  }

  async createUserWithTenant(insertUser: InsertUser): Promise<User> {
    // Generate a unique slug for the tenant's organization
    const orgName = `${insertUser.username}'s Organization`;
    const baseSlug = (insertUser.username || 'user').toLowerCase().replace(/[^a-z0-9]/g, '-');
    let slug = baseSlug;
    let tenant = await this.getTenantBySlug(slug);
    let i = 1;
    while (tenant) {
      slug = `${baseSlug}-${i}`;
      tenant = await this.getTenantBySlug(slug);
      i++;
    }
  
    // Create a new tenant for the user
    const newTenant = await this.createTenant({
      name: orgName,
      slug: slug,
      status: 'active',
      plan: 'free',
    });
  
    // Create the new user
    const newUser = await this.createUser({
      ...insertUser,
    });
  
    // Create the tenant membership for the user
    await this.createTenantMembership({
      tenantId: newTenant.id,
      userId: newUser.id,
      role: 'admin', // The user is the admin of their own tenant
      status: 'active',
      isDefault: true,
    });
  
    return newUser;
  }
}

export const storage = new DatabaseStorage();
