import { storage } from "./storage";
import type { 
  InsertSmsTemplate, 
  InsertSmsCampaign,
  InsertLeadSource,
  InsertLeadStatus,
  InsertLeadCampaign,
  InsertLead,
  InsertContactList,
  InsertContactListMembership
} from "@shared/schema";

export async function seedSmsData() {
  try {
    const adminUser = await storage.getUserByEmail('admin@demonflare.com');
    if (!adminUser) {
      console.log("⚠️ Admin user not found, skipping SMS data seed");
      return;
    }

    // Create some sample SMS templates
    const templates: InsertSmsTemplate[] = [
      {
        name: "Welcome Message",
        content: "Hi {{name}}, welcome to our service! We're excited to help you get started.",
        category: "general",
        variables: ["name"],
        tags: ["welcome", "onboarding"]
      },
      {
        name: "Appointment Reminder",
        content: "Hi {{name}}, this is a reminder about your appointment on {{date}} at {{time}}. Please call if you need to reschedule.",
        category: "support",
        variables: ["name", "date", "time"],
        tags: ["appointment", "reminder"]
      },
      {
        name: "Follow-up Message",
        content: "Hi {{name}}, thank you for your interest in our {{product}}. Do you have any questions I can help with?",
        category: "sales",
        variables: ["name", "product"],
        tags: ["follow-up", "sales"]
      },
      {
        name: "Order Status Update",
        content: "Hi {{name}}, your order #{{order_id}} has been {{status}}. You can track it here: {{tracking_url}}",
        category: "support",
        variables: ["name", "order_id", "status", "tracking_url"],
        tags: ["order", "status", "tracking"]
      },
      {
        name: "Thank You Message",
        content: "Thank you for choosing {{company}}, {{name}}! We appreciate your business and look forward to serving you again.",
        category: "general",
        variables: ["name", "company"],
        tags: ["thanks", "appreciation"]
      },
      {
        name: "Meeting Confirmation",
        content: "Hi {{name}}, your meeting with {{person}} is confirmed for {{date}} at {{time}}. Location: {{location}}",
        category: "general",
        variables: ["name", "person", "date", "time", "location"],
        tags: ["meeting", "confirmation"]
      },
      {
        name: "Payment Reminder",
        content: "Hi {{name}}, this is a friendly reminder that your payment of {{amount}} is due on {{due_date}}. Please contact us if you have any questions.",
        category: "support",
        variables: ["name", "amount", "due_date"],
        tags: ["payment", "reminder", "billing"]
      },
      {
        name: "Holiday Greetings",
        content: "Happy {{holiday}}, {{name}}! From all of us at {{company}}, we wish you and your family a wonderful celebration.",
        category: "marketing",
        variables: ["name", "holiday", "company"],
        tags: ["holiday", "greetings", "marketing"]
      }
    ];

    // Create templates
    for (const template of templates) {
      await storage.createSmsTemplate(adminUser.id, 1, template);
    }

    console.log("✅ SMS templates seeded successfully");

    // Create some sample campaigns
    const campaigns: InsertSmsCampaign[] = [
      {
        name: "Welcome Campaign",
        description: "Welcome new customers to our platform",
        status: "completed",
        totalRecipients: 150,
        completedAt: new Date(Date.now() - 24 * 60 * 60 * 1000) // 1 day ago
      },
      {
        name: "Monthly Newsletter",
        description: "Monthly updates and promotions",
        status: "completed",
        totalRecipients: 500,
        completedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 1 week ago
      },
      {
        name: "Product Launch",
        description: "Announce new product features",
        status: "scheduled",
        totalRecipients: 300,
        sendAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) // 2 days from now
      }
    ];

    // Create campaigns
    for (const campaign of campaigns) {
      await storage.createSmsCampaign(adminUser.id, 1, campaign);
    }

    console.log("✅ SMS campaigns seeded successfully");

  } catch (error) {
    console.error("Error seeding SMS data:", error);
  }
}

