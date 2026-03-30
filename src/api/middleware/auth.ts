import { createMiddleware } from "hono/factory";
import { getCookie, deleteCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "../../db/index";
import { sessions, users } from "../../db/schema";

export type User = InferSelectModel<typeof users>;

export type AuthVariables = {
  user: User;
};

async function resolveSession(sessionId: string): Promise<User | null> {
  const result = await db
    .select({
      session: sessions,
      user: users,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);

  const row = result[0];
  if (!row) return null;

  if (row.session.expiresAt <= new Date()) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }

  return row.user;
}

function extractBearer(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

export const authMiddleware = () =>
  createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const bearerToken = extractBearer(c.req.header("authorization"));
    const cookieSessionId = getCookie(c, "session");
    const sessionId = bearerToken ?? cookieSessionId;

    if (!sessionId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const user = await resolveSession(sessionId);

    if (!user) {
      if (cookieSessionId && !bearerToken) {
        deleteCookie(c, "session", { path: "/" });
      }
      return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("user", user);
    await next();
  });
