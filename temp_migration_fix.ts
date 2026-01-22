import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function run() {
  try {
    await db.execute(sql`DROP TABLE IF EXISTS call_notes`);
    console.log('Successfully dropped call_notes table');
  } catch (error) {
    console.error('Error dropping call_notes table:', error);
  }
}

run();
