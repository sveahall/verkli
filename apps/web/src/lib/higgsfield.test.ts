import { createRequire } from "node:module";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/lib/usage/meter", () => ({ recordUsage: vi.fn() }));
import { recordUsage } from "@/lib/usage/meter";
import { generateImageToVideo, assertHiggsfieldConfigured } from "./higgsfield";

// Exercise the installed SDK's actual v1 serialization and polling contract.
const require = createRequire(import.meta.url);
const axios = require("axios");
const originalAdapter = axios.defaults.adapter;
afterEach(() => { axios.defaults.adapter = originalAdapter; vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("wraps v1 params, polls a job set and meters its completed video", async () => {
  vi.stubEnv("HF_CREDENTIALS", "test-key:test-secret");
  const requests: { url: string; data?: string }[] = [];
  axios.defaults.adapter = async (config: { url: string; data?: string }) => {
    requests.push(config);
    return { status: 200, statusText: "OK", headers: {}, config, data: { id: "set-1", jobs: [{ id: "render-1", status: config.url.includes("job-sets") ? "completed" : "queued", results: { raw: { type: "video", url: "https://media.example/trailer.mp4" } } }] } };
  };
  const meter = { userId: "author", pipeline: "marketing" as const, bookId: "book" };
  await expect(generateImageToVideo({ prompt: "A boat", imageUrl: "https://media.example/cover.jpg", meter })).resolves.toEqual({ requestId: "set-1", videoUrl: "https://media.example/trailer.mp4" });
  expect(requests.map(request => request.url)).toEqual(["/v1/image2video/dop", "/v1/job-sets/set-1"]);
  expect(JSON.parse(requests[0].data!)).toMatchObject({ params: { model: "dop-turbo", prompt: "A boat", input_images: [{ type: "image_url", image_url: "https://media.example/cover.jpg" }] } });
  expect(recordUsage).toHaveBeenCalledWith(meter, [expect.objectContaining({ requestId: "set-1", provider: "higgsfield", quantity: 1 })]);
});
it.each(["", "bad", ":secret", "key:"])("rejects incomplete credentials before budget admission (%s)", credentials => {
  vi.stubEnv("HF_CREDENTIALS", credentials);
  expect(() => assertHiggsfieldConfigured()).toThrow(/HF_CREDENTIALS/);
});
