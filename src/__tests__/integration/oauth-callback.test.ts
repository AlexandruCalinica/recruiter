import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { createIntegrationContext, type IntegrationContext } from "../helpers/integration-context";
import {
  storeOAuthState,
  createDeviceCode,
  consumeDeviceCode,
} from "../../auth/device-codes";

const MOCK_GITHUB_USER = {
  id: 98765,
  login: "octocat",
  name: "Octo Cat",
  avatar_url: "https://avatars.githubusercontent.com/u/98765",
};

let ctx: IntegrationContext;

beforeAll(async () => {
  ctx = await createIntegrationContext();

  vi.doMock("@/auth/oauth", () => ({
    github: {
      validateAuthorizationCode: vi.fn(async () => ({
        accessToken: () => "mock-github-access-token",
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

async function createApp() {
  const { app } = await import("../../api/app");
  return app;
}

describe("OAuth callback integration", () => {
  it("creates new user and session on first auth", async () => {
    const state = crypto.randomUUID();
    storeOAuthState(state);
    const app = await createApp();

    const res = await app.request(
      `/auth/github/callback?code=test-code&state=${state}`
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.username).toBe("octocat");
    expect(body.user.displayName).toBe("Octo Cat");

    const cookie = res.headers.get("set-cookie");
    expect(cookie).toContain("session=");

    const users = await ctx.testDb.db.execute(
      sql`SELECT username, display_name, avatar_url, provider, provider_user_id FROM users`
    );
    const rows = (users as any).rows ?? users;
    expect(rows).toHaveLength(1);
    expect(rows[0].username).toBe("octocat");
    expect(rows[0].provider).toBe("github");
    expect(rows[0].provider_user_id).toBe("98765");

    const sessions = await ctx.testDb.db.execute(sql`SELECT * FROM sessions`);
    const sessionRows = (sessions as any).rows ?? sessions;
    expect(sessionRows).toHaveLength(1);
  });

  it("updates profile on returning user auth", async () => {
    await ctx.testDb.db.execute(
      sql`INSERT INTO users (provider, provider_user_id, username, display_name, avatar_url)
          VALUES ('github', '98765', 'old-login', 'Old Name', 'https://old-avatar.example.com')`
    );

    const state = crypto.randomUUID();
    storeOAuthState(state);
    const app = await createApp();

    const res = await app.request(
      `/auth/github/callback?code=test-code&state=${state}`
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.username).toBe("octocat");
    expect(body.user.displayName).toBe("Octo Cat");
    expect(body.user.avatarUrl).toBe(
      "https://avatars.githubusercontent.com/u/98765"
    );

    const users = await ctx.testDb.db.execute(
      sql`SELECT username, display_name, avatar_url FROM users WHERE provider_user_id = '98765'`
    );
    const rows = (users as any).rows ?? users;
    expect(rows).toHaveLength(1);
    expect(rows[0].username).toBe("octocat");
    expect(rows[0].display_name).toBe("Octo Cat");
  });

  it("completes device code flow and returns HTML", async () => {
    const deviceCode = createDeviceCode();
    const state = crypto.randomUUID();
    storeOAuthState(state, deviceCode);
    const app = await createApp();

    const res = await app.request(
      `/auth/github/callback?code=test-code&state=${state}`
    );

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Authenticated");
    expect(html).toContain("octocat");

    const result = consumeDeviceCode(deviceCode);
    expect(result).not.toBeNull();
    expect(result!.username).toBe("octocat");
    expect(result!.sessionId).toBeTruthy();

    const sessions = await ctx.testDb.db.execute(sql`SELECT * FROM sessions`);
    const sessionRows = (sessions as any).rows ?? sessions;
    expect(sessionRows).toHaveLength(1);
    expect((sessionRows[0] as any).id).toBe(result!.sessionId);
  });

  it("returns 400 for missing code or state", async () => {
    const app = await createApp();

    const res = await app.request("/auth/github/callback");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing");
  });

  it("returns 400 for invalid or expired state", async () => {
    const app = await createApp();

    const res = await app.request(
      "/auth/github/callback?code=test-code&state=bogus-state"
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid");
  });

  it("returns 502 when GitHub token exchange fails", async () => {
    const { github } = await import("../../auth/oauth");
    vi.mocked(github.validateAuthorizationCode).mockRejectedValueOnce(
      new Error("GitHub is down")
    );

    const state = crypto.randomUUID();
    storeOAuthState(state);
    const app = await createApp();

    const res = await app.request(
      `/auth/github/callback?code=bad-code&state=${state}`
    );

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain("token exchange");
  });

  it("returns 502 when GitHub user profile request fails", async () => {
    vi.mocked(globalThis.fetch).mockImplementationOnce(async () =>
      new Response("Service Unavailable", { status: 503 })
    );

    const state = crypto.randomUUID();
    storeOAuthState(state);
    const app = await createApp();

    const res = await app.request(
      `/auth/github/callback?code=test-code&state=${state}`
    );

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain("profile request failed");
  });

  it("returns 502 when GitHub API is unreachable", async () => {
    vi.mocked(globalThis.fetch).mockImplementationOnce(async () => {
      throw new Error("Network error");
    });

    const state = crypto.randomUUID();
    storeOAuthState(state);
    const app = await createApp();

    const res = await app.request(
      `/auth/github/callback?code=test-code&state=${state}`
    );

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain("unreachable");
  });
});
