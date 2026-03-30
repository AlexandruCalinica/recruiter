import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import * as schema from "../../db/schema";
import type { Database } from "../../db/index";

export interface TestDb {
  db: Database;
  client: PGlite;
  truncateAll(): Promise<void>;
  close(): Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  // ESM/CJS workaround for drizzle-kit/api in Vitest
  // See: https://github.com/drizzle-team/drizzle-orm/issues/4205
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const { pushSchema } = require("drizzle-kit/api") as typeof import("drizzle-kit/api");

  const client = new PGlite({ extensions: { vector } });
  const db = drizzle(client, { schema }) as unknown as Database;

  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector;`);

  const { apply } = await pushSchema(schema, db as any);
  await apply();

  return {
    db,
    client,
    async truncateAll() {
      await db.execute(sql`TRUNCATE footprints, sessions, users CASCADE`);
    },
    async close() {
      await client.close();
    },
  };
}
