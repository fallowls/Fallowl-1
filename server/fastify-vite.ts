import type { FastifyInstance } from "fastify";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";
import type { Server } from "http";

const viteLogger = createLogger();

export function log(message: string, source = "fastify") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupViteFastify(fastify: FastifyInstance, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { 
      server,
      port: 5000
    },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  // Register Vite middleware as a Fastify hook
  fastify.addHook('onRequest', async (request, reply) => {
    // Skip API routes
    if (request.url.startsWith('/api') || request.url.startsWith('/ws')) {
      return;
    }

    // Convert Fastify request/reply to Express-like for Vite
    const req = request.raw;
    const res = reply.raw;
    
    return new Promise<void>((resolve, reject) => {
      vite.middlewares(req, res, (err?: any) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  // Catch-all route for SPA
  fastify.get('/*', async (request, reply) => {
    // Check if the response was already sent by Vite middleware
    if (reply.sent) {
      return;
    }
    
    const url = request.url;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk in case it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      return reply.type('text/html').send(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      return reply.code(500).send(e);
    }
  });
}

export async function serveStaticFastify(fastify: FastifyInstance) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Register static file serving
  await fastify.register(import('@fastify/static'), {
    root: distPath,
    prefix: '/',
  });

  // fall through to index.html if the file doesn't exist (SPA support)
  fastify.setNotFoundHandler(async (_request, reply) => {
    const indexPath = path.resolve(distPath, "index.html");
    const content = await fs.promises.readFile(indexPath, "utf-8");
    reply.type('text/html').send(content);
  });
}
