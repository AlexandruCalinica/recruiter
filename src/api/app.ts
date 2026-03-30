import { Hono } from "hono";
import { logger } from "hono/logger";
import pino from "pino";
import { authMiddleware } from "./middleware/auth";
import { footprintRoutes } from "./routes/footprints";
import { matchRoutes } from "./routes/match";
import { authRoutes } from "./routes/auth";

const log = pino({ name: "api" });

export const app = new Hono();

app.use("*", logger());

app.onError((err, c) => {
  log.error({ err, method: c.req.method, path: c.req.path }, "unhandled error");
  return c.json({ error: "Internal server error" }, 500);
});

app.get("/health", (c) => c.json({ status: "ok" }));

app.use("/footprints/*", authMiddleware());
app.use("/match/*", authMiddleware());

app.route("/footprints", footprintRoutes);
app.route("/match", matchRoutes);
app.route("/auth", authRoutes);
