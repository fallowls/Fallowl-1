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
  getCallByTwilioSid(twilioCallSid: string): Promise<Call | undefined>;
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
  getMessageByTwilioSid(twilioMessageSid: string): Promise<Message | undefined>;
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

  // SMS Templates
  getSmsTemplate(userId: number, id: number): Promise<SmsTemplate | undefined>;
  createSmsTemplate(userId: number, template: InsertSmsTemplate): Promise<SmsTemplate>;
  updateSmsTemplate(userId: number, id: number, template: Partial<InsertSmsTemplate>): Promise<SmsTemplate>;
  deleteSmsTemplate(userId: number, id: number): Promise<void>;
  getAllSmsTemplates(userId: number): Promise<SmsTemplate[]>;
  getSmsTemplatesByCategory(userId: number, category: string): Promise<SmsTemplate[]>;
  incrementTemplateUsage(userId: number, id: number): Promise<void>;

  // SMS Campaigns
  getSmsCampaign(userId: number, id: number): Promise<SmsCampaign | undefined>;
  createSmsCampaign(userId: number, campaign: InsertSmsCampaign): Promise<SmsCampaign>;
  updateSmsCampaign(userId: number, id: number, campaign: Partial<InsertSmsCampaign>): Promise<SmsCampaign>;
  deleteSmsCampaign(userId: number, id: number): Promise<void>;
  getAllSmsCampaigns(userId: number): Promise<SmsCampaign[]>;
  getCampaignsByStatus(userId: number, status: string): Promise<SmsCampaign[]>;
  updateCampaignStats(userId: number, id: number, stats: Partial<SmsCampaign>): Promise<SmsCampaign>;

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

  // Settings
  getSetting(key: string): Promise<Setting | undefined>;
  setSetting(key: string, value: any): Promise<Setting>;
  getAllSettings(): Promise<Setting[]>;

  // Call Notes
  getCallNote(userId: number, id: number): Promise<CallNote | undefined>;
  createCallNote(userId: number, note: InsertCallNote): Promise<CallNote>;
  updateCallNote(userId: number, id: number, note: Partial<InsertCallNote>): Promise<CallNote>;
  deleteCallNote(userId: number, id: number): Promise<void>;
  getAllCallNotes(userId: number): Promise<CallNote[]>;
  getCallNotesByCall(userId: number, callId: number): Promise<CallNote[]>;
  getCallNotesByContact(userId: number, contactId: number): Promise<CallNote[]>;
  getCallNotesByPhone(userId: number, phone: string): Promise<CallNote[]>;

  // Lead Sources
  getLeadSource(userId: number, id: number): Promise<LeadSource | undefined>;
  getLeadSourceByName(userId: number, name: string): Promise<LeadSource | undefined>;
  createLeadSource(userId: number, source: InsertLeadSource): Promise<LeadSource>;
  updateLeadSource(userId: number, id: number, source: Partial<InsertLeadSource>): Promise<LeadSource>;
  deleteLeadSource(userId: number, id: number): Promise<void>;
  getAllLeadSources(userId: number): Promise<LeadSource[]>;
  getActiveLeadSources(userId: number): Promise<LeadSource[]>;

  // Lead Statuses
  getLeadStatus(userId: number, id: number): Promise<LeadStatus | undefined>;
  getLeadStatusByName(userId: number, name: string): Promise<LeadStatus | undefined>;
  createLeadStatus(userId: number, status: InsertLeadStatus): Promise<LeadStatus>;
  updateLeadStatus(userId: number, id: number, status: Partial<InsertLeadStatus>): Promise<LeadStatus>;
  deleteLeadStatus(userId: number, id: number): Promise<void>;
  getAllLeadStatuses(userId: number): Promise<LeadStatus[]>;
  getActiveLeadStatuses(userId: number): Promise<LeadStatus[]>;

  // Lead Campaigns
  getLeadCampaign(userId: number, id: number): Promise<LeadCampaign | undefined>;
  createLeadCampaign(userId: number, campaign: InsertLeadCampaign): Promise<LeadCampaign>;
  updateLeadCampaign(userId: number, id: number, campaign: Partial<InsertLeadCampaign>): Promise<LeadCampaign>;
  deleteLeadCampaign(userId: number, id: number): Promise<void>;
  getAllLeadCampaigns(userId: number): Promise<LeadCampaign[]>;
  getLeadCampaignsByStatus(userId: number, status: string): Promise<LeadCampaign[]>;
  getLeadCampaignsByType(userId: number, type: string): Promise<LeadCampaign[]>;

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

  // Lead Activities
  getLeadActivity(userId: number, id: number): Promise<LeadActivity | undefined>;
  createLeadActivity(userId: number, activity: InsertLeadActivity): Promise<LeadActivity>;
  updateLeadActivity(userId: number, id: number, activity: Partial<InsertLeadActivity>): Promise<LeadActivity>;
  deleteLeadActivity(userId: number, id: number): Promise<void>;
  getLeadActivities(userId: number, leadId: number): Promise<LeadActivity[]>;
  getLeadActivitiesByType(userId: number, leadId: number, type: string): Promise<LeadActivity[]>;
  getLeadActivitiesByUser(userId: number, performedByUserId: number): Promise<LeadActivity[]>;
  getRecentLeadActivities(userId: number, limit?: number): Promise<LeadActivity[]>;

  // Lead Tasks
  getLeadTask(userId: number, id: number): Promise<LeadTask | undefined>;
  createLeadTask(userId: number, task: InsertLeadTask): Promise<LeadTask>;
  updateLeadTask(userId: number, id: number, task: Partial<InsertLeadTask>): Promise<LeadTask>;
  deleteLeadTask(userId: number, id: number): Promise<void>;
  getLeadTasks(userId: number, leadId: number): Promise<LeadTask[]>;
  getLeadTasksByAssignee(userId: number, assigneeId: number): Promise<LeadTask[]>;
  getLeadTasksByStatus(userId: number, status: string): Promise<LeadTask[]>;
  getOverdueTasks(userId: number): Promise<LeadTask[]>;
  getUpcomingTasks(userId: number, days?: number): Promise<LeadTask[]>;

  // Lead Scoring
  getLeadScoring(userId: number, id: number): Promise<LeadScoring | undefined>;
  getLeadScoringByLead(userId: number, leadId: number): Promise<LeadScoring[]>;
  createLeadScoring(userId: number, scoring: InsertLeadScoring): Promise<LeadScoring>;
  updateLeadScoring(userId: number, id: number, scoring: Partial<InsertLeadScoring>): Promise<LeadScoring>;
  deleteLeadScoring(userId: number, id: number): Promise<void>;
  getLeadScoringHistory(userId: number, leadId: number): Promise<LeadScoring[]>;

  // Lead Nurturing
  getLeadNurturing(userId: number, id: number): Promise<LeadNurturing | undefined>;
  getLeadNurturingByLead(userId: number, leadId: number): Promise<LeadNurturing[]>;
  createLeadNurturing(userId: number, nurturing: InsertLeadNurturing): Promise<LeadNurturing>;
  updateLeadNurturing(userId: number, id: number, nurturing: Partial<InsertLeadNurturing>): Promise<LeadNurturing>;
  deleteLeadNurturing(userId: number, id: number): Promise<void>;
  getActiveNurturingSequences(userId: number): Promise<LeadNurturing[]>;
  getNurturingSequencesByStatus(userId: number, status: string): Promise<LeadNurturing[]>;

  // Contact Lists
  getContactList(userId: number, id: number): Promise<ContactList | undefined>;
  getContactListByName(userId: number, name: string): Promise<ContactList | undefined>;
  createContactList(userId: number, list: InsertContactList): Promise<ContactList>;
  updateContactList(userId: number, id: number, list: Partial<InsertContactList>): Promise<ContactList>;
  deleteContactList(userId: number, id: number): Promise<void>;
  getAllContactLists(userId: number): Promise<ContactList[]>;
  getContactListsByCategory(userId: number, category: string): Promise<ContactList[]>;
  getContactListsByType(userId: number, type: string): Promise<ContactList[]>;

  // Contact List Memberships
  getContactListMembership(userId: number, id: number): Promise<ContactListMembership | undefined>;
  createContactListMembership(userId: number, membership: InsertContactListMembership): Promise<ContactListMembership>;
  updateContactListMembership(userId: number, id: number, membership: Partial<InsertContactListMembership>): Promise<ContactListMembership>;
  deleteContactListMembership(userId: number, id: number): Promise<void>;
  getContactListMemberships(userId: number, listId: number): Promise<ContactListMembership[]>;
  getContactMemberships(userId: number, contactId: number): Promise<ContactListMembership[]>;
  addContactToList(userId: number, contactId: number, listId: number, addedBy?: number): Promise<ContactListMembership>;
  removeContactFromList(userId: number, contactId: number, listId: number): Promise<void>;
  getContactsInList(userId: number, listId: number): Promise<Contact[]>;

  // AI Lead Scoring
  getAiLeadScore(userId: number, contactId: number): Promise<AiLeadScore | undefined>;
  upsertAiLeadScore(userId: number, score: Omit<InsertAiLeadScore, 'userId'>): Promise<AiLeadScore>;
  getTopScoredContacts(userId: number, limit: number): Promise<Array<Contact & { aiScore: AiLeadScore }>>;

  // Call Intelligence
  getCallIntelligence(userId: number, callId: number): Promise<CallIntelligence | undefined>;
  createCallIntelligence(userId: number, intelligence: Omit<InsertCallIntelligence, 'userId'>): Promise<CallIntelligence>;
  updateCallIntelligence(userId: number, id: number, intelligence: Partial<InsertCallIntelligence>): Promise<CallIntelligence>;

  // AI Insights
  getAiInsight(userId: number, id: number): Promise<AiInsight | undefined>;
  getAiInsights(userId: number, filters: { status?: string; type?: string }): Promise<AiInsight[]>;
  createAiInsight(userId: number, insight: Omit<InsertAiInsight, 'userId'>): Promise<AiInsight>;
  updateAiInsight(userId: number, id: number, insight: Partial<InsertAiInsight>): Promise<AiInsight>;
  deleteAiInsight(userId: number, id: number): Promise<void>;

  // Tenants
  getTenant(id: number): Promise<Tenant | undefined>;
  getTenantBySlug(slug: string): Promise<Tenant | undefined>;
  createTenant(tenant: InsertTenant): Promise<Tenant>;
  updateTenant(id: number, tenant: Partial<InsertTenant>): Promise<Tenant>;
  deleteTenant(id: number): Promise<void>;
  getAllTenants(): Promise<Tenant[]>;
  
  // Tenant Memberships
  getTenantMembership(tenantId: number, userId: number): Promise<TenantMembership | undefined>;
  getUserTenantMemberships(userId: number): Promise<TenantMembership[]>;
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
      .where(eq(users.id, userIds[0])); // Simplified for now
    
    // Return updated users
    return await db
      .select()
      .from(users)
      .where(eq(users.id, userIds[0]));
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
    await db.delete(contacts).where(and(eq(contacts.id, id), eq(contacts.tenantId, tenantId)));
  }

  async getAllContacts(tenantId: number, userId: number): Promise<Contact[]> {
    return await db.select().from(contacts).where(eq(contacts.tenantId, tenantId)).orderBy(asc(contacts.name));
  }

  async searchContacts(tenantId: number, userId: number, query: string): Promise<Contact[]> {
    return await db
      .select()
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
      .orderBy(asc(contacts.name));
  }

  // Calls (tenant-scoped)
  async getCall(tenantId: number, userId: number, id: number): Promise<Call | undefined> {
    const [call] = await db.select().from(calls).where(and(eq(calls.id, id), eq(calls.tenantId, tenantId)));
    return call || undefined;
  }

  async createCall(tenantId: number, userId: number, insertCall: InsertCall): Promise<Call> {
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
    const [call] = await db
      .update(calls)
      .set(updateData)
      .where(and(eq(calls.id, id), eq(calls.tenantId, tenantId)))
      .returning();
    return call;
  }

  async deleteCall(tenantId: number, userId: number, id: number): Promise<void> {
    await db.delete(calls).where(and(eq(calls.id, id), eq(calls.tenantId, tenantId)));
  }

  async getAllCalls(tenantId: number, userId: number, options: { page?: number; limit?: number } = {}): Promise<{ calls: Call[]; total: number }> {
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
    return await db
      .select()
      .from(calls)
      .where(eq(calls.tenantId, tenantId))
      .orderBy(desc(calls.createdAt))
      .limit(limit);
  }

  async getCallsByStatus(tenantId: number, userId: number, statuses: string[]): Promise<Call[]> {
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
    const activeStatuses = ['queued', 'initiated', 'ringing', 'in-progress'];
    return this.getCallsByStatus(tenantId, userId, activeStatuses);
  }

  async getCallByTwilioSid(callSid: string): Promise<Call | undefined> {
    const results = await db
      .select()
      .from(calls)
      .where(eq(calls.sipCallId, callSid))
      .limit(1);
    
    if (results.length > 0) {
      return results[0];
    }
    
    const metadataResults = await db
      .select()
      .from(calls)
      .where(sql`${calls.metadata}->>'twilioCallSid' = ${callSid}`)
      .limit(1);
    
    return metadataResults.length > 0 ? metadataResults[0] : undefined;
  }

  async getCallBySipCallId(sipCallId: string): Promise<Call | null> {
    const results = await db
      .select()
      .from(calls)
      .where(eq(calls.sipCallId, sipCallId))
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
    const allCalls = await db.select().from(calls).where(eq(calls.tenantId, tenantId));
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
    const [message] = await db.select().from(messages).where(and(eq(messages.id, id), eq(messages.tenantId, tenantId)));
    return message || undefined;
  }

  async getMessageByTwilioSid(twilioMessageSid: string): Promise<Message | undefined> {
    const [message] = await db.select().from(messages).where(
      sql`${messages.metadata}->>'twilioMessageSid' = ${twilioMessageSid}`
    );
    return message || undefined;
  }

  async createMessage(tenantId: number, userId: number, insertMessage: InsertMessage): Promise<Message> {
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
    const [message] = await db
      .update(messages)
      .set(updateData)
      .where(and(eq(messages.id, id), eq(messages.tenantId, tenantId)))
      .returning();
    return message;
  }

  async deleteMessage(tenantId: number, userId: number, id: number): Promise<void> {
    await db.delete(messages).where(and(eq(messages.id, id), eq(messages.tenantId, tenantId)));
  }

  async getAllMessages(tenantId: number, userId: number): Promise<Message[]> {
    return await db.select().from(messages).where(eq(messages.tenantId, tenantId)).orderBy(desc(messages.createdAt));
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
      .where(and(eq(conversationThreads.contactId, contactId), eq(conversationThreads.userId, userId)));
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
      .where(and(eq(conversationThreads.threadId, threadId), eq(conversationThreads.userId, userId)))
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

  // SMS Templates
  async getSmsTemplate(userId: number, id: number): Promise<SmsTemplate | undefined> {
    const [template] = await db
      .select()
      .from(smsTemplates)
      .where(and(eq(smsTemplates.id, id), eq(smsTemplates.userId, userId)));
    return template || undefined;
  }

  async createSmsTemplate(userId: number, template: InsertSmsTemplate): Promise<SmsTemplate> {
    const membership = await this.ensureDefaultTenant(userId);
    const templateData = {
      ...template,
      userId: userId,
      tenantId: membership.tenantId
    };
    const [created] = await db
      .insert(smsTemplates)
      .values(templateData)
      .returning();
    return created;
  }

  async updateSmsTemplate(userId: number, id: number, template: Partial<InsertSmsTemplate>): Promise<SmsTemplate> {
    const [updated] = await db
      .update(smsTemplates)
      .set(template)
      .where(and(eq(smsTemplates.id, id), eq(smsTemplates.userId, userId)))
      .returning();
    return updated;
  }

  async deleteSmsTemplate(userId: number, id: number): Promise<void> {
    await db.delete(smsTemplates).where(and(eq(smsTemplates.id, id), eq(smsTemplates.userId, userId)));
  }

  async getAllSmsTemplates(userId: number): Promise<SmsTemplate[]> {
    return await db
      .select()
      .from(smsTemplates)
      .where(and(
        eq(smsTemplates.isActive, true),
        eq(smsTemplates.userId, userId)
      ))
      .orderBy(asc(smsTemplates.name));
  }

  async getSmsTemplatesByCategory(userId: number, category: string): Promise<SmsTemplate[]> {
    return await db
      .select()
      .from(smsTemplates)
      .where(and(
        eq(smsTemplates.category, category),
        eq(smsTemplates.isActive, true),
        eq(smsTemplates.userId, userId)
      ))
      .orderBy(asc(smsTemplates.name));
  }

  async incrementTemplateUsage(userId: number, id: number): Promise<void> {
    await db
      .update(smsTemplates)
      .set({ usageCount: sql`${smsTemplates.usageCount} + 1` })
      .where(and(eq(smsTemplates.id, id), eq(smsTemplates.userId, userId)));
  }

  // SMS Campaigns
  async getSmsCampaign(userId: number, id: number): Promise<SmsCampaign | undefined> {
    const [campaign] = await db
      .select()
      .from(smsCampaigns)
      .where(and(eq(smsCampaigns.id, id), eq(smsCampaigns.userId, userId)));
    return campaign || undefined;
  }

  async createSmsCampaign(userId: number, campaign: InsertSmsCampaign): Promise<SmsCampaign> {
    const membership = await this.ensureDefaultTenant(userId);
    const campaignData = {
      ...campaign,
      userId: userId,
      tenantId: membership.tenantId
    };
    const [created] = await db
      .insert(smsCampaigns)
      .values(campaignData)
      .returning();
    return created;
  }

  async updateSmsCampaign(userId: number, id: number, campaign: Partial<InsertSmsCampaign>): Promise<SmsCampaign> {
    const [updated] = await db
      .update(smsCampaigns)
      .set(campaign)
      .where(and(eq(smsCampaigns.id, id), eq(smsCampaigns.userId, userId)))
      .returning();
    return updated;
  }

  async deleteSmsCampaign(userId: number, id: number): Promise<void> {
    await db.delete(smsCampaigns).where(and(eq(smsCampaigns.id, id), eq(smsCampaigns.userId, userId)));
  }

  async getAllSmsCampaigns(userId: number): Promise<SmsCampaign[]> {
    return await db
      .select()
      .from(smsCampaigns)
      .where(eq(smsCampaigns.userId, userId))
      .orderBy(desc(smsCampaigns.createdAt));
  }

  async getCampaignsByStatus(userId: number, status: string): Promise<SmsCampaign[]> {
    return await db
      .select()
      .from(smsCampaigns)
      .where(and(eq(smsCampaigns.status, status), eq(smsCampaigns.userId, userId)))
      .orderBy(desc(smsCampaigns.createdAt));
  }

  async updateCampaignStats(userId: number, id: number, stats: Partial<SmsCampaign>): Promise<SmsCampaign> {
    const [updated] = await db
      .update(smsCampaigns)
      .set(stats)
      .where(and(eq(smsCampaigns.id, id), eq(smsCampaigns.userId, userId)))
      .returning();
    return updated;
  }

  // Advanced Recording Management (tenant-scoped)
  async getRecording(tenantId: number, userId: number, id: number): Promise<Recording | undefined> {
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
    const [recording] = await db
      .update(recordings)
      .set({ ...updateData, updatedAt: new Date() })
      .where(and(eq(recordings.id, id), eq(recordings.tenantId, tenantId)))
      .returning();
    return recording;
  }

  async deleteRecording(tenantId: number, userId: number, id: number): Promise<void> {
    await db.delete(recordings).where(and(eq(recordings.id, id), eq(recordings.tenantId, tenantId)));
  }

  async getAllRecordings(tenantId: number, userId: number): Promise<Recording[]> {
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
    const [voicemail] = await db.select().from(voicemails).where(and(eq(voicemails.id, id), eq(voicemails.tenantId, tenantId)));
    return voicemail || undefined;
  }

  async createVoicemail(tenantId: number, userId: number, insertVoicemail: InsertVoicemail): Promise<Voicemail> {
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
    const [voicemail] = await db
      .update(voicemails)
      .set(updateData)
      .where(and(eq(voicemails.id, id), eq(voicemails.tenantId, tenantId)))
      .returning();
    return voicemail;
  }

  async deleteVoicemail(tenantId: number, userId: number, id: number): Promise<void> {
    await db.delete(voicemails).where(and(eq(voicemails.id, id), eq(voicemails.tenantId, tenantId)));
  }

  async getAllVoicemails(tenantId: number, userId: number): Promise<Voicemail[]> {
    return await db.select().from(voicemails).where(eq(voicemails.tenantId, tenantId)).orderBy(desc(voicemails.createdAt));
  }

  async getVoicemailsByContact(tenantId: number, userId: number, contactId: number): Promise<Voicemail[]> {
    return await db
      .select()
      .from(voicemails)
      .where(and(eq(voicemails.contactId, contactId), eq(voicemails.tenantId, tenantId)))
      .orderBy(desc(voicemails.createdAt));
  }

  async getUnreadVoicemails(tenantId: number, userId: number): Promise<Voicemail[]> {
    return await db
      .select()
      .from(voicemails)
      .where(and(eq(voicemails.isRead, false), eq(voicemails.tenantId, tenantId)))
      .orderBy(desc(voicemails.createdAt));
  }

  // Settings
  async getSetting(key: string, tenantId?: number): Promise<Setting | undefined> {
    const targetTenantId = tenantId || null;
    const [setting] = await db.select().from(settings).where(
      and(
        eq(settings.key, key),
        targetTenantId ? eq(settings.tenantId, targetTenantId) : isNull(settings.tenantId)
      )
    );
    return setting || undefined;
  }

  async setSetting(key: string, value: any, tenantId?: number): Promise<Setting> {
    const targetTenantId = tenantId || null;
    const [setting] = await db
      .insert(settings)
      .values({ key, value, tenantId: targetTenantId as any })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value, updatedAt: new Date() }
      })
      .returning();
    return setting;
  }

  async getAllSettings(): Promise<Setting[]> {
    return await db.select().from(settings).orderBy(asc(settings.key));
  }

  // Call Notes
  async getCallNote(userId: number, id: number): Promise<CallNote | undefined> {
    const [note] = await db.select().from(callNotes).where(and(eq(callNotes.id, id), eq(callNotes.userId, userId)));
    return note || undefined;
  }

  async createCallNote(userId: number, insertNote: InsertCallNote): Promise<CallNote> {
    const membership = await this.ensureDefaultTenant(userId);
    // Normalize phone number
    const normalized = normalizePhoneNumber(insertNote.phone);
    const normalizedPhone = normalized.isValid ? normalized.normalized : insertNote.phone;
    
    // Smart contact linking - try to find the contact using smart phone matching
    let contactIdToUse = insertNote.contactId;
    if (!contactIdToUse) {
      const existingContact = await this.findContactByAnyPhoneFormat(membership.tenantId, userId, insertNote.phone);
      if (existingContact) {
        contactIdToUse = existingContact.id;
      }
    }
    
    const noteData = {
      ...insertNote,
      userId: userId,
      tenantId: membership.tenantId,
      phone: normalizedPhone,
      contactId: contactIdToUse
    };
    
    const [note] = await db
      .insert(callNotes)
      .values(noteData)
      .returning();
    return note;
  }

  async updateCallNote(userId: number, id: number, updateData: Partial<InsertCallNote>): Promise<CallNote> {
    const [note] = await db
      .update(callNotes)
      .set({ ...updateData, updatedAt: new Date() })
      .where(and(eq(callNotes.id, id), eq(callNotes.userId, userId)))
      .returning();
    return note;
  }

  async deleteCallNote(userId: number, id: number): Promise<void> {
    await db.delete(callNotes).where(and(eq(callNotes.id, id), eq(callNotes.userId, userId)));
  }

  async getAllCallNotes(userId: number): Promise<CallNote[]> {
    return await db.select().from(callNotes).where(eq(callNotes.userId, userId)).orderBy(desc(callNotes.createdAt));
  }

  async getCallNotesByCall(userId: number, callId: number): Promise<CallNote[]> {
    return await db
      .select()
      .from(callNotes)
      .where(and(eq(callNotes.callId, callId), eq(callNotes.userId, userId)))
      .orderBy(desc(callNotes.createdAt));
  }

  async getCallNotesByContact(userId: number, contactId: number): Promise<CallNote[]> {
    return await db
      .select()
      .from(callNotes)
      .where(and(eq(callNotes.contactId, contactId), eq(callNotes.userId, userId)))
      .orderBy(desc(callNotes.createdAt));
  }

  async getCallNotesByPhone(userId: number, phone: string): Promise<CallNote[]> {
    return await db
      .select()
      .from(callNotes)
      .where(and(eq(callNotes.phone, phone), eq(callNotes.userId, userId)))
      .orderBy(desc(callNotes.createdAt));
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

      // Note: Sample data initialization is disabled for multi-tenant setup
      // Each user will need to create their own data
      const hasInitializedSetting = await this.getSetting('sample_data_initialized');
      
      if (!hasInitializedSetting) {
        // Mark that sample data initialization has been checked
        await this.setSetting('sample_data_initialized', true);
        console.log('✓ Sample data initialization skipped (multi-tenant mode)');
      }

      // Initialize default system and twilio settings to prevent 404 errors
      const systemSetting = await this.getSetting('system');
      if (!systemSetting) {
        await this.setSetting('system', {
          appName: 'DialPax CRM',
          timezone: 'America/New_York',
          dateFormat: 'MM/DD/YYYY',
          currency: 'USD',
          autoSave: true,
          theme: 'light'
        });
        console.log('✓ Default system settings created');
      }

      const twilioSetting = await this.getSetting('twilio');
      if (!twilioSetting) {
        await this.setSetting('twilio', {
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

      const callSettings = await this.getSetting('call-settings');
      if (!callSettings) {
        await this.setSetting('call-settings', {
          autoRecord: false,
          callTimeout: 300,
          callWaiting: true,
          conferencing: true,
          transfer: true,
          enableVoicemail: true,
          voicemailTimeout: 30,
          callQualityReporting: true
        });
        console.log('✓ Default call settings created');
      }

      const parallelDialerGreeting = await this.getSetting('parallel_dialer_greeting');
      if (!parallelDialerGreeting) {
        await this.setSetting('parallel_dialer_greeting', '');
        console.log('✓ Default parallel dialer greeting setting created');
      }

    } catch (error) {
      console.error('Error initializing default data:', error);
    }
  }

  // Lead Sources
  async getLeadSource(userId: number, id: number): Promise<LeadSource | undefined> {
    const [source] = await db.select().from(leadSources).where(and(eq(leadSources.id, id), eq(leadSources.userId, userId)));
    return source || undefined;
  }

  async getLeadSourceByName(userId: number, name: string): Promise<LeadSource | undefined> {
    const [source] = await db.select().from(leadSources).where(and(eq(leadSources.name, name), eq(leadSources.userId, userId)));
    return source || undefined;
  }

  async createLeadSource(userId: number, source: InsertLeadSource): Promise<LeadSource> {
    const membership = await this.ensureDefaultTenant(userId);
    const sourceData = { ...source, userId, tenantId: membership.tenantId };
    const [created] = await db.insert(leadSources).values(sourceData).returning();
    return created;
  }

  async updateLeadSource(userId: number, id: number, source: Partial<InsertLeadSource>): Promise<LeadSource> {
    const [updated] = await db.update(leadSources).set(source).where(and(eq(leadSources.id, id), eq(leadSources.userId, userId))).returning();
    return updated;
  }

  async deleteLeadSource(userId: number, id: number): Promise<void> {
    await db.delete(leadSources).where(and(eq(leadSources.id, id), eq(leadSources.userId, userId)));
  }

  async getAllLeadSources(userId: number): Promise<LeadSource[]> {
    return await db.select().from(leadSources).where(eq(leadSources.userId, userId)).orderBy(asc(leadSources.name));
  }

  async getActiveLeadSources(userId: number): Promise<LeadSource[]> {
    return await db.select().from(leadSources).where(and(eq(leadSources.isActive, true), eq(leadSources.userId, userId))).orderBy(asc(leadSources.name));
  }

  // Lead Statuses
  async getLeadStatus(userId: number, id: number): Promise<LeadStatus | undefined> {
    const [status] = await db.select().from(leadStatuses).where(and(eq(leadStatuses.id, id), eq(leadStatuses.userId, userId)));
    return status || undefined;
  }

  async getLeadStatusByName(userId: number, name: string): Promise<LeadStatus | undefined> {
    const [status] = await db.select().from(leadStatuses).where(and(eq(leadStatuses.name, name), eq(leadStatuses.userId, userId)));
    return status || undefined;
  }

  async createLeadStatus(userId: number, status: InsertLeadStatus): Promise<LeadStatus> {
    const membership = await this.ensureDefaultTenant(userId);
    const statusData = { ...status, userId, tenantId: membership.tenantId };
    const [created] = await db.insert(leadStatuses).values(statusData).returning();
    return created;
  }

  async updateLeadStatus(userId: number, id: number, status: Partial<InsertLeadStatus>): Promise<LeadStatus> {
    const [updated] = await db.update(leadStatuses).set(status).where(and(eq(leadStatuses.id, id), eq(leadStatuses.userId, userId))).returning();
    return updated;
  }

  async deleteLeadStatus(userId: number, id: number): Promise<void> {
    await db.delete(leadStatuses).where(and(eq(leadStatuses.id, id), eq(leadStatuses.userId, userId)));
  }

  async getAllLeadStatuses(userId: number): Promise<LeadStatus[]> {
    return await db.select().from(leadStatuses).where(eq(leadStatuses.userId, userId)).orderBy(asc(leadStatuses.sortOrder));
  }

  async getActiveLeadStatuses(userId: number): Promise<LeadStatus[]> {
    return await db.select().from(leadStatuses).where(and(eq(leadStatuses.isActive, true), eq(leadStatuses.userId, userId))).orderBy(asc(leadStatuses.sortOrder));
  }

  // Lead Campaigns
  async getLeadCampaign(userId: number, id: number): Promise<LeadCampaign | undefined> {
    const [campaign] = await db.select().from(leadCampaigns).where(and(eq(leadCampaigns.id, id), eq(leadCampaigns.userId, userId)));
    return campaign || undefined;
  }

  async createLeadCampaign(userId: number, campaign: InsertLeadCampaign): Promise<LeadCampaign> {
    const membership = await this.ensureDefaultTenant(userId);
    const campaignData = { ...campaign, userId, tenantId: membership.tenantId };
    const [created] = await db.insert(leadCampaigns).values(campaignData).returning();
    return created;
  }

  async updateLeadCampaign(userId: number, id: number, campaign: Partial<InsertLeadCampaign>): Promise<LeadCampaign> {
    const [updated] = await db.update(leadCampaigns).set(campaign).where(and(eq(leadCampaigns.id, id), eq(leadCampaigns.userId, userId))).returning();
    return updated;
  }

  async deleteLeadCampaign(userId: number, id: number): Promise<void> {
    await db.delete(leadCampaigns).where(and(eq(leadCampaigns.id, id), eq(leadCampaigns.userId, userId)));
  }

  async getAllLeadCampaigns(userId: number): Promise<LeadCampaign[]> {
    return await db.select().from(leadCampaigns).where(eq(leadCampaigns.userId, userId)).orderBy(desc(leadCampaigns.createdAt));
  }

  async getLeadCampaignsByStatus(userId: number, status: string): Promise<LeadCampaign[]> {
    return await db.select().from(leadCampaigns).where(and(eq(leadCampaigns.status, status), eq(leadCampaigns.userId, userId))).orderBy(desc(leadCampaigns.createdAt));
  }

  async getLeadCampaignsByType(userId: number, type: string): Promise<LeadCampaign[]> {
    return await db.select().from(leadCampaigns).where(and(eq(leadCampaigns.type, type), eq(leadCampaigns.userId, userId))).orderBy(desc(leadCampaigns.createdAt));
  }

  // Leads (tenant-scoped)
  async getLead(tenantId: number, userId: number, id: number): Promise<Lead | undefined> {
    const [lead] = await db.select().from(leads).where(and(eq(leads.id, id), eq(leads.tenantId, tenantId)));
    return lead || undefined;
  }

  async getLeadByEmail(tenantId: number, userId: number, email: string): Promise<Lead | undefined> {
    const [lead] = await db.select().from(leads).where(and(eq(leads.email, email), eq(leads.tenantId, tenantId)));
    return lead || undefined;
  }

  async getLeadByPhone(tenantId: number, userId: number, phone: string): Promise<Lead | undefined> {
    const [lead] = await db.select().from(leads).where(and(eq(leads.phone, phone), eq(leads.tenantId, tenantId)));
    return lead || undefined;
  }

  async createLead(tenantId: number, userId: number, lead: InsertLead): Promise<Lead> {
    if (!lead) {
      throw new Error('Lead data is required');
    }
    const leadData = {
      ...lead,
      userId: userId,
      tenantId: tenantId,
      // Ensure integer fields are properly cast if they come as strings
      leadStatusId: typeof (lead as any).leadStatusId === 'string' ? parseInt((lead as any).leadStatusId) : (lead as any).leadStatusId,
      leadSourceId: typeof (lead as any).leadSourceId === 'string' ? parseInt((lead as any).leadSourceId) : (lead as any).leadSourceId,
      leadScore: typeof (lead as any).leadScore === 'string' ? parseInt((lead as any).leadScore) : (lead as any).leadScore,
    };
    const [created] = await db.insert(leads).values(leadData).returning();
    return created;
  }

  async updateLead(tenantId: number, userId: number, id: number, lead: Partial<InsertLead>): Promise<Lead> {
    const [updated] = await db.update(leads).set(lead).where(and(eq(leads.id, id), eq(leads.tenantId, tenantId))).returning();
    return updated;
  }

  async deleteLead(tenantId: number, userId: number, id: number): Promise<void> {
    await db.delete(leads).where(and(eq(leads.id, id), eq(leads.tenantId, tenantId)));
  }

  async getAllLeads(tenantId: number, userId: number): Promise<Lead[]> {
    return await db.select().from(leads).where(eq(leads.tenantId, tenantId)).orderBy(desc(leads.createdAt));
  }

  async getLeadsByStatus(tenantId: number, userId: number, statusId: number): Promise<Lead[]> {
    return await db.select().from(leads).where(and(eq(leads.leadStatusId, statusId), eq(leads.tenantId, tenantId))).orderBy(desc(leads.createdAt));
  }

  async getLeadsBySource(tenantId: number, userId: number, sourceId: number): Promise<Lead[]> {
    return await db.select().from(leads).where(and(eq(leads.leadSourceId, sourceId), eq(leads.tenantId, tenantId))).orderBy(desc(leads.createdAt));
  }

  async getLeadsByAssignee(tenantId: number, userId: number, assigneeId: number): Promise<Lead[]> {
    return await db.select().from(leads).where(and(eq(leads.assignedTo, assigneeId), eq(leads.tenantId, tenantId))).orderBy(desc(leads.createdAt));
  }

  async getLeadsByPriority(tenantId: number, userId: number, priority: string): Promise<Lead[]> {
    return await db.select().from(leads).where(and(eq(leads.priority, priority), eq(leads.tenantId, tenantId))).orderBy(desc(leads.createdAt));
  }

  async getLeadsByTemperature(tenantId: number, userId: number, temperature: string): Promise<Lead[]> {
    return await db.select().from(leads).where(and(eq(leads.temperature, temperature), eq(leads.tenantId, tenantId))).orderBy(desc(leads.createdAt));
  }

  async searchLeads(tenantId: number, userId: number, query: string): Promise<Lead[]> {
    return await db.select().from(leads).where(
      and(
        eq(leads.tenantId, tenantId),
        or(
          ilike(leads.firstName, `%${query}%`),
          ilike(leads.lastName, `%${query}%`),
          ilike(leads.email, `%${query}%`),
          ilike(leads.phone, `%${query}%`),
          ilike(leads.company, `%${query}%`),
          ilike(leads.jobTitle, `%${query}%`)
        )
      )
    ).orderBy(desc(leads.createdAt));
  }

  async getLeadsWithFilters(tenantId: number, userId: number, filters: {
    status?: number;
    source?: number;
    assignee?: number;
    priority?: string;
    temperature?: string;
    score?: { min?: number; max?: number };
    value?: { min?: number; max?: number };
    tags?: string[];
    dateRange?: { start: Date; end: Date };
  }): Promise<Lead[]> {
    const conditions = [eq(leads.tenantId, tenantId)];

    if (filters.status) conditions.push(eq(leads.leadStatusId, filters.status));
    if (filters.source) conditions.push(eq(leads.leadSourceId, filters.source));
    if (filters.assignee) conditions.push(eq(leads.assignedTo, filters.assignee));
    if (filters.priority) conditions.push(eq(leads.priority, filters.priority));
    if (filters.temperature) conditions.push(eq(leads.temperature, filters.temperature));
    if (filters.score?.min) conditions.push(gte(leads.leadScore, filters.score.min));
    if (filters.score?.max) conditions.push(lte(leads.leadScore, filters.score.max));
    if (filters.value?.min) conditions.push(gte(leads.estimatedValue, filters.value.min.toString()));
    if (filters.value?.max) conditions.push(lte(leads.estimatedValue, filters.value.max.toString()));
    if (filters.dateRange?.start) conditions.push(gte(leads.createdAt, filters.dateRange.start));
    if (filters.dateRange?.end) conditions.push(lte(leads.createdAt, filters.dateRange.end));

    const whereClause = and(...conditions);

    return await db.select().from(leads).where(whereClause).orderBy(desc(leads.createdAt));
  }

  async getLeadStats(tenantId: number, userId: number): Promise<{
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
  }> {
    const allLeads = await this.getAllLeads(tenantId, userId);
    const total = allLeads.length;
    const new_ = allLeads.filter(l => l.temperature === 'cold').length;
    const qualified = allLeads.filter(l => l.isQualified).length;
    const converted = allLeads.filter(l => l.isConverted).length;
    const totalValue = allLeads.reduce((sum, l) => sum + parseFloat(l.estimatedValue || '0'), 0);
    const avgScore = total > 0 ? allLeads.reduce((sum, l) => sum + (l.leadScore || 0), 0) / total : 0;
    const conversionRate = total > 0 ? (converted / total) * 100 : 0;

    const byStatus: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const byAssignee: Record<string, number> = {};

    allLeads.forEach(lead => {
      if (lead.leadStatusId) {
        byStatus[lead.leadStatusId] = (byStatus[lead.leadStatusId] || 0) + 1;
      }
      if (lead.leadSourceId) {
        bySource[lead.leadSourceId] = (bySource[lead.leadSourceId] || 0) + 1;
      }
      if (lead.assignedTo) {
        byAssignee[lead.assignedTo] = (byAssignee[lead.assignedTo] || 0) + 1;
      }
    });

    return {
      total,
      new: new_,
      qualified,
      converted,
      totalValue,
      avgScore,
      conversionRate,
      byStatus,
      bySource,
      byAssignee
    };
  }

  // Lead Activities
  async getLeadActivity(userId: number, id: number): Promise<LeadActivity | undefined> {
    const [activity] = await db.select().from(leadActivities).where(and(eq(leadActivities.id, id), eq(leadActivities.userId, userId)));
    return activity || undefined;
  }

  async createLeadActivity(userId: number, activity: InsertLeadActivity): Promise<LeadActivity> {
    const activityData = {
      ...activity,
      userId: userId
    };
    const [created] = await db.insert(leadActivities).values(activityData).returning();
    return created;
  }

  async updateLeadActivity(userId: number, id: number, activity: Partial<InsertLeadActivity>): Promise<LeadActivity> {
    const [updated] = await db.update(leadActivities).set(activity).where(and(eq(leadActivities.id, id), eq(leadActivities.userId, userId))).returning();
    return updated;
  }

  async deleteLeadActivity(userId: number, id: number): Promise<void> {
    await db.delete(leadActivities).where(and(eq(leadActivities.id, id), eq(leadActivities.userId, userId)));
  }

  async getLeadActivities(userId: number, leadId: number): Promise<LeadActivity[]> {
    return await db.select().from(leadActivities).where(and(eq(leadActivities.leadId, leadId), eq(leadActivities.userId, userId))).orderBy(desc(leadActivities.createdAt));
  }

  async getLeadActivitiesByType(userId: number, leadId: number, type: string): Promise<LeadActivity[]> {
    return await db.select().from(leadActivities).where(
      and(eq(leadActivities.leadId, leadId), eq(leadActivities.type, type), eq(leadActivities.userId, userId))
    ).orderBy(desc(leadActivities.createdAt));
  }

  async getLeadActivitiesByUser(userId: number, targetUserId: number): Promise<LeadActivity[]> {
    return await db.select().from(leadActivities).where(and(eq(leadActivities.userId, targetUserId), eq(leadActivities.userId, userId))).orderBy(desc(leadActivities.createdAt));
  }

  async getRecentLeadActivities(userId: number, limit: number = 50): Promise<LeadActivity[]> {
    return await db.select().from(leadActivities).where(eq(leadActivities.userId, userId)).orderBy(desc(leadActivities.createdAt)).limit(limit);
  }

  // Lead Tasks
  async getLeadTask(userId: number, id: number): Promise<LeadTask | undefined> {
    const result = await db
      .select({ task: leadTasks })
      .from(leadTasks)
      .innerJoin(leads, eq(leadTasks.leadId, leads.id))
      .where(and(eq(leadTasks.id, id), eq(leads.userId, userId)));
    return result[0]?.task || undefined;
  }

  async createLeadTask(userId: number, task: InsertLeadTask): Promise<LeadTask> {
    const [created] = await db.insert(leadTasks).values(task).returning();
    return created;
  }

  async updateLeadTask(userId: number, id: number, task: Partial<InsertLeadTask>): Promise<LeadTask> {
    const result = await db
      .select({ task: leadTasks })
      .from(leadTasks)
      .innerJoin(leads, eq(leadTasks.leadId, leads.id))
      .where(and(eq(leadTasks.id, id), eq(leads.userId, userId)));
    
    if (!result[0]) {
      throw new Error('Task not found');
    }
    
    const [updated] = await db.update(leadTasks).set(task).where(eq(leadTasks.id, id)).returning();
    return updated;
  }

  async deleteLeadTask(userId: number, id: number): Promise<void> {
    const result = await db
      .select({ task: leadTasks })
      .from(leadTasks)
      .innerJoin(leads, eq(leadTasks.leadId, leads.id))
      .where(and(eq(leadTasks.id, id), eq(leads.userId, userId)));
    
    if (result[0]) {
      await db.delete(leadTasks).where(eq(leadTasks.id, id));
    }
  }

  async getLeadTasks(userId: number, leadId: number): Promise<LeadTask[]> {
    const result = await db
      .select({ task: leadTasks })
      .from(leadTasks)
      .innerJoin(leads, eq(leadTasks.leadId, leads.id))
      .where(and(eq(leadTasks.leadId, leadId), eq(leads.userId, userId)))
      .orderBy(desc(leadTasks.createdAt));
    return result.map(r => r.task);
  }

  async getLeadTasksByAssignee(userId: number, assigneeId: number): Promise<LeadTask[]> {
    const result = await db
      .select({ task: leadTasks })
      .from(leadTasks)
      .innerJoin(leads, eq(leadTasks.leadId, leads.id))
      .where(and(eq(leadTasks.assignedTo, assigneeId), eq(leads.userId, userId)))
      .orderBy(desc(leadTasks.createdAt));
    return result.map(r => r.task);
  }

  async getLeadTasksByStatus(userId: number, status: string): Promise<LeadTask[]> {
    const result = await db
      .select({ task: leadTasks })
      .from(leadTasks)
      .innerJoin(leads, eq(leadTasks.leadId, leads.id))
      .where(and(eq(leadTasks.status, status), eq(leads.userId, userId)))
      .orderBy(desc(leadTasks.createdAt));
    return result.map(r => r.task);
  }

  async getOverdueTasks(userId: number): Promise<LeadTask[]> {
    const result = await db
      .select({ task: leadTasks })
      .from(leadTasks)
      .innerJoin(leads, eq(leadTasks.leadId, leads.id))
      .where(
        and(
          eq(leadTasks.status, 'pending'),
          lt(leadTasks.dueDate, new Date()),
          eq(leads.userId, userId)
        )
      )
      .orderBy(asc(leadTasks.dueDate));
    return result.map(r => r.task);
  }

  async getUpcomingTasks(userId: number, days: number = 7): Promise<LeadTask[]> {
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
          eq(leads.userId, userId)
        )
      )
      .orderBy(asc(leadTasks.dueDate));
    return result.map(r => r.task);
  }

  // Lead Scoring
  async getLeadScoring(userId: number, id: number): Promise<LeadScoring | undefined> {
    const [scoring] = await db.select().from(leadScoring).where(and(eq(leadScoring.id, id), eq(leadScoring.userId, userId)));
    return scoring || undefined;
  }

  async getLeadScoringByLead(userId: number, leadId: number): Promise<LeadScoring[]> {
    return await db.select().from(leadScoring).where(and(eq(leadScoring.leadId, leadId), eq(leadScoring.userId, userId))).orderBy(desc(leadScoring.createdAt));
  }

  async createLeadScoring(userId: number, scoring: InsertLeadScoring): Promise<LeadScoring> {
    const scoringData = {
      ...scoring,
      userId: userId
    };
    const [created] = await db.insert(leadScoring).values(scoringData).returning();
    return created;
  }

  async updateLeadScoring(userId: number, id: number, scoring: Partial<InsertLeadScoring>): Promise<LeadScoring> {
    const [updated] = await db.update(leadScoring).set(scoring).where(and(eq(leadScoring.id, id), eq(leadScoring.userId, userId))).returning();
    return updated;
  }

  async deleteLeadScoring(userId: number, id: number): Promise<void> {
    await db.delete(leadScoring).where(and(eq(leadScoring.id, id), eq(leadScoring.userId, userId)));
  }

  async getLeadScoringHistory(userId: number, leadId: number): Promise<LeadScoring[]> {
    return await db.select().from(leadScoring).where(and(eq(leadScoring.leadId, leadId), eq(leadScoring.userId, userId))).orderBy(desc(leadScoring.createdAt));
  }

  // Lead Nurturing
  async getLeadNurturing(userId: number, id: number): Promise<LeadNurturing | undefined> {
    const [nurturing] = await db.select().from(leadNurturing).where(and(eq(leadNurturing.id, id), eq(leadNurturing.userId, userId)));
    return nurturing || undefined;
  }

  async getLeadNurturingByLead(userId: number, leadId: number): Promise<LeadNurturing[]> {
    return await db.select().from(leadNurturing).where(and(eq(leadNurturing.leadId, leadId), eq(leadNurturing.userId, userId))).orderBy(desc(leadNurturing.createdAt));
  }

  async createLeadNurturing(userId: number, nurturing: InsertLeadNurturing): Promise<LeadNurturing> {
    const nurturingData = {
      ...nurturing,
      userId: userId
    };
    const [created] = await db.insert(leadNurturing).values(nurturingData).returning();
    return created;
  }

  async updateLeadNurturing(userId: number, id: number, nurturing: Partial<InsertLeadNurturing>): Promise<LeadNurturing> {
    const [updated] = await db.update(leadNurturing).set(nurturing).where(and(eq(leadNurturing.id, id), eq(leadNurturing.userId, userId))).returning();
    return updated;
  }

  async deleteLeadNurturing(userId: number, id: number): Promise<void> {
    await db.delete(leadNurturing).where(and(eq(leadNurturing.id, id), eq(leadNurturing.userId, userId)));
  }

  async getActiveNurturingSequences(userId: number): Promise<LeadNurturing[]> {
    return await db.select().from(leadNurturing).where(and(eq(leadNurturing.status, 'active'), eq(leadNurturing.userId, userId))).orderBy(desc(leadNurturing.createdAt));
  }

  async getNurturingSequencesByStatus(userId: number, status: string): Promise<LeadNurturing[]> {
    return await db.select().from(leadNurturing).where(and(eq(leadNurturing.status, status), eq(leadNurturing.userId, userId))).orderBy(desc(leadNurturing.createdAt));
  }

  // Contact Lists
  async getContactList(userId: number, id: number): Promise<ContactList | undefined> {
    const [list] = await db.select().from(contactLists).where(and(eq(contactLists.id, id), eq(contactLists.userId, userId)));
    return list || undefined;
  }

  async getContactListByName(userId: number, name: string): Promise<ContactList | undefined> {
    const [list] = await db.select().from(contactLists).where(and(eq(contactLists.name, name), eq(contactLists.userId, userId)));
    return list || undefined;
  }

  async createContactList(userId: number, list: InsertContactList): Promise<ContactList> {
    const listData = { ...list, userId };
    const [created] = await db.insert(contactLists).values(listData).returning();
    return created;
  }

  async updateContactList(userId: number, id: number, list: Partial<InsertContactList>): Promise<ContactList> {
    const [updated] = await db.update(contactLists).set(list).where(and(eq(contactLists.id, id), eq(contactLists.userId, userId))).returning();
    return updated;
  }

  async deleteContactList(userId: number, id: number): Promise<void> {
    // First, remove all memberships
    await db.delete(contactListMemberships).where(and(eq(contactListMemberships.listId, id), eq(contactListMemberships.userId, userId)));
    // Then delete the list
    await db.delete(contactLists).where(and(eq(contactLists.id, id), eq(contactLists.userId, userId)));
  }

  async getAllContactLists(userId: number): Promise<ContactList[]> {
    return await db.select().from(contactLists).where(eq(contactLists.userId, userId)).orderBy(asc(contactLists.name));
  }

  async getContactListsByCategory(userId: number, category: string): Promise<ContactList[]> {
    return await db.select().from(contactLists).where(and(eq(contactLists.category, category), eq(contactLists.userId, userId))).orderBy(asc(contactLists.name));
  }

  async getContactListsByType(userId: number, type: string): Promise<ContactList[]> {
    return await db.select().from(contactLists).where(and(eq(contactLists.type, type), eq(contactLists.userId, userId))).orderBy(asc(contactLists.name));
  }

  // Contact List Memberships
  async getContactListMembership(userId: number, id: number): Promise<ContactListMembership | undefined> {
    const [membership] = await db.select().from(contactListMemberships).where(and(eq(contactListMemberships.id, id), eq(contactListMemberships.userId, userId)));
    return membership || undefined;
  }

  async createContactListMembership(userId: number, membership: InsertContactListMembership): Promise<ContactListMembership> {
    const membershipData = { ...membership, userId };
    const [created] = await db.insert(contactListMemberships).values(membershipData).returning();
    
    // Update contact count in the list
    const contactCount = await db.select({ count: count() })
      .from(contactListMemberships)
      .where(and(
        eq(contactListMemberships.listId, membership.listId),
        eq(contactListMemberships.status, 'active'),
        eq(contactListMemberships.userId, userId)
      ));
    
    await db.update(contactLists)
      .set({ 
        contactCount: contactCount[0].count,
        lastContactAdded: new Date()
      })
      .where(and(eq(contactLists.id, membership.listId), eq(contactLists.userId, userId)));

    return created;
  }

  async updateContactListMembership(userId: number, id: number, membership: Partial<InsertContactListMembership>): Promise<ContactListMembership> {
    const [updated] = await db.update(contactListMemberships).set(membership).where(and(eq(contactListMemberships.id, id), eq(contactListMemberships.userId, userId))).returning();
    return updated;
  }

  async deleteContactListMembership(userId: number, id: number): Promise<void> {
    const membership = await this.getContactListMembership(userId, id);
    if (membership) {
      await db.delete(contactListMemberships).where(and(eq(contactListMemberships.id, id), eq(contactListMemberships.userId, userId)));
      
      // Update contact count in the list
      const contactCount = await db.select({ count: count() })
        .from(contactListMemberships)
        .where(and(
          eq(contactListMemberships.listId, membership.listId),
          eq(contactListMemberships.status, 'active'),
          eq(contactListMemberships.userId, userId)
        ));
      
      await db.update(contactLists)
        .set({ contactCount: contactCount[0].count })
        .where(and(eq(contactLists.id, membership.listId), eq(contactLists.userId, userId)));
    }
  }

  async getContactListMemberships(userId: number, listId: number): Promise<ContactListMembership[]> {
    return await db.select().from(contactListMemberships).where(and(eq(contactListMemberships.listId, listId), eq(contactListMemberships.userId, userId))).orderBy(desc(contactListMemberships.addedAt));
  }

  async getContactMemberships(userId: number, contactId: number): Promise<ContactListMembership[]> {
    return await db.select().from(contactListMemberships).where(and(eq(contactListMemberships.contactId, contactId), eq(contactListMemberships.userId, userId))).orderBy(desc(contactListMemberships.addedAt));
  }

  async addContactToList(userId: number, contactId: number, listId: number, addedBy?: number): Promise<ContactListMembership> {
    // Check if already exists
    const existing = await db.select().from(contactListMemberships)
      .where(and(
        eq(contactListMemberships.contactId, contactId),
        eq(contactListMemberships.listId, listId),
        eq(contactListMemberships.userId, userId)
      ));

    if (existing.length > 0) {
      // Update status to active if it exists
      const [updated] = await db.update(contactListMemberships)
        .set({ status: 'active' })
        .where(and(eq(contactListMemberships.id, existing[0].id), eq(contactListMemberships.userId, userId)))
        .returning();
      return updated;
    }

    // Create new membership
    return await this.createContactListMembership(userId, {
      userId,
      contactId,
      listId,
      addedBy,
      status: 'active'
    });
  }

  async removeContactFromList(userId: number, contactId: number, listId: number): Promise<void> {
    await db.delete(contactListMemberships)
      .where(and(
        eq(contactListMemberships.contactId, contactId),
        eq(contactListMemberships.listId, listId),
        eq(contactListMemberships.userId, userId)
      ));
    
    // Update contact count in the list
    const contactCount = await db.select({ count: count() })
      .from(contactListMemberships)
      .where(and(
        eq(contactListMemberships.listId, listId),
        eq(contactListMemberships.status, 'active'),
        eq(contactListMemberships.userId, userId)
      ));
    
    await db.update(contactLists)
      .set({ contactCount: contactCount[0].count })
      .where(and(eq(contactLists.id, listId), eq(contactLists.userId, userId)));
  }

  async getContactsInList(userId: number, listId: number): Promise<Contact[]> {
    const result = await db
      .select()
      .from(contacts)
      .innerJoin(contactListMemberships, eq(contacts.id, contactListMemberships.contactId))
      .where(and(
        eq(contactListMemberships.listId, listId),
        eq(contactListMemberships.status, 'active'),
        eq(contacts.userId, userId)
      ))
      .orderBy(asc(contacts.name));

    return result.map(r => r.contacts);
  }

  // AI Lead Scoring
  async getAiLeadScore(userId: number, contactId: number): Promise<AiLeadScore | undefined> {
    const [score] = await db.select()
      .from(aiLeadScores)
      .where(and(
        eq(aiLeadScores.userId, userId),
        eq(aiLeadScores.contactId, contactId)
      ))
      .orderBy(desc(aiLeadScores.lastCalculated))
      .limit(1);
    return score || undefined;
  }

  async upsertAiLeadScore(userId: number, score: Omit<InsertAiLeadScore, 'userId'>): Promise<AiLeadScore> {
    // Check if score exists for this contact
    const existing = await this.getAiLeadScore(userId, score.contactId);

    if (existing) {
      // Update existing score
      const [updated] = await db.update(aiLeadScores)
        .set({
          ...score,
          updatedAt: new Date(),
          lastCalculated: new Date(),
        })
        .where(and(
          eq(aiLeadScores.userId, userId),
          eq(aiLeadScores.contactId, score.contactId)
        ))
        .returning();
      return updated;
    } else {
      // Create new score
      const [newScore] = await db.insert(aiLeadScores)
        .values({
          ...score,
          userId,
        })
        .returning();
      return newScore;
    }
  }

  async getTopScoredContacts(userId: number, limit: number): Promise<Array<Contact & { aiScore: AiLeadScore }>> {
    const result = await db
      .select()
      .from(contacts)
      .innerJoin(aiLeadScores, and(
        eq(contacts.id, aiLeadScores.contactId),
        eq(aiLeadScores.userId, userId)
      ))
      .where(eq(contacts.userId, userId))
      .orderBy(desc(aiLeadScores.overallScore))
      .limit(limit);

    return result.map(r => ({
      ...r.contacts,
      aiScore: r.ai_lead_scores
    }));
  }

  // Call Intelligence
  async getCallIntelligence(userId: number, callId: number): Promise<CallIntelligence | undefined> {
    const [intelligence] = await db.select()
      .from(callIntelligence)
      .where(and(
        eq(callIntelligence.userId, userId),
        eq(callIntelligence.callId, callId)
      ));
    return intelligence || undefined;
  }

  async createCallIntelligence(userId: number, intelligence: Omit<InsertCallIntelligence, 'userId'>): Promise<CallIntelligence> {
    const [newIntelligence] = await db.insert(callIntelligence)
      .values({
        ...intelligence,
        userId,
      })
      .returning();
    return newIntelligence;
  }

  async updateCallIntelligence(userId: number, id: number, intelligence: Partial<InsertCallIntelligence>): Promise<CallIntelligence> {
    const [updated] = await db.update(callIntelligence)
      .set({
        ...intelligence,
        updatedAt: new Date(),
      })
      .where(and(
        eq(callIntelligence.id, id),
        eq(callIntelligence.userId, userId)
      ))
      .returning();
    return updated;
  }

  // AI Insights
  async getAiInsight(userId: number, id: number): Promise<AiInsight | undefined> {
    const [insight] = await db.select()
      .from(aiInsights)
      .where(and(
        eq(aiInsights.id, id),
        eq(aiInsights.userId, userId)
      ));
    return insight || undefined;
  }

  async getAiInsights(userId: number, filters: { status?: string; type?: string }): Promise<AiInsight[]> {
    const conditions = [eq(aiInsights.userId, userId)];
    
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

  async createAiInsight(userId: number, insight: Omit<InsertAiInsight, 'userId'>): Promise<AiInsight> {
    const [newInsight] = await db.insert(aiInsights)
      .values({
        ...insight,
        userId,
      })
      .returning();
    return newInsight;
  }

  async updateAiInsight(userId: number, id: number, insight: Partial<InsertAiInsight>): Promise<AiInsight> {
    const [updated] = await db.update(aiInsights)
      .set({
        ...insight,
        updatedAt: new Date(),
      })
      .where(and(
        eq(aiInsights.id, id),
        eq(aiInsights.userId, userId)
      ))
      .returning();
    return updated;
  }

  async deleteAiInsight(userId: number, id: number): Promise<void> {
    await db.delete(aiInsights)
      .where(and(
        eq(aiInsights.id, id),
        eq(aiInsights.userId, userId)
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
}

export const storage = new DatabaseStorage();
