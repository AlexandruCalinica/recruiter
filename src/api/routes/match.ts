import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import { matchQuerySchema } from "../../shared/schemas";
import { findMatches } from "../../services/matching";

export const matchRoutes = new Hono<{ Variables: AuthVariables }>();

matchRoutes.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = matchQuerySchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  try {
    const results = await findMatches(parsed.data.query, parsed.data.topK);
    return c.json({ results });
  } catch {
    return c.json({ error: "Match search failed" }, 500);
  }
});
