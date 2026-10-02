import { describe, expect, it } from "vitest";
import { ENV } from "./_core/env";

describe("Gemini secret", () => {
  it.skipIf(!ENV.geminiApiKey)("authenticates against the lightweight models endpoint", async () => {
    expect(ENV.geminiApiKey).toBeTruthy();
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(ENV.geminiApiKey)}`);
    expect(response.ok).toBe(true);
  }, 20_000);
});
