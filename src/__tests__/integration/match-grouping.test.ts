import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createIntegrationContext, type IntegrationContext } from "../helpers/integration-context";
import { seedUser, seedSession, seedFootprint, deterministicEmbedding } from "../helpers/seed";
import type { Mock } from "vitest";

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
  const { app } = await import("../../api/app");
  return app;
}

async function postMatch(
  app: Awaited<ReturnType<typeof createApp>>,
  sessionId: string,
  query: string,
  topK = 10
) {
  return app.request("/match", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sessionId}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, topK }),
  });
}

describe("match grouping integration (real findMatches)", () => {
  it("groups footprints by user with profile data", async () => {
    const user = await seedUser(ctx.testDb.db, {
      username: "devjane",
      displayName: "Jane Dev",
      avatarUrl: "https://example.com/jane.png",
    });
    const { sessionId } = await seedSession(ctx.testDb.db, user.id);

    await seedFootprint(ctx.testDb.db, {
      userId: user.id,
      summary: "Built React components with TypeScript",
      tags: ["react", "typescript"],
      embedding: deterministicEmbedding("Built React components with TypeScript"),
    });
    await seedFootprint(ctx.testDb.db, {
      userId: user.id,
      summary: "Created TypeScript utility library",
      tags: ["typescript", "node"],
      embedding: deterministicEmbedding("Created TypeScript utility library"),
    });

    const app = await createApp();
    const res = await postMatch(app, sessionId, "TypeScript developer");

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.results).toHaveLength(1);

    const candidate = body.results[0];
    expect(candidate.userId).toBe(user.id);
    expect(candidate.username).toBe("devjane");
    expect(candidate.displayName).toBe("Jane Dev");
    expect(candidate.avatarUrl).toBe("https://example.com/jane.png");
    expect(candidate.githubUrl).toBe("https://github.com/devjane");
    expect(candidate.footprints).toHaveLength(2);
    expect(typeof candidate.score).toBe("number");
  });

  it("returns multiple users each with their own footprints grouped", async () => {
    const alice = await seedUser(ctx.testDb.db, { username: "alice" });
    const bob = await seedUser(ctx.testDb.db, { username: "bob" });
    const { sessionId } = await seedSession(ctx.testDb.db, alice.id);

    await seedFootprint(ctx.testDb.db, {
      userId: alice.id,
      summary: "Expert in React and TypeScript frontend development",
      tags: ["react", "typescript"],
      embedding: deterministicEmbedding("Expert in React and TypeScript frontend development"),
    });
    await seedFootprint(ctx.testDb.db, {
      userId: bob.id,
      summary: "Built PostgreSQL database schemas and migrations",
      tags: ["postgresql", "sql"],
      embedding: deterministicEmbedding("Built PostgreSQL database schemas and migrations"),
    });

    const app = await createApp();
    const res = await postMatch(app, sessionId, "developer");

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.results.length).toBe(2);
    const usernames = body.results.map((r: any) => r.username).sort();
    expect(usernames).toEqual(["alice", "bob"]);
    expect(body.results[0].footprints.length).toBeGreaterThanOrEqual(1);
    expect(body.results[1].footprints.length).toBeGreaterThanOrEqual(1);
  });

  it("caps footprints per user at 5", async () => {
    const user = await seedUser(ctx.testDb.db, { username: "prolific" });
    const { sessionId } = await seedSession(ctx.testDb.db, user.id);

    for (let i = 0; i < 7; i++) {
      const summary = `TypeScript project number ${i + 1} with unique details ${crypto.randomUUID()}`;
      await seedFootprint(ctx.testDb.db, {
        userId: user.id,
        summary,
        tags: ["typescript"],
        embedding: deterministicEmbedding(summary),
      });
    }

    const app = await createApp();
    const res = await postMatch(app, sessionId, "TypeScript developer", 10);

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.results).toHaveLength(1);
    expect(body.results[0].footprints.length).toBeLessThanOrEqual(5);
  });

  it("returns empty results from empty database", async () => {
    const user = await seedUser(ctx.testDb.db);
    const { sessionId } = await seedSession(ctx.testDb.db, user.id);
    await ctx.testDb.db.execute(
      (await import("drizzle-orm")).sql`TRUNCATE footprints CASCADE`
    );

    const app = await createApp();
    const res = await postMatch(app, sessionId, "any developer");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([]);
  });

  it("returns structured 500 when embedding generation fails", async () => {
    const { generateEmbedding } = await import("../../services/embedding");
    (generateEmbedding as Mock).mockRejectedValueOnce(
      new Error("Embedding service down")
    );

    const user = await seedUser(ctx.testDb.db);
    const { sessionId } = await seedSession(ctx.testDb.db, user.id);
    const app = await createApp();

    const res = await postMatch(app, sessionId, "any developer");

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Match search failed");
  });
});
