#!/usr/bin/env node
console.log('Checking environment variables...\n');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? `SET (${process.env.DATABASE_URL.substring(0, 50)}...)` : 'NOT SET or EMPTY');
console.log('PGHOST:', process.env.PGHOST || 'NOT SET');
console.log('PGUSER:', process.env.PGUSER || 'NOT SET');
console.log('PGDATABASE:', process.env.PGDATABASE || 'NOT SET');
console.log('PGPORT:', process.env.PGPORT || 'NOT SET');
console.log('PGPASSWORD:', process.env.PGPASSWORD ? 'SET' : 'NOT SET');

console.log('\nAll env vars with DATABASE or PG:');
Object.keys(process.env)
  .filter(key => key.includes('DATABASE') || key.includes('PG') || key.includes('NEON'))
  .forEach(key => {
    const value = process.env[key];
    if (value && value.length > 0) {
      console.log(`${key}: ${key.includes('PASSWORD') || key.includes('TOKEN') ? 'SET (hidden)' : value.substring(0, 50)}`);
    }
  });
