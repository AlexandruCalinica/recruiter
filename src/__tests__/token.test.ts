import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { readToken, writeToken } from "../mcp/token";

const testDir = path.join(os.tmpdir(), `recruiter-test-${process.pid}`);
const testTokenPath = path.join(testDir, "token.json");

beforeEach(() => {
  process.env.XDG_CONFIG_HOME = testDir;
  fs.rmSync(path.join(testDir, "recruiter"), { recursive: true, force: true });
});

afterEach(() => {
  fs.rmSync(path.join(testDir, "recruiter"), { recursive: true, force: true });
  delete process.env.XDG_CONFIG_HOME;
});

describe("token storage", () => {
  it("returns null when no token file exists", () => {
    expect(readToken()).toBeNull();
  });

  it("writes and reads a token", () => {
    writeToken("session-xyz");
    const token = readToken();
    expect(token).toBe("session-xyz");
  });

  it("overwrites existing token", () => {
    writeToken("first-token");
    writeToken("second-token");
    expect(readToken()).toBe("second-token");
  });

  it("stores token as JSON with createdAt", () => {
    writeToken("session-xyz");
    const raw = fs.readFileSync(
      path.join(testDir, "recruiter", "token.json"),
      "utf-8"
    );
    const parsed = JSON.parse(raw);
    expect(parsed.token).toBe("session-xyz");
    expect(parsed.createdAt).toBeTruthy();
  });

  it("returns null for corrupt token file", () => {
    const dir = path.join(testDir, "recruiter");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "token.json"), "not-json", "utf-8");
    expect(readToken()).toBeNull();
  });
});
