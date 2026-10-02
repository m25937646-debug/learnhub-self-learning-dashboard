import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { storagePrepareUpload, storagePutStream } from "./storage";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("managed storage uploads", () => {
  it("sends the streamed body to a presigned PUT and returns a stable path", async () => {
    vi.stubEnv("MANUS_API_URL", "https://runtime.example.test");
    vi.stubEnv("MANUS_API_KEY", "test-only-key");
    const received: Buffer[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/v1/storage/presign/put")) {
        expect(url.searchParams.get("path")).toMatch(/^[\x21-\x7e]+$/);
        return new Response(
          JSON.stringify({ url: "https://uploads.example.test/signed-object" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.hostname === "uploads.example.test") {
        expect(init?.method).toBe("PUT");
        expect((init?.headers as Record<string, string>)["Content-Length"]).toBe("10");
        expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("application/pdf");
        expect(init?.duplex).toBe("half");
        const body = init?.body as unknown as AsyncIterable<Uint8Array>;
        for await (const chunk of body) received.push(Buffer.from(chunk));
        return new Response(null, { status: 200 });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const prepared = await storagePrepareUpload("42/learning-dashboard/test.pdf");
    await storagePutStream(
      prepared,
      Readable.from([Buffer.from("large "), Buffer.from("file")]),
      "application/pdf",
      10,
    ).catch(error => { throw error; });

    expect(prepared.url).toBe(`/manus-storage/${prepared.key}`);
    expect(prepared.key).toMatch(/^[\x21-\x7e]+$/);
    expect(Buffer.concat(received).toString("utf8")).toBe("large file");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
