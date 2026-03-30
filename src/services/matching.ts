import { db } from "../db/index";
import { generateEmbedding } from "./embedding";
import { sql } from "drizzle-orm";

const MAX_FOOTPRINTS_PER_USER = 5;
const OVERFETCH_MULTIPLIER = 5;

interface FootprintMatch {
  summary: string;
  tags: string[];
  score: number;
}

interface MatchCandidate {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  githubUrl: string;
  score: number;
  footprints: FootprintMatch[];
}

export async function findMatches(
  query: string,
  topK: number
): Promise<MatchCandidate[]> {
  const queryEmbedding = await generateEmbedding(query);
  const vectorLiteral = `[${queryEmbedding.join(",")}]`;
  const fetchLimit = topK * OVERFETCH_MULTIPLIER;

  const rawResults = await db.execute(sql`
    SELECT
      f.user_id,
      u.username,
      u.display_name,
      u.avatar_url,
      1 - (f.embedding <=> ${vectorLiteral}::vector) AS score,
      f.summary,
      f.tags
    FROM footprints f
    JOIN users u ON u.id = f.user_id
    WHERE f.embedding IS NOT NULL
    ORDER BY f.embedding <=> ${vectorLiteral}::vector
    LIMIT ${fetchLimit}
  `);

  const results = ((rawResults as any).rows ?? rawResults) as Array<Record<string, unknown>>;
  const userMap = new Map<string, MatchCandidate>();

  for (const r of results) {
    const userId = r.user_id as string;
    const score = r.score as number;
    const footprint: FootprintMatch = {
      summary: r.summary as string,
      tags: r.tags as string[],
      score,
    };

    const existing = userMap.get(userId);
    if (existing) {
      if (existing.footprints.length < MAX_FOOTPRINTS_PER_USER) {
        existing.footprints.push(footprint);
      }
      if (score > existing.score) {
        existing.score = score;
      }
    } else {
      const username = r.username as string;
      userMap.set(userId, {
        userId,
        username,
        displayName: (r.display_name as string | null) ?? null,
        avatarUrl: (r.avatar_url as string | null) ?? null,
        githubUrl: `https://github.com/${username}`,
        score,
        footprints: [footprint],
      });
    }
  }

  return Array.from(userMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
