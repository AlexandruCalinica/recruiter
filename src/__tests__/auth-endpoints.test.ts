import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import {
  createDeviceCode,
  completeDeviceCode,
} from "../auth/device-codes";

describe("MCP auth endpoints", () => {
  describe("POST /auth/mcp/init", () => {
    it("returns a code and authUrl", async () => {
      const { authRoutes } = await import("../api/routes/auth");
      const app = new Hono().route("/auth", authRoutes);

      const res = await app.request("/auth/mcp/init", { method: "POST" });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.code).toBeTruthy();
      expect(body.authUrl).toContain("/auth/mcp/authorize?code=");
      expect(body.authUrl).toContain(body.code);
    });
  });

  describe("GET /auth/mcp/authorize", () => {
    it("rejects invalid code", async () => {
      const { authRoutes } = await import("../api/routes/auth");
      const app = new Hono().route("/auth", authRoutes);

      const res = await app.request(
        "/auth/mcp/authorize?code=nonexistent"
      );

      expect(res.status).toBe(400);
    });

    it("redirects to GitHub with valid code", async () => {
      const { authRoutes } = await import("../api/routes/auth");
      const app = new Hono().route("/auth", authRoutes);

      const code = createDeviceCode();
      const res = await app.request(
        `/auth/mcp/authorize?code=${code}`,
        { redirect: "manual" }
      );

      expect(res.status).toBe(302);
      const location = res.headers.get("location");
      expect(location).toContain("github.com/login/oauth/authorize");
    });
  });

  describe("GET /auth/mcp/poll", () => {
    it("returns pending for incomplete code", async () => {
      const { authRoutes } = await import("../api/routes/auth");
      const app = new Hono().route("/auth", authRoutes);

      const code = createDeviceCode();
      const res = await app.request(`/auth/mcp/poll?code=${code}`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("pending");
    });

    it("returns expired for unknown code", async () => {
      const { authRoutes } = await import("../api/routes/auth");
      const app = new Hono().route("/auth", authRoutes);

      const res = await app.request("/auth/mcp/poll?code=unknown");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("expired");
    });

    it("returns complete with token after code is completed", async () => {
      const { authRoutes } = await import("../api/routes/auth");
      const app = new Hono().route("/auth", authRoutes);

      const code = createDeviceCode();
      completeDeviceCode(code, "session-abc", "testuser");

      const res = await app.request(`/auth/mcp/poll?code=${code}`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("complete");
      expect(body.token).toBe("session-abc");
      expect(body.username).toBe("testuser");
    });

    it("consumes the code after returning complete", async () => {
      const { authRoutes } = await import("../api/routes/auth");
      const app = new Hono().route("/auth", authRoutes);

      const code = createDeviceCode();
      completeDeviceCode(code, "session-abc", "testuser");

      await app.request(`/auth/mcp/poll?code=${code}`);
      const res2 = await app.request(`/auth/mcp/poll?code=${code}`);

      const body = await res2.json();
      expect(body.status).toBe("expired");
    });
  });
});
