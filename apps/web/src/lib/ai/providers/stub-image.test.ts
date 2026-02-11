import { describe, it, expect } from "vitest";
import { StubImageProvider } from "./stub-image";

describe("StubImageProvider", () => {
  const provider = new StubImageProvider();

  it("has name 'stub-image'", () => {
    expect(provider.name).toBe("stub-image");
  });

  it("returns null imageUrl (never writes to storage)", async () => {
    const result = await provider.generate({ prompt: "A sunset over the ocean" });
    expect(result.imageUrl).toBeNull();
  });

  it("returns default 1024x1024 dimensions", async () => {
    const result = await provider.generate({ prompt: "Test" });
    expect(result.width).toBe(1024);
    expect(result.height).toBe(1024);
  });

  it("respects custom dimensions", async () => {
    const result = await provider.generate({
      prompt: "Test",
      width: 512,
      height: 768,
    });
    expect(result.width).toBe(512);
    expect(result.height).toBe(768);
  });

  it("reports supported styles", () => {
    expect(provider.getSupportedStyles()).toEqual(["default"]);
  });
});
