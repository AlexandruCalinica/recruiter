import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { sql } from "drizzle-orm";
import { seedUser, seedSession } from "../helpers/seed";
import { waitForCast, cleanupTelemetry } from "../helpers/actor-testing";
import { createIntegrationContext, type IntegrationContext } from "../helpers/integration-context";

let ctx: IntegrationContext;

beforeAll(async () => {
  ctx = await createIntegrationContext({ system: "live" });
});

afterAll(async () => {
  await ctx.teardown();
});

beforeEach(async () => {
  await ctx.testDb.truncateAll();
});

afterEach(() => {
  cleanupTelemetry();
});

async function createApp() {
  const { app } = await import("../../api/app");
  return app;
}

describe("footprint ingestion integration", () => {
  it("ingests a footprint end-to-end: POST → actor → DB row with embedding", async () => {
    const user = await seedUser(ctx.testDb.db);
    const { sessionId } = await seedSession(ctx.testDb.db, user.id);
    const app = await createApp();

    const castDone = waitForCast();

    const res = await app.request("/footprints", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionId}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: "Built a REST API with Hono and Drizzle ORM",
        tags: ["hono", "drizzle", "typescript"],
        source: "api",
      }),
    });

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.accepted).toBe(true);

    await castDone;

    const result = await ctx.testDb.db.execute(
      sql`SELECT user_id, summary, tags, source, embedding FROM footprints WHERE user_id = ${user.id}`
    );
    const rows = (result as any).rows ?? result;
    const footprint = (rows as Array<Record<string, unknown>>)[0];

    expect(footprint).toBeDefined();
    expect(footprint.summary).toBe("Built a REST API with Hono and Drizzle ORM");
    expect(footprint.tags).toEqual(["hono", "drizzle", "typescript"]);
    expect(footprint.source).toBe("api");
    expect(footprint.embedding).toBeTruthy();
  });

  it("rejects invalid footprint body with 400", async () => {
    const user = await seedUser(ctx.testDb.db);
    const { sessionId } = await seedSession(ctx.testDb.db, user.id);
    const app = await createApp();

    const res = await app.request("/footprints", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionId}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ summary: "" }),
    });

    expect(res.status).toBe(400);
  });

  it("rejects unauthenticated request with 401", async () => {
    const app = await createApp();

    const res = await app.request("/footprints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: "Should not be ingested",
        tags: [],
      }),
    });

    expect(res.status).toBe(401);
  });
});
