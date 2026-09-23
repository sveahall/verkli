import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ dispatch: vi.fn(), pending: false }));
// The first case calls the component as a plain function to reach the element
// it returns, which needs the hooks stubbed rather than a live dispatcher. The
// stubs return initial values, which is also what a server render would see.
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useActionState: (_action: unknown, initial: unknown) => [initial, harness.dispatch, harness.pending],
  useState: (initial: unknown) => [typeof initial === "function" ? (initial as () => unknown)() : initial, vi.fn()],
}));

import SettingsSectionForm from "./SettingsSectionForm";

const noop = async () => ({ ok: true, message: "" });

/**
 * Every settings page is its own form now that the sections live on separate
 * routes. They all share this wrapper, so the behaviour that used to be
 * asserted once per page is asserted once here.
 */
describe("settings section form", () => {
  it("blocks the native post-action reset that would blank controlled inputs", () => {
    const element = SettingsSectionForm({ title: "Notifications", action: noop, children: null }) as React.ReactElement<{
      onReset?: (event: { preventDefault: () => void }) => void;
      onChange?: unknown;
    }>;
    expect(element.type).toBe("form");
    expect(element.props.onChange).toBeTypeOf("function");
    expect(element.props.onReset).toBeTypeOf("function");
    const preventDefault = vi.fn();
    element.props.onReset?.({ preventDefault });
    expect(preventDefault).toHaveBeenCalled();
  });

  it("renders one save control and a live region for the result", () => {
    const html = renderToStaticMarkup(
      <SettingsSectionForm title="Notifications" description="What we email you about." action={noop} saveLabel="Save notifications">
        <input name="email_notifications" defaultValue="true" />
      </SettingsSectionForm>
    );
    expect(html.match(/<button type="submit"/g)).toHaveLength(1);
    expect(html).toContain("Save notifications");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("What we email you about.");
  });

  it("puts a section-level control beside the title, where a master switch belongs", () => {
    const html = renderToStaticMarkup(
      <SettingsSectionForm title="AI" action={noop} titleAside={<span data-testid="switch">switch</span>}>
        <p>body</p>
      </SettingsSectionForm>
    );
    expect(html.indexOf("switch")).toBeGreaterThan(html.indexOf(">AI<"));
    expect(html.indexOf("switch")).toBeLessThan(html.indexOf("body"));
  });
});
