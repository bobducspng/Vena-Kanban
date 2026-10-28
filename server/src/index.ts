import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync } from "node:fs";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { env } from "./env.js";
import { appRouter } from "./trpc/routers/_app.js";
import { createContext } from "./trpc/trpc.js";
import { authRoutes } from "./http/authRoutes.js";
import { fileRoutes } from "./http/fileRoutes.js";

const app = express();

// ngrok (and nginx, both on loopback) terminate TLS / proxy; trust loopback hops so
// secure cookies work and req.ip is the real client (rate limit per user, not per proxy).
app.set("trust proxy", "loopback");

// CSP off: Radix injeta estilos inline (posicionamento de dropdown/popover/modal)
// que uma CSP padrão bloquearia. Para endurecer depois, configure uma CSP própria.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: env.APP_ORIGIN, credentials: true }));
// Attachments first: their raw body must not go through the JSON parser.
app.use(fileRoutes);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

// Rate-limit the auth endpoints (sign-in attempts).
app.use("/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: true, legacyHeaders: false }));
app.use(authRoutes);

app.use("/trpc", createExpressMiddleware({ router: appRouter, createContext }));

// Serve the built SPA from app/dist (single origin behind one ngrok tunnel).
// From server/dist/index.js, app/dist is ../../app/dist. Only if it was built.
const spaDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../app/dist");
if (existsSync(spaDir)) {
  app.use(express.static(spaDir));
  // SPA fallback: any other GET returns index.html (client-side routing).
  app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    if (req.path.startsWith("/trpc") || req.path.startsWith("/auth") || req.path.startsWith("/files") || req.path === "/health") return next();
    res.sendFile(join(spaDir, "index.html"));
  });
  console.log(`Serving SPA from ${spaDir}`);
} else {
  console.log("SPA dist not found — API-only (dev uses the Vite server).");
}

app.listen(env.PORT, () => {
  console.log(`Server on :${env.PORT} — public: ${env.PUBLIC_BASE_URL}`);
});
