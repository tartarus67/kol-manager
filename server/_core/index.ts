import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Temporary debug endpoint
  app.get('/api/debug-env', async (_req, res) => {
    try {
      const { ENV } = await import('../_core/env');
      const rawKey = ENV.xApiBearerToken;
      const apiKey = rawKey ? decodeURIComponent(rawKey) : '';
      // Test actual X API call
      let xApiStatus = 0;
      let xApiOk = false;
      if (apiKey) {
        const r = await fetch('https://api.twitter.com/2/users/by/username/twitter?user.fields=public_metrics', {
          headers: { Authorization: `Bearer ${apiKey}` }
        });
        xApiStatus = r.status;
        xApiOk = r.ok;
      }
      res.json({
        xApiBearerTokenPresent: !!rawKey,
        xApiBearerTokenLength: rawKey?.length ?? 0,
        processEnvPresent: !!process.env.X_API_BEARER_TOKEN,
        xApiCallStatus: xApiStatus,
        xApiCallOk: xApiOk,
      });
    } catch(e: any) {
      res.status(500).json({ error: e.message });
    }
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
