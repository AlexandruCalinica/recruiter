import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { seedUser, seedSession, seedFootprint, deterministicEmbedding } from "../helpers/seed";
import { createIntegrationContext, type IntegrationContext } from "../helpers/integration-context";

let ctx: IntegrationContext;

beforeAll(async () => {
  ctx = await createIntegrationContext();

  vi.doMock("@/services/matching", () => ({
    findMatches: vi.fn(async (query: string, topK: number) => {
      const queryEmbedding = deterministicEmbedding(query);
      const vectorLiteral = `[${queryEmbedding.join(",")}]`;

      const result = await ctx.testDb.db.execute(sql`
        SELECT
          user_id,
          1 - (embedding <=> ${vectorLiteral}::vector) AS score,
          summary,
          tags
        FROM footprints
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> ${vectorLiteral}::vector
        LIMIT ${topK}
      `);

      const rows = (result as any).rows ?? result;
      return (rows as Array<Record<string, unknown>>).map((r) => ({
        userId: r.user_id as string,
        score: Number(r.score),
        summary: r.summary as string,
        tags: r.tags as string[],
      }));
    }),
  }));
});

afterAll(async () => {
  await ctx.teardown();
});

beforeEach(async () => {
  await ctx.testDb.truncateAll();
});

async function createApp() {
  const { app } = await import("../../api/app");
  return app;
}

describe("match integration", () => {
  it("returns ranked candidates by cosine similarity", async () => {
    const user = await seedUser(ctx.testDb.db);
    const { sessionId } = await seedSession(ctx.testDb.db, user.id);

    await seedFootprint(ctx.testDb.db, {
      userId: user.id,
      summary: "Expert in React and TypeScript frontend development",
      tags: ["react", "typescript"],
      embedding: deterministicEmbedding("Expert in React and TypeScript frontend development"),
    });
    await seedFootprint(ctx.testDb.db, {
      userId: user.id,
      summary: "Built PostgreSQL database schemas with pgvector",
      tags: ["postgresql", "pgvector"],
      embedding: deterministicEmbedding("Built PostgreSQL database schemas with pgvector"),
    });

    const app = await createApp();

    const res = await app.request("/match", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionId}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "Need a React TypeScript developer",
        topK: 10,
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toBeInstanceOf(Array);
    expect(body.results.length).toBe(2);

    expect(body.results[0].score).toBeGreaterThan(body.results[1].score);
    expect(body.results[0].summary).toContain("React");
  });

  it("returns empty results from empty database", async () => {
    const user = await seedUser(ctx.testDb.db);
    const { sessionId } = await seedSession(ctx.testDb.db, user.id);
    const app = await createApp();

    const res = await app.request("/match", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionId}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "any developer", topK: 5 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([]);
  });

  it("rejects unauthenticated request with 401", async () => {
    const app = await createApp();

    const res = await app.request("/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "any developer", topK: 5 }),
    });

    expect(res.status).toBe(401);
  });

  it("rejects invalid body with 400", async () => {
    const user = await seedUser(ctx.testDb.db);
    const { sessionId } = await seedSession(ctx.testDb.db, user.id);
    const app = await createApp();

    const res = await app.request("/match", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionId}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "" }),
    });

    expect(res.status).toBe(400);
  });
});
