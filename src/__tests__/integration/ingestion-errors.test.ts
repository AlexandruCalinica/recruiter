import { vi, describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { sql } from "drizzle-orm";
import { createIntegrationContext, type IntegrationContext } from "../helpers/integration-context";
import { seedUser, seedSession } from "../helpers/seed";
import { waitForCast, cleanupTelemetry } from "../helpers/actor-testing";

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

async function postFootprint(
  app: Awaited<ReturnType<typeof createApp>>,
  sessionId: string,
  body: Record<string, unknown>
) {
  return app.request("/footprints", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sessionId}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function countFootprints(userId: string): Promise<number> {
  const result = await ctx.testDb.db.execute(
    sql`SELECT count(*)::int AS cnt FROM footprints WHERE user_id = ${userId}`
  );
  const rows = (result as any).rows ?? result;
  return (rows[0] as any).cnt;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForActorProcessing(): Promise<void> {
  await sleep(500);
}

describe("ingestion actor error paths", () => {
  it("writes no DB row when embedding generation fails", async () => {
    const { generateEmbedding } = await import("../../services/embedding");
    vi.mocked(generateEmbedding).mockRejectedValueOnce(
      new Error("Embedding API unavailable")
    );

    const user = await seedUser(ctx.testDb.db);
    const { sessionId } = await seedSession(ctx.testDb.db, user.id);
    const app = await createApp();

    const res = await postFootprint(app, sessionId, {
      summary: "Should fail during embedding",
      tags: ["test"],
    });

    expect(res.status).toBe(202);
    await waitForActorProcessing();

    expect(await countFootprints(user.id)).toBe(0);
  });

  it("continues processing after a failure", async () => {
    const { generateEmbedding } = await import("../../services/embedding");
    vi.mocked(generateEmbedding).mockRejectedValueOnce(
      new Error("Transient failure")
    );

    const user = await seedUser(ctx.testDb.db);
    const { sessionId } = await seedSession(ctx.testDb.db, user.id);
    const app = await createApp();

    await postFootprint(app, sessionId, {
      summary: "This one will fail",
      tags: ["fail"],
    });
    await waitForActorProcessing();

    expect(await countFootprints(user.id)).toBe(0);

    const successDone = waitForCast();
    await postFootprint(app, sessionId, {
      summary: "This one should succeed",
      tags: ["success"],
    });
    await successDone;

    expect(await countFootprints(user.id)).toBe(1);
  }, 10_000);
});
