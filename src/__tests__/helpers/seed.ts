import { users, sessions, footprints } from "../../db/schema";
import type { Database } from "../../db/index";

export interface TestUser {
  id: string;
  provider: string;
  providerUserId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: Date;
}

export async function seedUser(
  db: Database,
  overrides: Partial<{
    provider: string;
    providerUserId: string;
    username: string;
    displayName: string;
    avatarUrl: string;
  }> = {}
): Promise<TestUser> {
  const uid = Math.random().toString(36).slice(2, 10);
  const values = {
    provider: overrides.provider ?? "github",
    providerUserId: overrides.providerUserId ?? `test-${uid}`,
    username: overrides.username ?? `testuser-${uid}`,
    displayName: overrides.displayName ?? null,
    avatarUrl: overrides.avatarUrl ?? null,
  };

  const [row] = await db.insert(users).values(values).returning();
  return row as TestUser;
}

export interface TestSession {
  sessionId: string;
  userId: string;
  expiresAt: Date;
}

export async function seedSession(
  db: Database,
  userId: string,
  expiresIn: number = 60 * 60 * 1000
): Promise<TestSession> {
  const sessionId = `test-session-${Math.random().toString(36).slice(2, 14)}`;
  const expiresAt = new Date(Date.now() + expiresIn);

  await db.insert(sessions).values({ id: sessionId, userId, expiresAt });
  return { sessionId, userId, expiresAt };
}

export async function seedExpiredSession(
  db: Database,
  userId: string
): Promise<TestSession> {
  return seedSession(db, userId, -60_000);
}

export async function seedFootprint(
  db: Database,
  opts: {
    userId: string;
    summary: string;
    tags?: string[];
    source?: string;
    embedding: number[];
  }
) {
  const [row] = await db
    .insert(footprints)
    .values({
      userId: opts.userId,
      summary: opts.summary,
      tags: opts.tags ?? [],
      source: opts.source ?? "api",
      embedding: opts.embedding,
    })
    .returning();
  return row;
}

const DIMS = 384;

// Deterministic hash → sin spread → normalize to unit vector.
// Same text always produces the same 384-dim vector.
export function deterministicEmbedding(text: string): number[] {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }

  const vec = new Array(DIMS);
  for (let i = 0; i < DIMS; i++) {
    vec[i] = Math.sin(hash * (i + 1) * 0.001);
  }

  const norm = Math.sqrt(vec.reduce((s: number, v: number) => s + v * v, 0));
  return vec.map((v: number) => v / norm);
}
