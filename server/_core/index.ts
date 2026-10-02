import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageFileRoutes } from "./storageProxy";
import { registerUploadRoutes } from "./uploadRoutes";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { sdk } from "./sdk";
import { upsertLearningData } from "../db";

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
  app.get("/_app/health", (_req, res) => {
    res.status(200).type("text/plain").send("ok");
  });
  // The upload route uses application/octet-stream and streams the request;
  // these parsers therefore handle only structured application requests.
  app.use(express.json({ limit: "400mb" }));
  app.use(express.urlencoded({ limit: "400mb", extended: true }));
  server.requestTimeout = 0;
  registerStorageFileRoutes(app);
  registerUploadRoutes(app);
  registerOAuthRoutes(app);
  // Keep the last client snapshot when the browser is closing. This endpoint
  // is intentionally separate from tRPC so navigator.sendBeacon can finish
  // the request during pagehide/beforeunload.
  app.post("/api/learning-data/save", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user) {
        res.status(401).end();
        return;
      }
      const requestedUserId = Number(req.get("X-LearnHub-User-ID"));
      if (!Number.isSafeInteger(requestedUserId) || requestedUserId !== user.id) {
        res.status(403).end();
        return;
      }
      await upsertLearningData(user.id, req.body);
      res.status(204).end();
    } catch (error) {
      console.error("[LearningData] Exit save failed", error);
      const statusCode = Number((error as { statusCode?: number })?.statusCode);
      res.status(statusCode === 401 || statusCode === 403 ? 401 : 500).end();
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
  // The platform routes Preview/public traffic to its declared PORT. Keep the
  // local convenience fallback only when no port has been supplied.
  const port = process.env.PORT ? preferredPort : await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
