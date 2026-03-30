import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import { footprintInputSchema } from "../../shared/schemas";
import { ingestion } from "@/system";

export const footprintRoutes = new Hono<{ Variables: AuthVariables }>();

footprintRoutes.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = footprintInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const user = c.var.user;
  ingestion.cast("ingest", { userId: user.id, input: parsed.data });

  return c.json({ accepted: true }, 202);
});
