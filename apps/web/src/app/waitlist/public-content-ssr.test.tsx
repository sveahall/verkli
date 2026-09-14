import { createElement, type ComponentType, type ReactElement } from "react";
import { renderToReadableStream } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import AuthorLandingPage from "@/features/author/AuthorLandingPage";
import WaitlistPage from "./page";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient }));

type WaitlistProps = { searchParams: Promise<{ access?: string | string[] }> };

async function serverHtml(element: ReactElement): Promise<string> {
  const stream = await renderToReadableStream(element);
  await stream.allReady;
  return new Response(stream).text();
}

function waitlist(access?: string | string[]) {
  return serverHtml(createElement(WaitlistPage as ComponentType<WaitlistProps>, {
    searchParams: Promise.resolve({ access }),
  }));
}

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("public content before JavaScript runs", () => {
  it("server-renders the author heading and studio while auth is unresolved", async () => {
    const html = await serverHtml(createElement(AuthorLandingPage));
    expect(html).toContain('<h1 id="author-hero-title">One story.');
    expect(html).toContain("Every possibility.");
    expect(html).toContain('href="/waitlist"');
    expect(html).toContain("The Haunted Diary");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("server-renders the pending invitation explanation and support links", async () => {
    const html = await waitlist("pending");
    expect(html).toContain("This account is waiting for early access.");
    expect(html).toContain('href="/author/signin"');
    expect(html).toContain('href="/support"');
    expect(html).toContain('<h1 id="waitlist-heading">');
  });

  it.each([{ access: undefined }, { access: "approved" }, { access: ["pending", "approved"] }])(
    "does not infer an invitation status from other query values: $access", async ({ access }) => {
      const html = await waitlist(access);
      expect(html).toContain('<h1 id="waitlist-heading">');
      expect(html).not.toContain("This account is waiting for early access.");
    }
  );

  it("keeps locally stored signup history behind its hydration guard", async () => {
    vi.stubGlobal("window", { location: new URL("http://localhost/waitlist?access=pending") });
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => key.endsWith("_status") ? "success" : "918273",
    });
    const html = await waitlist("pending");
    expect(html).toContain("Loading signup…");
    expect(html).not.toContain("918273");
    expect(html).toContain("This account is waiting for early access.");
  });
});
