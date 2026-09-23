import { afterEach, describe, expect, it, vi } from "vitest";
import { createProductionSettings } from "./model";
import { loadRemoteDraft, saveRemoteDraft, exportRemoteDraft, resolveAccountDraft, RemoteDraftError } from "./remote-draft";

const localPath = "preview/front-00000000-0000-4000-8000-000000000001.jpg";
const remotePath = "owner/book/version/front-00000000-0000-4000-8000-000000000001.png";
const localArtwork = { path: localPath, url: "data:image/png;base64,aGVsbG8=", width: 100, height: 150 };
const remoteArtwork = { ...localArtwork, path: remotePath, url: "https://storage.example.com/cover.png?token=fresh" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("account edition API", () => {
  it("loads the selected edition with uncached authenticated requests", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ settings: null, revision: 0, artwork: {} }));
    vi.stubGlobal("fetch", fetcher);
    expect(await loadRemoteDraft("book", "version")).toEqual({ settings: null, revision: 0, artwork: {} });
    expect(fetcher.mock.calls[0][0]).toBe("/api/author/books/book/production?versionId=version");
    expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: "same-origin", cache: "no-store" });
  });

  it("never turns a failed or malformed load into an empty writable edition", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: "unavailable", message: "Private storage is unavailable." }, 503)));
    await expect(loadRemoteDraft("book", "version")).rejects.toThrow("Private storage is unavailable.");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ settings: null, revision: 4, artwork: {} })));
    await expect(loadRemoteDraft("book", "version")).rejects.toThrow("could not be read");
  });

  it("explains connection failures while preserving caller-initiated cancellation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(loadRemoteDraft("book", "version")).rejects.toThrow("connection");
    const cancelled = new DOMException("Aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(cancelled));
    await expect(loadRemoteDraft("book", "version")).rejects.toBe(cancelled);
  });

  it("rejects a save confirmation that refers to different artwork", async () => {
    const settings = createProductionSettings();
    const returned = { ...settings, cover: { ...settings.cover, frontPath: remotePath } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ settings: returned, revision: 1 })));
    await expect(saveRemoteDraft("book", "version", 0, settings, {})).rejects.toThrow("could not be confirmed");
  });

  it("uploads browser artwork before saving stable paths without changing the input draft", async () => {
    const settings = createProductionSettings(); settings.cover.frontPath = localPath;
    const expected = { ...settings, cover: { ...settings.cover, frontPath: remotePath } };
    const fetcher = vi.fn().mockResolvedValueOnce(json(remoteArtwork)).mockResolvedValueOnce(json({ settings: expected, revision: 1 }));
    vi.stubGlobal("fetch", fetcher);
    const saved = await saveRemoteDraft("book", "version", 0, settings, { front: localArtwork });
    const upload = fetcher.mock.calls[0][1].body as FormData;
    expect(upload.get("side")).toBe("front");
    expect(upload.get("file")).toBeInstanceOf(File);
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ versionId: "version", revision: 0, settings: expected });
    expect(saved).toEqual({ revision: 1, settings: expected, artwork: { front: remoteArtwork } });
    expect(settings.cover.frontPath).toBe(localPath);
    expect(localArtwork.path).toBe(localPath);
  });

  it("does not PUT a draft after an artwork import fails", async () => {
    const settings = createProductionSettings(); settings.cover.frontPath = localPath;
    const fetcher = vi.fn().mockResolvedValue(json({ error: "upload_failed", message: "Image storage failed." }, 503));
    vi.stubGlobal("fetch", fetcher);
    await expect(saveRemoteDraft("book", "version", 0, settings, { front: localArtwork })).rejects.toThrow("Image storage failed.");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("preserves revision conflicts as a distinct recoverable error", async () => {
    const settings = createProductionSettings();
    const fetcher = vi.fn().mockResolvedValue(json({ error: "conflict", message: "A newer edition was saved." }, 409));
    vi.stubGlobal("fetch", fetcher);
    const failure = await saveRemoteDraft("book", "version", 2, settings, {}).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(RemoteDraftError);
    expect(failure).toMatchObject({ status: 409, message: "A newer edition was saved." });
    expect(JSON.parse(fetcher.mock.calls[0][1].body).revision).toBe(2);
  });

  it("exports only a saved revision and checks the actual PDF response", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(exportRemoteDraft("book", "version", 0, "interior")).rejects.toThrow("Save");
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockResolvedValueOnce(new Response("%PDF-1.7", { headers: { "Content-Type": "application/pdf", "X-Page-Count": "12", "X-Production-Warnings": JSON.stringify(["Check your printer's paper specification."]) } }));
    const result = await exportRemoteDraft("book", "version", 3, "interior");
    expect(result.pageCount).toBe(12);
    expect(result.notes).toEqual(["Check your printer's paper specification."]);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ versionId: "version", revision: 3, kind: "interior" });
    fetcher.mockResolvedValueOnce(json({ message: "Not a PDF" }));
    await expect(exportRemoteDraft("book", "version", 3, "cover")).rejects.toThrow("PDF");
  });
});

describe("account draft restoration", () => {
  it("retains incomplete pending edits and the original revision when another device saved", () => {
    const saved = createProductionSettings({ title: "Original" });
    const pending = { settings: { ...saved, title: "My work", isbn: "978" }, savedSettings: saved, artwork: {}, revision: 2, needsSave: false };
    const remote = { settings: { ...saved, title: "Other device" }, revision: 3, artwork: {} };
    const result = resolveAccountDraft(remote, pending, null, saved);
    expect(result.conflict).toBe(true);
    expect(result.draft.settings).toEqual(pending.settings);
    expect(result.draft.revision).toBe(2);
    expect(result.draft.savedSettings).toEqual(saved);
  });

  it("refreshes matching saved artwork URLs while retaining locally staged artwork", () => {
    const settings = createProductionSettings(); settings.cover.frontPath = remotePath;
    const pending = { settings, savedSettings: { ...settings, title: "Old" }, artwork: { front: { ...remoteArtwork, url: "https://storage.example.com/expired" } }, revision: 3, needsSave: false };
    const result = resolveAccountDraft({ settings, revision: 3, artwork: { front: remoteArtwork } }, pending, null, settings);
    expect(result.draft.artwork.front?.url).toBe(remoteArtwork.url);
  });

  it("offers an existing browser draft for migration without claiming it is saved to the account", () => {
    const seed = createProductionSettings();
    const local = { settings: { ...seed, title: "Browser work" }, artwork: {} };
    const result = resolveAccountDraft({ settings: null, revision: 0, artwork: {} }, undefined, local, seed);
    expect(result.draft.settings.title).toBe("Browser work");
    expect(result.draft.needsSave).toBe(true);
    expect(result.migrating).toBe(true);
    const existing = resolveAccountDraft({ settings: seed, revision: 1, artwork: {} }, undefined, local, seed);
    expect(existing.draft.settings).toEqual(seed);
    expect(existing.migrating).toBe(false);
  });
});