export async function seedLeadData() {
  try {
    const adminUser = await storage.getUserByEmail('admin@demonflare.com');
    if (!adminUser) {
      console.log("⚠️ Admin user not found, skipping lead data seed");
      return;
    }

    // Create lead sources with duplicate check
    const sources: InsertLeadSource[] = [
      {
        name: "Website",
        type: "website",
        description: "Organic website visitors and contact form submissions",
        color: "#3B82F6",
        isActive: true,
        cost: "0",
        conversionRate: "15.5"
      },
      {
        name: "Google Ads",
        type: "ads",
        description: "Paid search advertising campaigns",
        color: "#10B981",
        isActive: true,
        cost: "2500",
        conversionRate: "8.2"
      },
      {
        name: "Facebook Ads",
        type: "social",
        description: "Social media advertising campaigns",
        color: "#8B5CF6",
        isActive: true,
        cost: "1800",
        conversionRate: "12.3"
      },
      {
        name: "LinkedIn",
        type: "social",
        description: "Professional networking and content marketing",
        color: "#0EA5E9",
        isActive: true,
        cost: "500",
        conversionRate: "22.1"
      },
      {
        name: "Referral",
        type: "referral",
        description: "Customer referrals and word-of-mouth",
        color: "#F59E0B",
        isActive: true,
        cost: "200",
        conversionRate: "35.8"
      },
      {
        name: "Trade Show",
        type: "event",
        description: "Industry events and exhibitions",
        color: "#EF4444",
        isActive: true,
        cost: "5000",
        conversionRate: "28.4"
      },
      {
        name: "Cold Outreach",
        type: "cold_call",
        description: "Proactive sales outreach campaigns",
        color: "#6B7280",
        isActive: true,
        cost: "1200",
        conversionRate: "6.7"
      }
    ];

    let sourcesCreated = 0;
    for (const source of sources) {
      try {
        const existing = await storage.getLeadSourceByName(1, source.name);
        if (!existing) {
          await storage.createLeadSource(1, source);
          sourcesCreated++;
        }
      } catch (error: any) {
        if (error?.code === '23505') {
          console.log(`⚠️ Lead source "${source.name}" already exists globally, skipping`);
        } else {
          throw error;
        }
      }
    }

    if (sourcesCreated > 0) {
      console.log(`✅ Lead sources seeded successfully (${sourcesCreated} created)`);
    } else {
      console.log("✅ Lead sources already exist, skipping seed");
    }

    // Create lead statuses with duplicate check
    const statuses: InsertLeadStatus[] = [
      {
        name: "New",
        stage: "new",
        description: "Recently acquired leads that need initial qualification",
        color: "#3B82F6",
        sortOrder: 1,
        isActive: true
      },
      {
        name: "Contacted",
        stage: "contacted",
        description: "Initial contact has been made with the lead",
        color: "#10B981",
        sortOrder: 2,
        isActive: true
      },
      {
        name: "Qualified",
        stage: "qualified",
        description: "Lead has been qualified and shows genuine interest",
        color: "#8B5CF6",
        sortOrder: 3,
        isActive: true
      },
      {
        name: "Proposal Sent",
        stage: "proposal",
        description: "Proposal or quote has been sent to the lead",
        color: "#F59E0B",
        sortOrder: 4,
        isActive: true
      },
      {
        name: "Negotiation",
        stage: "negotiation",
        description: "In active negotiation with the lead",
        color: "#EF4444",
        sortOrder: 5,
        isActive: true
      },
      {
        name: "Closed Won",
        stage: "closed-won",
        description: "Successfully converted to customer",
        color: "#059669",
        sortOrder: 6,
        isActive: true
      },
      {
        name: "Closed Lost",
        stage: "closed-lost",
        description: "Lead was not converted",
        color: "#DC2626",
        sortOrder: 7,
        isActive: true
      },
      {
        name: "Nurturing",
        stage: "new",
        description: "Long-term nurturing for future opportunities",
        color: "#7C3AED",
        sortOrder: 8,
        isActive: true
      }
    ];

    let statusesCreated = 0;
    for (const status of statuses) {
      try {
        const existing = await storage.getLeadStatusByName(1, status.name);
        if (!existing) {
          await storage.createLeadStatus(1, status);
          statusesCreated++;
        }
      } catch (error: any) {
        if (error?.code === '23505') {
          console.log(`⚠️ Lead status "${status.name}" already exists globally, skipping`);
        } else {
          throw error;
        }
      }
    }

    if (statusesCreated > 0) {
      console.log(`✅ Lead statuses seeded successfully (${statusesCreated} created)`);
    } else {
      console.log("✅ Lead statuses already exist, skipping seed");
    }

    // Create lead campaigns
    const campaigns: InsertLeadCampaign[] = [
      {
        name: "Q4 2024 Enterprise Push",
        description: "Focused campaign targeting enterprise clients for Q4 sales",
        type: "sales",
        status: "active",
        startDate: new Date("2024-10-01"),
        endDate: new Date("2024-12-31"),
        budget: "50000",
        metrics: { targetLeads: 500, actualLeads: 342, conversionRate: 18.5 }
      },
      {
        name: "SMB Product Launch",
        description: "Product launch campaign for small and medium businesses",
        type: "marketing",
        status: "completed",
        startDate: new Date("2024-08-01"),
        endDate: new Date("2024-09-30"),
        budget: "25000",
        metrics: { targetLeads: 300, actualLeads: 289, conversionRate: 22.1 }
      },
      {
        name: "Holiday Promotion 2024",
        description: "Special holiday offers and promotions",
        type: "promotional",
        status: "scheduled",
        startDate: new Date("2024-11-15"),
        endDate: new Date("2024-12-25"),
        budget: "30000",
        metrics: { targetLeads: 400, actualLeads: 0, conversionRate: 0 }
      }
    ];

    for (const campaign of campaigns) {
      await storage.createLeadCampaign(adminUser.id, 1, campaign);
    }

    console.log("✅ Lead campaigns seeded successfully");

    // Create sample leads
    const leads: InsertLead[] = [
      {
        userId: adminUser.id,
        leadStatusId: 1, // New
        leadSourceId: 1, // Website
        company: "TechCorp Industries",
        jobTitle: "CTO",
        firstName: "John",
        lastName: "Smith",
        email: "john.smith@techcorp.com",
        phone: "+15550123",
        leadScore: 85,
        priority: "high",
        temperature: "hot",
        estimatedValue: "50000",
        tags: ["enterprise", "technology", "urgent"],
        notes: "Interested in our enterprise solution. Has budget approved for Q4.",
        nextFollowUpDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        lastContactDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
      },
      {
        userId: adminUser.id,
        leadStatusId: 2, // Contacted
        leadSourceId: 3, // Facebook Ads
        company: "StartupXYZ",
        jobTitle: "Founder",
        firstName: "Sarah",
        lastName: "Johnson",
        email: "sarah@startupxyz.com",
        phone: "+15550124",
        leadScore: 72,
        priority: "medium",
        temperature: "warm",
        estimatedValue: "15000",
        tags: ["startup", "saas", "growth"],
        notes: "Early-stage startup looking for cost-effective solutions. Very interested but budget limited.",
        nextFollowUpDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        lastContactDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      },
      {
        userId: adminUser.id,
        leadStatusId: 4, // Proposal Sent
        leadSourceId: 4, // LinkedIn
        company: "Global Manufacturing Co",
        jobTitle: "VP Operations",
        firstName: "Michael",
        lastName: "Brown",
        email: "m.brown@globalmanufacturing.com",
        phone: "+15550125",
        leadScore: 78,
        priority: "high",
        temperature: "warm",
        estimatedValue: "75000",
        tags: ["manufacturing", "large-enterprise", "proposal-sent"],
        notes: "Sent comprehensive proposal last week. They're evaluating against two other vendors. Decision expected by month-end.",
        nextFollowUpDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
        lastContactDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      },
      {
        userId: adminUser.id,
        leadStatusId: 3, // Qualified
        leadSourceId: 2, // Google Ads
        company: "HealthTech Solutions",
        jobTitle: "IT Director",
        firstName: "Emily",
        lastName: "Davis",
        email: "emily.davis@healthtech.com",
        phone: "+15550126",
        leadScore: 66,
        priority: "medium",
        temperature: "warm",
        estimatedValue: "30000",
        tags: ["healthcare", "compliance", "security"],
        notes: "Qualified lead with specific compliance requirements. Needs solution that meets HIPAA standards.",
        nextFollowUpDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
        lastContactDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
      },
      {
        userId: adminUser.id,
        leadStatusId: 1, // New
        leadSourceId: 5, // Referral
        company: "EduLearn Academy",
        jobTitle: "Technology Coordinator",
        firstName: "David",
        lastName: "Wilson",
        email: "d.wilson@edulearn.edu",
        phone: "+15550127",
        leadScore: 91,
        priority: "urgent",
        temperature: "hot",
        estimatedValue: "40000",
        tags: ["education", "referral", "high-priority"],
        notes: "Referred by our existing customer TechUniversity. Needs immediate solution for fall semester.",
        nextFollowUpDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000)
      },
      {
        userId: adminUser.id,
        leadStatusId: 5, // Negotiation
        leadSourceId: 6, // Trade Show
        company: "RetailChain Plus",
        jobTitle: "Chief Information Officer",
        firstName: "Lisa",
        lastName: "Anderson",
        email: "lisa.anderson@retailchain.com",
        phone: "+15550128",
        leadScore: 83,
        priority: "high",
        temperature: "hot",
        estimatedValue: "120000",
        tags: ["retail", "multi-location", "negotiation"],
        notes: "In final negotiations. They want volume discount for 50+ locations. Legal reviewing contract terms.",
        nextFollowUpDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
        lastContactDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
      },
      {
        userId: adminUser.id,
        leadStatusId: 8, // Nurturing
        leadSourceId: 7, // Cold Outreach
        company: "Financial Services Group",
        jobTitle: "Senior Manager",
        firstName: "Robert",
        lastName: "Taylor",
        email: "robert.taylor@financialsg.com",
        phone: "+15550129",
        leadScore: 45,
        priority: "low",
        temperature: "cold",
        estimatedValue: "25000",
        tags: ["financial", "long-term", "nurturing"],
        notes: "Not ready to purchase yet but expressed future interest. Follow up in 6 months.",
        nextFollowUpDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
        lastContactDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      },
      {
        userId: adminUser.id,
        leadStatusId: 2, // Contacted
        leadSourceId: 1, // Website
        company: "Innovation Labs",
        jobTitle: "Research Director",
        firstName: "Jennifer",
        lastName: "Martinez",
        email: "j.martinez@innovationlabs.com",
        phone: "+15550130",
        leadScore: 58,
        priority: "medium",
        temperature: "warm",
        estimatedValue: "35000",
        tags: ["research", "innovation", "pilot-program"],
        notes: "Interested in pilot program to test our solution. Academic pricing discussed.",
        nextFollowUpDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        lastContactDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
      }
    ];

    const membership = await storage.ensureDefaultTenant(adminUser.id);
    const tenantId = membership.tenantId;

    console.log(`🌱 Seeding ${leads.length} leads for user ${adminUser.id} in tenant ${tenantId}...`);

    for (const lead of leads) {
      if (lead) {
        await storage.createLead(tenantId, adminUser.id, lead as any);
      }
    }

    console.log("✅ Lead data seeded successfully");

  } catch (error) {
    console.error("Error seeding lead data:", error);
  }
}

