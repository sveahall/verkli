import { Children, isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VoiceList, { type VoiceRow } from "./VoiceList";

const mocks = vi.hoisted(() => ({
  hookIndex: 0,
  setVoices: vi.fn(),
  setPending: vi.fn(),
  setError: vi.fn(),
  fetch: vi.fn(),
  confirm: vi.fn(),
}));
vi.mock("react", async () => ({
  ...(await vi.importActual<typeof import("react")>("react")),
  useState: (initial: unknown) => [initial, [mocks.setVoices, mocks.setPending, mocks.setError][mocks.hookIndex++]],
  useTransition: () => [false, (callback: () => void) => callback()],
}));

const voice: VoiceRow = {
  id: "synthetic-voice", elevenlabs_voice_id: "synthetic-provider-voice", name: "My voice",
  description: null, source: "cloned", is_default: false, status: "ready", created_at: "2026-09-22",
};

function clickDelete(node: ReactNode): boolean {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ onClick?: () => void; children?: ReactNode }>(child)) continue;
    if (child.type === "button" && child.props.onClick) {
      child.props.onClick();
      return true;
    }
    if (clickDelete(child.props.children)) return true;
  }
  return false;
}

describe("voice deletion feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hookIndex = 0;
    mocks.confirm.mockReturnValue(true);
    vi.stubGlobal("window", { confirm: mocks.confirm });
    vi.stubGlobal("fetch", mocks.fetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("explains the ownership block and keeps the voice in the list", async () => {
    const message = "External voice ownership must be verified manually before deletion. No changes were made.";
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ error: "VOICE_DELETION_REQUIRES_VERIFICATION", message }), { status: 409 }));
    expect(clickDelete(VoiceList({ initialVoices: [voice] }))).toBe(true);
    await vi.waitFor(() => expect(mocks.setError).toHaveBeenLastCalledWith(message));
    expect(mocks.setVoices).not.toHaveBeenCalled();
    expect(mocks.setPending).toHaveBeenLastCalledWith(null);
    expect(mocks.confirm).not.toHaveBeenCalledWith(expect.stringContaining("removes it from ElevenLabs"));
  });

  it("does not send a deletion request after cancellation", () => {
    mocks.confirm.mockReturnValue(false);
    clickDelete(VoiceList({ initialVoices: [voice] }));
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.setVoices).not.toHaveBeenCalled();
  });

  it("still removes an already deleted row after a successful response", async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ ok: true, alreadyDeleted: true }), { status: 200 }));
    clickDelete(VoiceList({ initialVoices: [voice] }));
    await vi.waitFor(() => expect(mocks.setVoices).toHaveBeenCalledOnce());
    expect(mocks.setVoices.mock.calls[0][0]([voice])).toEqual([]);
  });
});
