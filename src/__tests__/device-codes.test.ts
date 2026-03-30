import { describe, it, expect } from "vitest";

async function freshModule() {
  const mod = await import("../auth/device-codes");
  return mod;
}

describe("device codes", () => {
  it("creates a code and retrieves it", async () => {
    const { createDeviceCode, hasDeviceCode } = await freshModule();
    const code = createDeviceCode();
    expect(code).toBeTruthy();
    expect(hasDeviceCode(code)).toBe(true);
  });

  it("returns false for unknown codes", async () => {
    const { hasDeviceCode } = await freshModule();
    expect(hasDeviceCode("nonexistent")).toBe(false);
  });

  it("completes a code with session data", async () => {
    const { createDeviceCode, completeDeviceCode, consumeDeviceCode } =
      await freshModule();
    const code = createDeviceCode();

    completeDeviceCode(code, "session-123", "testuser");

    const result = consumeDeviceCode(code);
    expect(result).toEqual({
      sessionId: "session-123",
      username: "testuser",
    });
  });

  it("consumeDeviceCode returns null for incomplete codes", async () => {
    const { createDeviceCode, consumeDeviceCode, hasDeviceCode } =
      await freshModule();
    const code = createDeviceCode();

    const result = consumeDeviceCode(code);
    expect(result).toBeNull();
    expect(hasDeviceCode(code)).toBe(true);
  });

  it("consumeDeviceCode deletes the code after successful consume", async () => {
    const {
      createDeviceCode,
      completeDeviceCode,
      consumeDeviceCode,
      hasDeviceCode,
    } = await freshModule();
    const code = createDeviceCode();
    completeDeviceCode(code, "session-123", "testuser");

    consumeDeviceCode(code);
    expect(hasDeviceCode(code)).toBe(false);
    expect(consumeDeviceCode(code)).toBeNull();
  });
});

describe("oauth state", () => {
  it("stores and consumes state without device code", async () => {
    const { storeOAuthState, consumeOAuthState } = await freshModule();
    storeOAuthState("state-abc");

    const result = consumeOAuthState("state-abc");
    expect(result).toEqual({ deviceCode: undefined });
  });

  it("stores and consumes state with device code", async () => {
    const { storeOAuthState, consumeOAuthState } = await freshModule();
    storeOAuthState("state-xyz", "device-123");

    const result = consumeOAuthState("state-xyz");
    expect(result).toEqual({ deviceCode: "device-123" });
  });

  it("returns null for unknown state", async () => {
    const { consumeOAuthState } = await freshModule();
    expect(consumeOAuthState("unknown")).toBeNull();
  });

  it("consumes state only once", async () => {
    const { storeOAuthState, consumeOAuthState } = await freshModule();
    storeOAuthState("state-once");

    consumeOAuthState("state-once");
    expect(consumeOAuthState("state-once")).toBeNull();
  });
});
