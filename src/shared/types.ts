import type { z } from "zod";
import type {
  footprintInputSchema,
  footprintSchema,
  matchQuerySchema,
  matchResultSchema,
  userSchema,
} from "./schemas";

export type FootprintInput = z.infer<typeof footprintInputSchema>;
export type Footprint = z.infer<typeof footprintSchema>;
export type MatchQuery = z.infer<typeof matchQuerySchema>;
export type MatchResult = z.infer<typeof matchResultSchema>;
export type User = z.infer<typeof userSchema>;
