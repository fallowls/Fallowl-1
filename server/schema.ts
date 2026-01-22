import { pgTable, text, varchar, serial, timestamp, integer, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const tenants = pgTable('tenants', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 256 }).notNull(),
  status: varchar('status', { length: 50 }).notNull(), // e.g., 'active', 'inactive'
  apiKeyHash: text('api_key_hash').notNull(),
  customDomain: text('custom_domain').unique(), // For enterprise tenants
  twilioAccountSid: text('twilio_account_sid'),
  twilioAuthToken: text('twilio_auth_token'),
  twilioApiKeySid: text('twilio_api_key_sid'),
  twilioApiKeySecret: text('twilio_api_key_secret'),
  twilioPhoneNumber: varchar('twilio_phone_number', { length: 20 }),
});

export const calls = pgTable('calls', {
    id: serial('id').primaryKey(),
    sid: varchar('sid', { length: 34 }).unique().notNull(),
    tenantId: integer('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    fromNumber: varchar('from_number', { length: 20 }),
    toNumber: varchar('to_number', { length: 20 }),
    status: varchar('status', { length: 20 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const callNotes = pgTable('call_notes', {
    id: serial('id').primaryKey(),
    callId: integer('call_id').notNull().references(() => calls.id, { onDelete: 'cascade' }),
    note: text('note').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const messages = pgTable('messages', {
    id: serial('id').primaryKey(),
    sid: varchar('sid', { length: 34 }).unique().notNull(),
    tenantId: integer('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    fromNumber: varchar('from_number', { length: 20 }),
    toNumber: varchar('to_number', { length: 20 }),
    body: text('body'),
    status: varchar('status', { length: 20 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const recordings = pgTable('recordings', {
    id: serial('id').primaryKey(),
    sid: varchar('sid', { length: 34 }).unique().notNull(),
    tenantId: integer('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    callSid: varchar('call_sid', { length: 34 }),
    url: text('url'),
    duration: integer('duration'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const settings = pgTable('settings', {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id').unique().notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    autoRecordCalls: boolean('auto_record_calls').default(false),
});

export const products = pgTable('products', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 256 }).notNull(),
    description: text('description'),
    tenantId: integer('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
});

export const users = pgTable('users', {
    id: text('id').primaryKey().default('gen_random_uuid()'),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    tenantId: integer('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
});

export const tenantsRelations = relations(tenants, ({ many }) => ({
	calls: many(calls),
	messages: many(messages),
	recordings: many(recordings),
	settings: many(settings),
	products: many(products),
	users: many(users),
}));

export const callsRelations = relations(calls, ({ one, many }) => ({
	tenant: one(tenants, {
		fields: [calls.tenantId],
		references: [tenants.id],
	}),
    notes: many(callNotes),
}));

export const callNotesRelations = relations(callNotes, ({ one }) => ({
    call: one(calls, {
        fields: [callNotes.callId],
        references: [calls.id],
    }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
	tenant: one(tenants, {
		fields: [messages.tenantId],
		references: [tenants.id],
	}),
}));

export const recordingsRelations = relations(recordings, ({ one }) => ({
	tenant: one(tenants, {
		fields: [recordings.tenantId],
		references: [tenants.id],
	}),
}));

export const settingsRelations = relations(settings, ({ one }) => ({
	tenant: one(tenants, {
		fields: [settings.tenantId],
		references: [tenants.id],
	}),
}));

export const productsRelations = relations(products, ({ one }) => ({
	tenant: one(tenants, {
		fields: [products.tenantId],
		references: [tenants.id],
	}),
}));

export const usersRelations = relations(users, ({ one }) => ({
	tenant: one(tenants, {
		fields: [users.tenantId],
		references: [tenants.id],
	}),
}));
