import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

const tenantDBs = new Map<string, any>();

export async function dbConnectionManager(request: FastifyRequest, reply: FastifyReply, next: (err?: Error) => void) {
  const tenantId = request.tenantId; // Assuming tenantId is attached by tenantIdentifier middleware

  if (!tenantId) {
    return next();
  }

  if (!tenantDBs.has(tenantId)) {
    // In a real application, you would fetch the tenant's DB credentials from a central database
    // For this example, we'll use a generic connection string and assume different databases per tenant
    const connectionString = `${process.env.DATABASE_URL?.split('?')[0]}?schema=${tenantId}`;
    const pool = new Pool({ connectionString });
    const db = drizzle(pool);
    tenantDBs.set(tenantId, { pool, db });
  }

  request.db = tenantDBs.get(tenantId).db;
  next();
}
