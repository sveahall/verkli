import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/author/settings/actions", () => ({ saveAuthorProfile: vi.fn(), updateAvatarPath: vi.fn(), updateCoverImagePath: vi.fn(), saveAuthorSettings: vi.fn(), signOutAllSessions: vi.fn() }));
vi.mock("@/lib/supabase/storage", () => ({ uploadAvatar: vi.fn(), uploadProfileCover: vi.fn() }));
vi.mock("@/features/author-workspaces/components/WorkspaceHeaderActions", () => ({ default: () => null }));
import ProfilePage from "./ProfilePage";
import AccountStudioPreview from "@/app/dev/account-studio/AccountStudioPreview";
import shellStyles from "@/features/author-shell/AuthorAppShell.module.css";

const profile = { displayName: "Sample Author", bio: "Stories by the sea.", isPublic: false, websiteUrl: "", socialLinks: { twitter: "", instagram: "", tiktok: "" } };

describe("author profile editor", () => {
  it("renders the populated social field and its reader preview from the same value", () => {
    const html = renderToStaticMarkup(<AccountStudioPreview />);
    const instagram = html.match(/<input[^>]*id="profile-instagram"[^>]*>/)?.[0];
    expect(instagram).toContain('name="social_instagram"');
    expect(instagram).toContain('value="alexlind.example"');
    expect(html).toContain("Instagram: @alexlind.example");
  });

  it("uses the author shell typography in the interactive account fixture", () => {
    const html = renderToStaticMarkup(<AccountStudioPreview />);
    expect(html).toContain(shellStyles.shell);
  });

  it("offers one keyboard accessible cover action and a labelled preview", () => {
    const html = renderToStaticMarkup(<ProfilePage user={{ id: "sample" }} profile={profile} />);
    expect(html.match(/>Add cover photo<\/button>/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Profile preview"');
    expect(html).toContain("Preview updates as you type");
    expect(html).toContain('aria-label="Public profile"');
  });

  it("keeps every profile field and associates visible labels with social inputs", () => {
    const html = renderToStaticMarkup(<ProfilePage user={{ id: "sample" }} profile={profile} />);
    for (const field of ["display_name", "bio", "website_url", "social_twitter", "social_instagram", "social_tiktok", "is_public"]) expect(html).toContain(`name="${field}"`);
    for (const field of ["website", "twitter", "instagram", "tiktok"]) expect(html).toContain(`for="profile-${field}"`);
    expect(html).toContain('name="is_public" value="false"');
    expect(html).not.toContain("/500");
  });
});
