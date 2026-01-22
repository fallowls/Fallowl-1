import dotenv from "dotenv";

// Load environment variables from .env file FIRST
dotenv.config();

import { validateEnvironment, testDatabaseConnection } from "./env-validation";
import { createFastifyServer } from "./fastify";
import { setupViteFastify, serveStaticFastify, log } from "./fastify-vite";
import { storage } from "./storage";
import { seedSmsData, seedLeadData, seedContactLists } from "./seedData";
import { seedDemoContacts } from "./seedContacts";
import { twilioWebhookVerifier } from "./services/twilioWebhookVerifier";
import { wsService } from "./websocketService";
import { tenantIdentifier } from "./middleware/tenantIdentifier";
import { dbConnectionManager } from "./middleware/dbConnectionManager";
import { userContext } from "./middleware/userContext";

// Validate environment before starting
const envValidation = validateEnvironment();
if (!envValidation.isValid) {
  console.error('\n❌ Environment validation failed!');
  console.error('Please fix the errors listed above before starting the application.\n');
  process.exit(1);
}

(async () => {
  // Test database connection before proceeding
  const dbConnected = await testDatabaseConnection();
  if (!dbConnected) {
    console.error('\n❌ Database connection test failed!');
    console.error('The application will start, but database operations will fail.');
    console.error('Please fix the database connection issues listed above.\n');
  }
  
  try {
    // Initialize default data (admin user and sample data)
    await storage.initializeDefaultData();
  } catch (error: any) {
    console.error("Error initializing default data:", error?.message || error);
    if (error?.code === 'EAI_AGAIN') {
      console.error('  → DNS resolution failure. Check network configuration.');
    }
  }
  
  try {
    // Seed SMS data (templates and campaigns)
    await seedSmsData();
  } catch (error: any) {
    console.error("Error seeding SMS data:", error?.message || error);
  }
  
  try {
    // Seed lead management data (sources, statuses, campaigns, leads)
    await seedLeadData();
  } catch (error: any) {
    console.error("Error seeding lead data:", error?.message || error);
  }
  
  try {
    // Seed demo contacts
    await seedDemoContacts();
  } catch (error: any) {
    console.error("Error seeding demo contacts:", error?.message || error);
  }
  
  try {
    // Seed contact lists
    await seedContactLists();
  } catch (error: any) {
    console.error("Error seeding contact lists:", error?.message || error);
  }
  
  try {
    // Automatically verify and update Twilio webhooks on startup
    await twilioWebhookVerifier.verifyAllWebhooks();
  } catch (error: any) {
    console.error("Error verifying Twilio webhooks:", error?.message || error);
  }

  // Create Fastify server
  const fastify = await createFastifyServer();

  // Register middleware
  fastify.addHook('onRequest', tenantIdentifier);
  fastify.addHook('preHandler', dbConnectionManager);
  fastify.addHook('preHandler', userContext);

  // Get the HTTP server instance for WebSocket and Vite
  const server = fastify.server;

  // Initialize WebSocket service on Fastify server
  wsService.initialize(server);

  // Setup Vite or static serving based on environment
  if (process.env.NODE_ENV === "development") {
    await setupViteFastify(fastify, server);
  } else {
    await serveStaticFastify(fastify);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  const host = "0.0.0.0";
  
  await fastify.listen({
    port,
    host,
  });
  
  log(`🚀 Fastify server running on http://${host}:${port}`);
  log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  log(`   WebSocket: ws://${host}:${port}/ws`);
  log(`   API Health: http://${host}:${port}/api/health`);
})();
