import { pgTable, text, varchar, serial, timestamp } from 'drizzle-orm/pg-core';

export const tenants = pgTable('tenants', {
  id: text('id').primaryKey(), // Using text for UUIDs
  status: varchar('status', { length: 50 }).notNull(), // e.g., 'active', 'inactive'
  apiKeyHash: text('api_key_hash').notNull(),
  customDomain: text('custom_domain').unique(), // For enterprise tenants
});

// A sample tenant-specific table. This table will be created in each tenant's schema.
export const products = pgTable('products', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 256 }).notNull(),
    description: text('description'),
});

// Users table for the custom authentication system
export const users = pgTable('users', {
    id: text('id').primaryKey().default('gen_random_uuid()'),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});
