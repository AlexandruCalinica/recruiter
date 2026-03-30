import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  DATABASE_URL: z.string().url(),
  OPENAI_API_KEY: z.string().default(""),
  EMBEDDING_PROVIDER: z.enum(["openai", "local"]).default("local"),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  GITHUB_REDIRECT_URI: z.string().url(),
  GITLAB_CLIENT_ID: z.string().default(""),
  GITLAB_CLIENT_SECRET: z.string().default(""),
  GITLAB_REDIRECT_URI: z.string().default(""),
  SESSION_SECRET: z.string().min(16),
});

export const env = envSchema.parse(process.env);
