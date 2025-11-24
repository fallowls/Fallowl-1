import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import * as schema from './shared/schema';
import { neonConfig } from '@neondatabase/serverless';

neonConfig.webSocketConstructor = ws;

async function pushSchema() {
  console.log('Checking DATABASE_URL...');
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL environment variable is not set!');
    console.error('Available env vars:', Object.keys(process.env).filter(k => k.includes('DATABASE') || k.includes('PG')));
    process.exit(1);
  }
  
  console.log('DATABASE_URL is set, connecting to database...');
  
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  
  console.log('Testing connection...');
  try {
    await pool.query('SELECT 1');
    console.log('✅ Connected to database successfully!');
    console.log('✅ Schema is ready to use');
    console.log('Note: Using `npm run db:push` to sync schema changes when needed');
  } catch (error) {
    console.error('❌ Failed to connect:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

pushSchema();
