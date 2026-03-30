import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import * as arctic from "arctic";
import { github } from "../../auth/oauth";
import {
  createDeviceCode,
  hasDeviceCode,
  completeDeviceCode,
  consumeDeviceCode,
  storeOAuthState,
  consumeOAuthState,
} from "../../auth/device-codes";
import { db } from "../../db/index";
import { users, sessions } from "../../db/schema";


export const authRoutes = new Hono();

authRoutes.get("/github", async (c) => {
  const state = arctic.generateState();
  const scopes = ["read:user", "user:email"];
  const url = github.createAuthorizationURL(state, scopes);

  storeOAuthState(state);

  return c.redirect(url.toString());
});

authRoutes.get("/github/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");

  if (!code || !state) {
    return c.json({ error: "Missing code or state" }, 400);
  }

  const oauthState = consumeOAuthState(state);
  if (!oauthState) {
    return c.json({ error: "Invalid or expired OAuth state" }, 400);
  }

  let accessToken: string;
  try {
    const tokens = await github.validateAuthorizationCode(code);
    accessToken = tokens.accessToken();
  } catch {
    return c.json({ error: "GitHub token exchange failed" }, 502);
  }

  let githubUser: { id: number; login: string; name: string | null; avatar_url: string };
  try {
    const userResponse = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userResponse.ok) {
      return c.json({ error: "GitHub user profile request failed" }, 502);
    }

    githubUser = await userResponse.json();
  } catch {
    return c.json({ error: "GitHub API unreachable" }, 502);
  }

  const [user] = await db
    .insert(users)
    .values({
      provider: "github",
      providerUserId: String(githubUser.id),
      username: githubUser.login,
      displayName: githubUser.name,
      avatarUrl: githubUser.avatar_url,
    })
    .onConflictDoUpdate({
      target: [users.provider, users.providerUserId],
      set: {
        username: githubUser.login,
        displayName: githubUser.name,
        avatarUrl: githubUser.avatar_url,
      },
    })
    .returning();

  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({
    id: sessionId,
    userId: user.id,
    expiresAt,
  });

  if (oauthState.deviceCode) {
    completeDeviceCode(oauthState.deviceCode, sessionId, user.username);

    return c.html(`<!DOCTYPE html>
<html><body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0">
<div style="text-align:center">
<h1>✓ Authenticated</h1>
<p>Signed in as <strong>${user.username}</strong>. You can close this tab.</p>
</div>
</body></html>`);
  }

  setCookie(c, "session", sessionId, {
    httpOnly: true,
    secure: false,
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });

  return c.json({ user });
});

authRoutes.post("/mcp/init", async (c) => {
  const code = createDeviceCode();
  const baseUrl = new URL(c.req.url);
  const authUrl = `${baseUrl.origin}/auth/mcp/authorize?code=${code}`;

  return c.json({ code, authUrl });
});

authRoutes.get("/mcp/authorize", async (c) => {
  const code = c.req.query("code");

  if (!code || !hasDeviceCode(code)) {
    return c.json({ error: "Invalid or expired code" }, 400);
  }

  const state = arctic.generateState();
  const scopes = ["read:user", "user:email"];
  const url = github.createAuthorizationURL(state, scopes);

  storeOAuthState(state, code);

  return c.redirect(url.toString());
});

authRoutes.get("/mcp/poll", async (c) => {
  const code = c.req.query("code");

  if (!code) {
    return c.json({ error: "Missing code" }, 400);
  }

  const result = consumeDeviceCode(code);

  if (!result) {
    if (hasDeviceCode(code)) {
      return c.json({ status: "pending" });
    }
    return c.json({ status: "expired" });
  }

  return c.json({
    status: "complete",
    token: result.sessionId,
    username: result.username,
  });
});
