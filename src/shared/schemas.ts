import { z } from "zod";

export const footprintInputSchema = z.object({
  summary: z
    .string()
    .min(1)
    .describe("Human-readable summary of the work performed"),
  tags: z
    .array(z.string())
    .default([])
    .describe("Technology tags (e.g. 'postgresql', 'react')"),
  source: z
    .enum(["mcp", "api"])
    .default("api")
    .describe("Where the footprint originated"),
  metadata: z
    .record(z.unknown())
    .optional()
    .describe("Arbitrary context (repo, branch, file paths, etc.)"),
});

export const footprintSchema = footprintInputSchema.extend({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  embedding: z.array(z.number()).optional(),
  createdAt: z.date(),
});

export const matchQuerySchema = z.object({
  query: z
    .string()
    .min(1)
    .describe("Natural-language description of the project need"),
  topK: z.number().int().min(1).max(50).default(10),
});

export const footprintMatchSchema = z.object({
  summary: z.string().describe("Footprint summary"),
  tags: z.array(z.string()).describe("Technology tags"),
  score: z.number().describe("Cosine similarity score for this footprint"),
});

export const matchResultSchema = z.object({
  userId: z.string().uuid(),
  username: z.string().describe("GitHub username"),
  displayName: z.string().nullable().describe("Display name"),
  avatarUrl: z.string().url().nullable().describe("Avatar URL"),
  githubUrl: z.string().url().describe("GitHub profile URL"),
  score: z.number().describe("Best footprint cosine similarity score"),
  footprints: z.array(footprintMatchSchema).describe("Matching footprints, sorted by score"),
});

export const userSchema = z.object({
  id: z.string().uuid(),
  provider: z.enum(["github", "gitlab"]),
  providerUserId: z.string(),
  username: z.string(),
  displayName: z.string().optional(),
  avatarUrl: z.string().url().optional(),
  createdAt: z.date(),
});
