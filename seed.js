import { seedSmsData, seedLeadData, seedContactLists } from './server/seedData.js';
import { seedDemoContacts } from './server/seedContacts.js';

const runSeed = async () => {
  console.log('Starting database seed...');
  await seedSmsData();
  await seedLeadData();
  await seedDemoContacts();
  await seedContactLists();
  console.log('Database seed complete!');
  process.exit(0);
};

runSeed().catch((err) => {
  console.error('Error running seed:', err);
  process.exit(1);
});
