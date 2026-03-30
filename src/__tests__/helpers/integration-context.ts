import { vi } from "vitest";
import { createTestDb, type TestDb } from "./test-db";
import { deterministicEmbedding } from "./seed";

export interface IntegrationContextOptions {
  /** "stub" = null system (default), "live" = real actor system with IngestionActor */
  system?: "stub" | "live";
}

export interface IntegrationContext {
  testDb: TestDb;
  /** Tears down DB + actor system (if live). Call in afterAll. */
  teardown(): Promise<void>;
}

/**
 * Sets up the common integration test mocks:
 *  - `@/db/index`            → PGlite test database
 *  - `@/services/embedding`  → deterministic embedding function
 *  - `@/system`              → stubbed (default) or live actor system
 *
 * Call in `beforeAll`, use `ctx.testDb` for seeding, call `ctx.teardown()` in `afterAll`.
 */
export async function createIntegrationContext(
  opts?: IntegrationContextOptions,
): Promise<IntegrationContext> {
  const mode = opts?.system ?? "stub";
  const testDb = await createTestDb();

  vi.doMock("@/db/index", () => ({ db: testDb.db }));
  vi.doMock("@/services/embedding", () => ({
    generateEmbedding: vi.fn((text: string) =>
      Promise.resolve(deterministicEmbedding(text)),
    ),
    EMBEDDING_DIMENSIONS: 384,
  }));

  if (mode === "stub") {
    vi.doMock("@/system", () => ({
      system: null,
      ingestion: null,
      server: null,
      shutdown: async () => {},
    }));

    return {
      testDb,
      async teardown() {
        await testDb.close();
      },
    };
  }

  const { createSystem } = await import("libeam");
  const system = createSystem({ nodeId: "test-integration" });
  const { IngestionActor } = await import("../../actors/ingestion");
  const ingestion = system.spawn(IngestionActor, { name: "ingestion" });

  vi.doMock("@/system", () => ({
    system,
    ingestion,
    server: null,
    shutdown: () => system.shutdown(),
  }));

  return {
    testDb,
    async teardown() {
      await system.shutdown();
      await testDb.close();
    },
  };
}
