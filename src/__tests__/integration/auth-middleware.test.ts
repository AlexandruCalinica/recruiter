import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Hono } from "hono";
import { seedUser, seedSession, seedExpiredSession } from "../helpers/seed";
import { createIntegrationContext, type IntegrationContext } from "../helpers/integration-context";
import type { AuthVariables } from "../../api/middleware/auth";

let ctx: IntegrationContext;

beforeAll(async () => {
  ctx = await createIntegrationContext();
});

afterAll(async () => {
  await ctx.teardown();
});

beforeEach(async () => {
  await ctx.testDb.truncateAll();
});

async function createApp() {
  const { authMiddleware } = await import("../../api/middleware/auth");
  const app = new Hono<{ Variables: AuthVariables }>();

  app.use("/*", authMiddleware());
  app.get("/protected", (c) => c.json({ userId: c.var.user.id, username: c.var.user.username }));

  return app;
}

describe("auth middleware integration", () => {
  it("authenticates with valid Bearer token", async () => {
    const user = await seedUser(ctx.testDb.db);
    const { sessionId } = await seedSession(ctx.testDb.db, user.id);
    const app = await createApp();

    const res = await app.request("/protected", {
      headers: { Authorization: `Bearer ${sessionId}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe(user.id);
    expect(body.username).toBe(user.username);
  });

  it("rejects request with no auth header", async () => {
    const app = await createApp();

    const res = await app.request("/protected");

    expect(res.status).toBe(401);
  });

  it("rejects request with invalid session ID", async () => {
    const app = await createApp();

    const res = await app.request("/protected", {
      headers: { Authorization: "Bearer nonexistent-session" },
    });

    expect(res.status).toBe(401);
  });

  it("rejects and deletes expired session", async () => {
    const user = await seedUser(ctx.testDb.db);
    const { sessionId } = await seedExpiredSession(ctx.testDb.db, user.id);
    const app = await createApp();

    const res = await app.request("/protected", {
      headers: { Authorization: `Bearer ${sessionId}` },
    });

    expect(res.status).toBe(401);

    const secondAttempt = await app.request("/protected", {
      headers: { Authorization: `Bearer ${sessionId}` },
    });
    expect(secondAttempt.status).toBe(401);
  });
});
