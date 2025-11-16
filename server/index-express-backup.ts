import dotenv from "dotenv";

// Load environment variables from .env file FIRST
dotenv.config();

import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { Pool } from "pg";
import cors from "cors";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";
import { seedSmsData, seedLeadData, seedContactLists } from "./seedData";
import { seedDemoContacts } from "./seedContacts";
import { twilioWebhookVerifier } from "./services/twilioWebhookVerifier";
import { validateEnvironment, testDatabaseConnection } from "./env-validation";

// Validate environment before starting
const envValidation = validateEnvironment();
if (!envValidation.isValid) {
  console.error('\n❌ Environment validation failed!');
  console.error('Please fix the errors listed above before starting the application.\n');
  process.exit(1);
}

const app = express();

// CORS configuration
const getAllowedOrigins = (): string[] => {
  if (process.env.NODE_ENV !== 'production') {
    return [];
  }
  
  // Collect origins from environment variables and split comma-separated values
  const originSources = [
    process.env.CLIENT_ORIGIN,
    process.env.REPLIT_DOMAINS,
    process.env.REPLIT_DEV_DOMAIN
  ].filter((origin): origin is string => Boolean(origin));
  
  // Split comma-separated origins and trim whitespace
  const allowedOrigins = originSources
    .flatMap(origin => origin.split(','))
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0);
  
  if (allowedOrigins.length === 0) {
    console.error('❌ No CORS origins configured for production. Set CLIENT_ORIGIN, REPLIT_DOMAINS, or REPLIT_DEV_DOMAIN environment variable.');
  } else {
    console.log('✓ Production CORS origins configured:', allowedOrigins);
  }
  
  return allowedOrigins;
};

const allowedOrigins = getAllowedOrigins();

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) {
      return callback(null, true);
    }
    
    // In development, allow all origins
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    // In production, check against allowed origins
    if (allowedOrigins.length === 0) {
      console.warn(`⚠️ CORS request from ${origin} rejected - no origins configured`);
      return callback(new Error('CORS not configured'), false);
    }
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    console.warn(`⚠️ CORS request from ${origin} rejected - not in allowed origins: ${allowedOrigins.join(', ')}`);
    callback(new Error(`Origin ${origin} not allowed`), false);
  },
  credentials: true, // Allow cookies and authorization headers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// PostgreSQL session store for Autoscale compatibility
const PgSession = connectPgSimple(session);

// Validate required environment variables
if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable must be set for security. Please set SESSION_SECRET before starting the application.');
}

// Session configuration with PostgreSQL store
app.use(session({
  store: new PgSession({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
    tableName: 'session',
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      // Truncate log lines to prevent log spam while allowing reasonable debugging info
      // 200 chars balances visibility with DoS protection on high-volume endpoints
      if (logLine.length > 200) {
        logLine = logLine.slice(0, 199) + "…";
      }

      log(logLine);
    }
  });

  next();
});

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
  
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
