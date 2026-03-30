import { createActor } from "libeam";
import { serve } from "@hono/node-server";
import type { Server } from "node:http";
import { app } from "../api/app";
import pino from "pino";

const logger = pino({ name: "server-actor" });

export const ServerActor = createActor((ctx, self, port: number) => {
  const server = serve({ fetch: app.fetch, port }, () => {
    logger.info(`server listening on http://localhost:${port}`);
  }) as Server;

  return self.onTerminate(() => {
    server.close();
    server.closeAllConnections();
    logger.info("server stopped");
  });
});
