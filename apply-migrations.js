import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const runMigrations = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set in .env file');
  }

  const connectionString = process.env.DATABASE_URL;
  const sql = postgres(connectionString, { max: 1 });
  const db = drizzle(sql);

  console.log('Running database migrations...');

  await migrate(db, { migrationsFolder: 'migrations' });

  console.log('Migrations completed successfully!');
  process.exit(0);
};

runMigrations().catch((err) => {
  console.error('Error running migrations:', err);
  process.exit(1);
});
