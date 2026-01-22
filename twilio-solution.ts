
import { drizzle } from 'drizzle-orm/node-postgres';
import { integer, pgTable, serial, text, varchar, boolean, timestamp } from 'drizzle-orm/pg-core';
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

import twilio from 'twilio';
import express, { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { AsyncLocalStorage } from 'async_hooks';
import * as crypto from 'crypto';

// Assume a shared database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const db = drizzle(pool);

// Assume encryption functions are defined in encryption.ts
// For demonstration, using simple stubs
const encrypt = (text: string) => `enc_${text}`;
const decrypt = (text: string) => text.replace('enc_', '');

// ###################################################################################
// ## Phase 1: Database & Schema Preparation
// ###################################################################################

/**
 * ## Credential Storage
 * Encrypted fields for Twilio credentials in the `tenants` table.
 */
export const tenants = pgTable('tenants', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 256 }).notNull(),
  twilioAccountSid: text('twilio_account_sid'),
  twilioAuthToken: text('twilio_auth_token'), // Encrypted
  twilioApiKeySid: text('twilio_api_key_sid'),
  twilioApiKeySecret: text('twilio_api_key_secret'), // Encrypted
  twilioPhoneNumber: varchar('twilio_phone_number', { length: 20 }),
});

/**
 * ## Tenant Isolation
 * Twilio-related tables with `tenantId` for data isolation.
 */
export const calls = pgTable('calls', {
  id: serial('id').primaryKey(),
  sid: varchar('sid', { length: 34 }).unique().notNull(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  from: varchar('from', { length: 20 }),
  to: varchar('to', { length: 20 }),
  status: varchar('status', { length: 20 }),
  createdAt: timestamp('created_at').defaultNow(),
});

export const messages = pgTable('messages', {
    id: serial('id').primaryKey(),
    sid: varchar('sid', { length: 34 }).unique().notNull(),
    tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    from: varchar('from', { length: 20 }),
    to: varchar('to', { length: 20 }),
    body: text('body'),
    status: varchar('status', { length: 20 }),
    createdAt: timestamp('created_at').defaultNow(),
});

export const recordings = pgTable('recordings', {
    id: serial('id').primaryKey(),
    sid: varchar('sid', { length: 34 }).unique().notNull(),
    tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    callSid: varchar('call_sid', { length: 34 }),
    url: text('url'),
    duration: integer('duration'),
    createdAt: timestamp('created_at').defaultNow(),
});


/**
 * ## Settings Table
 * Tenant-scoped settings for global Twilio preferences.
 */
export const settings = pgTable('settings', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).unique().notNull(),
  autoRecordCalls: boolean('auto_record_calls').default(false),
});

// ###################################################################################
// ## Phase 2: Service Layer Refactoring
// ###################################################################################
const s3Client = new S3Client({ region: process.env.AWS_REGION });

class RecordingService {
  async getRecordingUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
    });
    // Generate a presigned URL valid for 1 hour
    return getSignedUrl(s3Client, command, { expiresIn: 3600 });
  }
}

const recordingService = new RecordingService();
class UserTwilioClientCache {
    private clientCache = new Map<number, twilio.Twilio>();

    async getClient(tenantId: number): Promise<twilio.Twilio | null> {
        if (this.clientCache.has(tenantId)) {
            return this.clientCache.get(tenantId)!;
        }

        const tenant = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
        if (!tenant.length || !tenant[0].twilioAccountSid || !tenant[0].twilioAuthToken) {
            return null;
        }

        const client = twilio(tenant[0].twilioAccountSid, decrypt(tenant[0].twilioAuthToken));
        this.clientCache.set(tenantId, client);
        return client;
    }

    invalidate(tenantId: number) {
        this.clientCache.delete(tenantId);
    }
}

const userTwilioClientCache = new UserTwilioClientCache();

async function getTenantCredentials(tenantId: number) {
    const tenant = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!tenant.length) {
        throw new Error('Tenant not found');
    }
    return tenant[0];
}

class TwiMLAppService {
    async ensureTwiMLApp(tenantId: number): Promise<string> {
        const client = await userTwilioClientCache.getClient(tenantId);
        if (!client) {
            throw new Error('Twilio client not available for tenant');
        }

        const friendlyName = `TwiMLApp_Tenant_${tenantId}`;
        const apps = await client.applications.list({ friendlyName });

        if (apps.length > 0) {
            const app = apps[0];
            const webhookUrl = `${process.env.BASE_URL}/api/twilio/voice`;
            if (app.voiceUrl !== webhookUrl) {
                await client.applications(app.sid).update({ voiceUrl: webhookUrl });
            }
            return app.sid;
        } else {
            const newApp = await client.applications.create({
                friendlyName,
                voiceUrl: `${process.env.BASE_URL}/api/twilio/voice`,
                voiceMethod: 'POST',
            });
            return newApp.sid;
        }
    }
}
const twiMLAppService = new TwiMLAppService();
// ###################################################################################
// ## Phase 3: Middleware & Context
// ###################################################################################

