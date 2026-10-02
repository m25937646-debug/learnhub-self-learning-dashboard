import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

describe("learningData router", () => {
  it("exposes an authenticated get procedure", async () => {
    const caller = appRouter.createCaller({
      user: {
        id: 1,
        openId: "learning-data-test",
        email: "test@example.com",
        name: "Learning Data Test",
        loginMethod: "test",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    });

    const result = await caller.learningData.get({ userId: 1 });
    expect(result === null || typeof result === "object").toBe(true);
  });

  it("rejects recommendation snapshots outside safe bounds", async () => {
    const caller = appRouter.createCaller({
      user: null,
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    });

    await expect(
      caller.learningData.recommend({
        percent: 101,
        totalTitles: 1,
        completedTitles: 0,
        recentStudyHours: 0,
        domains: [],
      }),
    ).rejects.toThrow();
  });

  it("exposes a protected backup-version list", async () => {
    const caller = appRouter.createCaller({
      user: {
        id: 1,
        openId: "learning-data-test",
        email: "test@example.com",
        name: "Learning Data Test",
        loginMethod: "test",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    });

    const result = await caller.learningData.versions({ userId: 1 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeLessThanOrEqual(20);
  });

  it("rejects account-tagged reads for another user", async () => {
    const caller = appRouter.createCaller({
      user: {
        id: 1,
        openId: "learning-data-test",
        email: "test@example.com",
        name: "Learning Data Test",
        loginMethod: "test",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    });

    await expect(caller.learningData.get({ userId: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.learningData.versions({ userId: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.learningData.save({ userId: 2, data: {} })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.learningData.restore({ userId: 2, revision: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
