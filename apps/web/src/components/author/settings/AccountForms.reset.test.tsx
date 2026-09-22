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
}));
vi.mock("@/lib/supabase/storage", () => ({ uploadAvatar: vi.fn(), uploadProfileCover: vi.fn() }));

import ProfilePage from "../profile/ProfilePage";

type Element = React.ReactElement<{ children?: React.ReactNode; onChange?: unknown; onReset?: (event: { preventDefault: () => void }) => void }>;
function findControlledForm(node: React.ReactNode): Element | undefined {
  if (!React.isValidElement(node)) return undefined;
  const element = node as Element;
  if (element.type === "form" && element.props.onChange) return element;
  return React.Children.toArray(element.props.children).map(findControlledForm).find(Boolean);
}

describe("account action forms", () => {
  /**
   * React resets a form after a successful action, which blanks controlled
   * inputs. The settings pages inherit their guard from SettingsSectionForm and
   * are covered by its own test; the profile form still owns its form element.
   */
  it("prevents the native post-action reset from overwriting profile controlled values", () => {
    renderToStaticMarkup(
      <ProfilePage
        user={{ id: "sample" }}
        profile={{ displayName: "Sample Author", bio: "", isPublic: false, websiteUrl: "", socialLinks: { twitter: "", instagram: "sample", tiktok: "" } }}
      />
    );
    const form = findControlledForm(harness.main as React.ReactNode);
    expect(form).toBeDefined();
    expect(form?.props.onReset).toBeTypeOf("function");
    const preventDefault = vi.fn();
    form?.props.onReset?.({ preventDefault });
    expect(preventDefault).toHaveBeenCalled();
  });
});
