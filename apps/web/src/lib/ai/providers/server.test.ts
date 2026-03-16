import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getCopywriterProvider, getImageProvider } from "./server";

const originalNodeEnv = process.env.NODE_ENV;
const originalCopywriterProvider = process.env.AI_COPYWRITER_PROVIDER;
const originalImageProvider = process.env.AI_IMAGE_PROVIDER;

function setNodeEnv(value: string | undefined) {
  Reflect.set(process.env, "NODE_ENV", value);
}

describe("ai provider registry", () => {
  afterEach(() => {
    setNodeEnv(originalNodeEnv);
    process.env.AI_COPYWRITER_PROVIDER = originalCopywriterProvider;
    process.env.AI_IMAGE_PROVIDER = originalImageProvider;
  });

  it("allows stub providers outside production", () => {
    setNodeEnv("test");
    delete process.env.AI_COPYWRITER_PROVIDER;
    delete process.env.AI_IMAGE_PROVIDER;

    expect(getCopywriterProvider().name).toBe("stub-copywriter");
    expect(getImageProvider().name).toBe("stub-image");
  });

  it("rejects stub copywriter providers in production", () => {
    setNodeEnv("production");
    delete process.env.AI_COPYWRITER_PROVIDER;

    expect(() => getCopywriterProvider()).toThrow(
      /Stub AI providers must not be used in production/,
    );
  });

  it("rejects stub image providers in production", () => {
    setNodeEnv("production");
    delete process.env.AI_IMAGE_PROVIDER;

    expect(() => getImageProvider()).toThrow(
      /Stub AI providers must not be used in production/,
    );
  });
});
