import { describe, expect, it, vi } from "vitest";
import { isHiggsfieldHttpsUrl, pollHiggsfieldJob, type HiggsfieldJob } from "./higgsfield";

const AUTH = "Key test:secret";
const JOB: HiggsfieldJob = {
  request_id: "req-1",
  status_url: "https://platform.higgsfield.ai/requests/req-1/status",
  cancel_url: "https://platform.higgsfield.ai/requests/req-1/cancel",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("pollHiggsfieldJob", () => {
  it("returns the video once the status endpoint says the render completed", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: "in_progress", request_id: "req-1" }))
      .mockResolvedValueOnce(
        jsonResponse({ status: "completed", request_id: "req-1", video: { url: "https://cdn.example/v.mp4" } })
      );
    let now = 1_000;
    const result = await pollHiggsfieldJob(JOB, {
      timeoutMs: 5_000,
      now: () => now,
      sleep: async () => {
        now += 1_000;
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      authorization: AUTH,
    });
    expect(result.video?.url).toBe("https://cdn.example/v.mp4");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0]).toBe(JOB.status_url);
  });

  it("posts the provider cancel URL when the deadline passes", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input).endsWith("/cancel")) return jsonResponse({ status: "canceled" });
      return jsonResponse({ status: "in_progress", request_id: "req-1" });
    });
    let now = 1_000;
    await expect(
      pollHiggsfieldJob(JOB, {
        timeoutMs: 1_500,
        now: () => now,
        sleep: async () => {
          now += 2_000;
        },
        fetchImpl: fetchImpl as unknown as typeof fetch,
        authorization: AUTH,
      })
    ).rejects.toThrow(/timed out/);
    const cancelCall = fetchImpl.mock.calls.find((call) => String(call[0]).endsWith("/cancel"));
    expect(cancelCall?.[0]).toBe(JOB.cancel_url);
    expect(cancelCall?.[1]).toMatchObject({ method: "PUT", headers: { Authorization: AUTH } });
  });

  it("does not call a cancel URL on another host", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL) =>
      jsonResponse({ status: "in_progress", request_id: "req-1" })
    );
    let now = 1_000;
    await expect(
      pollHiggsfieldJob(
        { ...JOB, cancel_url: "https://evil.example/cancel" },
        {
          timeoutMs: 1_000,
          now: () => now,
          sleep: async () => {
            now += 5_000;
          },
          fetchImpl: fetchImpl as unknown as typeof fetch,
          authorization: AUTH,
        }
      )
    ).rejects.toThrow(/timed out/);
    expect(fetchImpl.mock.calls.every((call) => !String(call[0]).includes("evil.example"))).toBe(true);
  });
});

describe("isHiggsfieldHttpsUrl", () => {
  it("accepts only https on the provider host", () => {
    expect(isHiggsfieldHttpsUrl("https://platform.higgsfield.ai/requests/a/cancel")).toBe(true);
    expect(isHiggsfieldHttpsUrl("http://platform.higgsfield.ai/requests/a/cancel")).toBe(false);
    expect(isHiggsfieldHttpsUrl("https://evil.example/cancel")).toBe(false);
  });
});