export const asyncLocalStorage = new AsyncLocalStorage<{ tenantId: number }>();

function tenantIdentifier(req: Request, res: Response, next: NextFunction) {
    const tenantId = parseInt(req.headers['x-tenant-id'] as string, 10);
    if (!tenantId) {
        return res.status(400).send('Tenant ID is required');
    }
    asyncLocalStorage.run({ tenantId }, next);
}

// ###################################################################################
// ## Phase 4: Route & Controller Updates
// ###################################################################################

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.post('/api/twilio/voice', twilio.webhook(), async (req, res) => {
    const { From, To, CallSid } = req.body;
    // Extract tenantId from a query parameter in the webhook URL
    const tenantId = parseInt(req.query.tenantId as string, 10);

    if (!tenantId) {
        console.error('Webhook received without tenantId');
        return res.status(400).send('Missing tenantId');
    }

    try {
        await db.insert(calls).values({
            sid: CallSid,
            tenantId: tenantId,
            from: From,
            to: To,
            status: 'initiated',
        });

        const twiml = new twilio.twiml.VoiceResponse();
        twiml.say('Hello from your multi-tenant Twilio application!');
        res.type('text/xml');
        res.send(twiml.toString());
    } catch (error) {
        console.error('Error handling voice webhook:', error);
        res.status(500).send('Internal Server Error');
    }
});


app.post('/api/token', tenantIdentifier, async (req, res) => {
    const store = asyncLocalStorage.getStore();
    if (!store) {
        return res.status(500).send('Tenant context not found');
    }
    const { tenantId } = store;
    const { userId } = req.body; // Assume userId is passed for identity

    try {
        const credentials = await getTenantCredentials(tenantId);
        if (!credentials.twilioAccountSid || !credentials.twilioApiKeySid || !credentials.twilioApiKeySecret) {
            return res.status(400).send('Twilio credentials not configured for this tenant');
        }

        const appSid = await twiMLAppService.ensureTwiMLApp(tenantId);
        const AccessToken = twilio.jwt.AccessToken;
        const VoiceGrant = AccessToken.VoiceGrant;

        const voiceGrant = new VoiceGrant({
            outgoingApplicationSid: appSid,
            incomingAllow: true, 
        });

        const token = new AccessToken(
            credentials.twilioAccountSid,
            credentials.twilioApiKeySid,
            decrypt(credentials.twilioApiKeySecret),
            { identity: `user_${userId}_tenant_${tenantId}` }
        );
        token.addGrant(voiceGrant);

        res.json({ token: token.toJwt() });
    } catch (error) {
        console.error('Error generating token:', error);
        res.status(500).send('Failed to generate token');
    }
});


// ###################################################################################
// ## Phase 5: Verification & Monitoring
// ###################################################################################

async function verifyTwiMLAppWebhooks() {
    const allTenants = await db.select().from(tenants);
    for (const tenant of allTenants) {
        try {
            console.log(`Verifying TwiML App for tenant ${tenant.id}...`);
            await twiMLAppService.ensureTwiMLApp(tenant.id);
        } catch (error) {
            console.error(`Failed to verify TwiML App for tenant ${tenant.id}:`, error);
        }
    }
}

// Schedule this to run periodically, e.g., using a cron job
setInterval(verifyTwiMLAppWebhooks, 24 * 60 * 60 * 1000); // Once a day

app.get('/api/health/twilio', tenantIdentifier, async (req, res) => {
    const store = asyncLocalStorage.getStore();
    if (!store) {
        return res.status(500).send('Tenant context not found');
    }
    const { tenantId } = store;

    try {
        const client = await userTwilioClientCache.getClient(tenantId);
        if (!client) {
            return res.status(500).json({ status: 'error', message: 'Credentials not configured' });
        }
        // A simple API call to check credentials
        await client.api.v2010.accounts(client.accountSid).fetch();
        res.json({ status: 'ok', message: 'Twilio credentials are valid' });
    } catch (error: any) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

function startServer() {
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

// Uncomment to run the server
// startServer();
