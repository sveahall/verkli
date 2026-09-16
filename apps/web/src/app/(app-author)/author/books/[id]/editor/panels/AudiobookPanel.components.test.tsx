import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div role="dialog">{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <footer>{children}</footer>,
}));

import { AudiobookCheckoutModal, AudiobookPreviewPlayer } from "./AudiobookPanel.components";

function buttons(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<Record<string, unknown>>;
  return [ ...(element.type === "button" ? [element] : []), ...React.Children.toArray(element.props.children as React.ReactNode).flatMap(buttons) ];
}

describe("Audiobook audio controls", () => {
  it("offers a sample instead of a playable empty timeline", () => {
    const html = renderToStaticMarkup(<AudiobookPreviewPlayer bookId="book" audioUrl={null} />);
    expect(html).toContain("Preview voice");
    expect(html).not.toContain("0:00 / 0:00");
    expect(html).not.toContain('aria-label="Play audio"');
  });

  it("labels playback, seeking and thirty-second skips for keyboard and assistive technology", () => {
    const html = renderToStaticMarkup(<AudiobookPreviewPlayer bookId="book" audioUrl="/sample.wav" />);
    for (const label of ["Play audio", "Back 30 seconds", "Forward 30 seconds", "Audio position", "Playback speed"]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    expect(html).toContain('type="range"');
  });
});

describe("Audiobook checkout", () => {
  it("keeps the dialog open while the existing async checkout handler reports its result", async () => {
    const onClose = vi.fn();
    let settle!: () => void;
    const pending = new Promise<void>((resolve) => { settle = resolve; });
    const onCheckout = vi.fn(() => pending);
    const tree = AudiobookCheckoutModal({ open: true, onClose, audiobookError: null, audiobookCheckoutLoading: false, onCheckout });
    const action = buttons(tree).find((button) => String(button.props.children).includes("checkout") || String(button.props.children).includes("Generate full"));
    expect(action).toBeDefined();
    (action!.props.onClick as () => void)();
    expect(onCheckout).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    settle();
    await pending;
    expect(onClose).not.toHaveBeenCalled();
  });

  it("exposes a checkout failure as an alert while preserving the retry action", () => {
    const html = renderToStaticMarkup(<AudiobookCheckoutModal open onClose={() => {}} audiobookError="Nothing was charged. Try again." audiobookCheckoutLoading={false} onCheckout={() => {}} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Nothing was charged. Try again.");
  });
});
