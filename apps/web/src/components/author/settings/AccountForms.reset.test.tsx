import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ main: null as unknown, dispatch: vi.fn(), transition: vi.fn() }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useActionState: (_action: unknown, initial: unknown) => [initial, harness.dispatch, false],
  startTransition: (callback: () => void) => { harness.transition(); callback(); },
}));
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());
vi.mock("@/features/author-workspaces/WorkspaceLayout", () => ({
  default: ({ main }: { main: React.ReactNode }) => { harness.main = main; return main; },
}));
vi.mock("@/features/author-workspaces/components/WorkspaceHeaderActions", () => ({ default: () => null }));
vi.mock("@/features/author/settings/actions", () => ({
  saveAuthorProfile: vi.fn(), updateAvatarPath: vi.fn(), updateCoverImagePath: vi.fn(),
  saveAuthorSettings: vi.fn(), signOutAllSessions: vi.fn(),
}));
vi.mock("@/lib/supabase/storage", () => ({ uploadAvatar: vi.fn(), uploadProfileCover: vi.fn() }));

import ProfilePage from "../profile/ProfilePage";
import SettingsPage from "./SettingsPage";

type Element = React.ReactElement<{ children?: React.ReactNode; onChange?: unknown; onReset?: (event: { preventDefault: () => void }) => void; onSubmit?: (event: { preventDefault: () => void; currentTarget: unknown }) => void }>;
function findControlledForm(node: React.ReactNode): Element | undefined {
  if (!React.isValidElement(node)) return undefined;
  const element = node as Element;
  if (element.type === "form" && element.props.onChange) return element;
  return React.Children.toArray(element.props.children).map(findControlledForm).find(Boolean);
}

describe("account action forms", () => {
  it.each([
    { label: "profile", page: <ProfilePage user={{ id: "sample" }} profile={{ displayName: "Sample Author", bio: "", isPublic: false, websiteUrl: "", socialLinks: { twitter: "", instagram: "sample", tiktok: "" } }} /> },
    { label: "settings", page: <SettingsPage user={{ email: "sample@example.test" }} profile={{ preferences: { default_language: "en", default_visibility: "private" } }} /> },
  ])("prevents the native post-action reset from overwriting $label controlled values", ({ page }) => {
    renderToStaticMarkup(page);
    const form = findControlledForm(harness.main as React.ReactNode);
    expect(form).toBeDefined();
    expect(form?.props.onReset).toBeTypeOf("function");
    const preventDefault = vi.fn();
    form?.props.onReset?.({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    // Dispatch explicitly so React does not schedule its host form reset.
    expect(form?.props.onSubmit).toBeTypeOf("function");
    const data = new FormData();
    data.set("default_language", "sv");
    data.set("default_visibility", "private");
    const currentTarget = {};
    const formData = vi.fn(function () { return data; });
    vi.stubGlobal("FormData", formData);
    const preventSubmit = vi.fn();
    form?.props.onSubmit?.({ preventDefault: preventSubmit, currentTarget });
    expect(preventSubmit).toHaveBeenCalledOnce();
    expect(formData).toHaveBeenCalledWith(currentTarget);
    expect(harness.transition).toHaveBeenCalledOnce();
    expect(harness.dispatch).toHaveBeenCalledWith(data);
    expect(harness.dispatch.mock.calls[0][0].get("default_visibility")).toBe("private");
  });
});
