import { db } from "../db/index";
import { footprints } from "../db/schema";
import { generateEmbedding } from "./embedding";
import type { FootprintInput } from "../shared/types";

export async function ingestFootprint(
  userId: string,
  input: FootprintInput
) {
  const embedding = await generateEmbedding(input.summary);

  const [inserted] = await db
    .insert(footprints)
    .values({
      userId,
      summary: input.summary,
      tags: input.tags,
      source: input.source,
      metadata: input.metadata,
      embedding,
    })
    .returning();

  return inserted;
}
