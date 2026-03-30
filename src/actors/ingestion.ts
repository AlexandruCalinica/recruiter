import { createActor } from "libeam";
import { db } from "../db/index";
import { footprints } from "../db/schema";
import { generateEmbedding } from "../services/embedding";
import type { FootprintInput } from "../shared/types";
import pino from "pino";

const logger = pino({ name: "ingestion-actor" });

interface IngestPayload {
  userId: string;
  input: FootprintInput;
}

export const IngestionActor = createActor((ctx, self) => {
  return self
    .onCast("ingest", async (payload: IngestPayload) => {
      const { userId, input } = payload;

      try {
        logger.info({ userId, summary: input.summary }, "ingesting footprint");

        const embedding = await generateEmbedding(input.summary);

        await db
          .insert(footprints)
          .values({
            userId,
            summary: input.summary,
            tags: input.tags,
            source: input.source,
            metadata: input.metadata,
            embedding,
          });

        logger.info({ userId }, "footprint ingested");
      } catch (err) {
        logger.error({ err, userId }, "ingestion failed");
      }
    })
    .onTerminate(() => {
      logger.info("ingestion actor terminated");
    });
});
