import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

describe("assistant router", () => {
  const caller = appRouter.createCaller({
    user: null,
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  });

  it("exposes personal chat for the app guest experience", () => {
    expect(typeof caller.assistant.chat).toBe("function");
  });

  it("requires authentication before using voice transcription", async () => {
    await expect(
      caller.assistant.transcribe({
        audioUrl: "https://example.com/voice.webm",
        language: "ar",
      }),
    ).rejects.toThrow();
  });
});
