import { vi, describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { sql } from "drizzle-orm";
import { createIntegrationContext, type IntegrationContext } from "../helpers/integration-context";
import { storeOAuthState, createDeviceCode } from "../../auth/device-codes";
import { waitForCast, cleanupTelemetry } from "../helpers/actor-testing";

const MOCK_GITHUB_USER = {
  id: 55555,
  login: "mcp-user",
  name: "MCP User",
  avatar_url: "https://avatars.githubusercontent.com/u/55555",
};

let ctx: IntegrationContext;

beforeAll(async () => {
  ctx = await createIntegrationContext({ system: "live" });

  vi.doMock("@/auth/oauth", () => ({
    github: {
      validateAuthorizationCode: vi.fn(async () => ({
        accessToken: () => "mock-mcp-token",
      })),
      createAuthorizationURL: vi.fn(
        () => new URL("https://github.com/login/oauth/authorize?state=x")
      ),
    },
  }));

  vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    new Response(JSON.stringify(MOCK_GITHUB_USER), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
});

afterAll(async () => {
  vi.restoreAllMocks();
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

describe("MCP end-to-end flow", () => {
  it("device code flow: init → callback → poll yields valid session", async () => {
    const app = await createApp();

    const initRes = await app.request("/auth/mcp/init", { method: "POST" });
    expect(initRes.status).toBe(200);
    const { code } = (await initRes.json()) as { code: string; authUrl: string };

    const state = crypto.randomUUID();
    storeOAuthState(state, code);

    const callbackRes = await app.request(
      `/auth/github/callback?code=gh-code&state=${state}`
    );
    expect(callbackRes.status).toBe(200);
    const html = await callbackRes.text();
    expect(html).toContain("mcp-user");

    const pollRes = await app.request(`/auth/mcp/poll?code=${code}`);
    expect(pollRes.status).toBe(200);
    const poll = (await pollRes.json()) as {
      status: string;
      token?: string;
      username?: string;
    };
    expect(poll.status).toBe("complete");
    expect(poll.token).toBeTruthy();
    expect(poll.username).toBe("mcp-user");

    const users = await ctx.testDb.db.execute(
      sql`SELECT username FROM users WHERE provider_user_id = '55555'`
    );
    const userRows = (users as any).rows ?? users;
    expect(userRows).toHaveLength(1);
    expect(userRows[0].username).toBe("mcp-user");

    const sessions = await ctx.testDb.db.execute(
      sql`SELECT id FROM sessions WHERE id = ${poll.token}`
    );
    const sessionRows = (sessions as any).rows ?? sessions;
    expect(sessionRows).toHaveLength(1);
  });

  it("uses session token for authenticated footprint ingestion with source mcp", async () => {
    const app = await createApp();

    const deviceCode = createDeviceCode();
    const state = crypto.randomUUID();
    storeOAuthState(state, deviceCode);

    await app.request(`/auth/github/callback?code=gh-code&state=${state}`);

    const pollRes = await app.request(`/auth/mcp/poll?code=${deviceCode}`);
    const { token } = (await pollRes.json()) as { status: string; token: string };

    const castDone = waitForCast();

    const footprintRes = await app.request("/footprints", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: "Implemented MCP auth flow integration",
        tags: ["mcp", "auth"],
        source: "mcp",
      }),
    });

    expect(footprintRes.status).toBe(202);
    await castDone;

    const footprints = await ctx.testDb.db.execute(
      sql`SELECT summary, source, tags FROM footprints`
    );
    const rows = (footprints as any).rows ?? footprints;
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("mcp");
    expect(rows[0].summary).toBe("Implemented MCP auth flow integration");
  });
});
