import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function tokenDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg || path.join(os.homedir(), ".config");
  return path.join(base, "recruiter");
}

function tokenPath(): string {
  return path.join(tokenDir(), "token.json");
}

interface StoredToken {
  token: string;
  createdAt: string;
}

export function readToken(): string | null {
  try {
    const raw = fs.readFileSync(tokenPath(), "utf-8");
    const parsed = JSON.parse(raw) as StoredToken;
    return parsed.token || null;
  } catch {
    return null;
  }
}

export function writeToken(token: string): void {
  const dir = tokenDir();
  fs.mkdirSync(dir, { recursive: true });
  const data: StoredToken = { token, createdAt: new Date().toISOString() };
  fs.writeFileSync(tokenPath(), JSON.stringify(data, null, 2), "utf-8");
}