export async function seedContactLists() {
  try {
    const adminUser = await storage.getUserByEmail('admin@demonflare.com');
    if (!adminUser) {
      console.log("⚠️ Admin user not found, skipping contact lists seed");
      return;
    }

    // Check if contact lists already exist
    const existingLists = await storage.getAllContactLists();
    if (existingLists.length > 0) {
      console.log("✅ Contact lists already exist, skipping seed");
      return;
    }

    console.log("🌱 Seeding contact lists...");

    const contactLists: InsertContactList[] = [
      {
        name: "Sales Prospects",
        description: "High-priority sales prospects for Q1 2025",
        ownerId: 1,
        category: "sales",
        type: "custom",
        status: "active",
        tags: ["sales", "prospects", "Q1"],
        visibility: "private",
        priority: "high"
      },
      {
        name: "VIP Customers",
        description: "High-value customers requiring special attention",
        ownerId: 1,
        category: "sales",
        type: "custom",
        status: "active",
        tags: ["vip", "priority", "customer"],
        visibility: "private",
        priority: "high"
      },
      {
        name: "Marketing Campaign - Winter 2025",
        description: "Contacts targeted for winter promotion campaign",
        ownerId: 1,
        category: "marketing",
        type: "custom",
        status: "active",
        tags: ["marketing", "winter", "promotion"],
        visibility: "team",
        priority: "medium"
      },
      {
        name: "Tech Industry Leads",
        description: "Technology sector contacts and prospects",
        ownerId: 1,
        category: "sales",
        type: "custom",
        status: "active",
        tags: ["tech", "industry", "leads"],
        visibility: "private",
        priority: "medium"
      },
      {
        name: "Support Follow-ups",
        description: "Customers requiring follow-up support",
        ownerId: 1,
        category: "support",
        type: "custom",
        status: "active",
        tags: ["support", "follow-up"],
        visibility: "team",
        priority: "medium"
      }
    ];

    // Create contact lists
    const createdLists = [];
    for (const list of contactLists) {
      const created = await storage.createContactList(1, { ...list, userId: adminUser.id });
      createdLists.push(created);
    }

    // Add some contacts to the lists
    const allContacts = await storage.getAllContacts(adminUser.id);
    if (allContacts.length > 0) {
      // Add first 3 contacts to Sales Prospects
      if (allContacts.length >= 3) {
        for (let i = 0; i < 3; i++) {
          await storage.addContactToList(adminUser.id, allContacts[i].id, createdLists[0].id, adminUser.id);
        }
      }

      // Add contacts 2-4 to VIP Customers
      if (allContacts.length >= 4) {
        for (let i = 1; i < 4; i++) {
          await storage.addContactToList(adminUser.id, allContacts[i].id, createdLists[1].id, adminUser.id);
        }
      }

      // Add contacts to Marketing Campaign
      if (allContacts.length >= 5) {
        for (let i = 0; i < Math.min(5, allContacts.length); i++) {
          await storage.addContactToList(adminUser.id, allContacts[i].id, createdLists[2].id, adminUser.id);
        }
      }

      // Add tech-related contacts to Tech Industry Leads
      if (allContacts.length >= 2) {
        for (let i = 0; i < Math.min(2, allContacts.length); i++) {
          await storage.addContactToList(adminUser.id, allContacts[i].id, createdLists[3].id, adminUser.id);
        }
      }
    }

    console.log("✅ Contact lists seeded successfully");

  } catch (error) {
    console.error("Error seeding contact lists:", error);
  }
}