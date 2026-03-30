import { createSystem, createLogger, loggerConfig } from "libeam";

import { env } from '@/env'
import { ServerActor, IngestionActor } from '@/actors'

loggerConfig.level = env.NODE_ENV === 'development' ? 'debug' : 'info';

const logger = createLogger("System");
const system = createSystem({ nodeId: "recruiter" });

const server = system.spawn(ServerActor, { name: "server", args: [env.PORT] });
const ingestion = system.spawn(IngestionActor, { name: "ingestion" });

async function shutdown() {
  logger.info("shutting down...");
  await system.shutdown();
  logger.info("shutdown complete");
  process.exit(0);
}

export {
  shutdown,
  system,
  server,
  ingestion
}
