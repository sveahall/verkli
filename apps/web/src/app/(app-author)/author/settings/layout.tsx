import WorkspaceHeaderActions from "@/features/author-workspaces/components/WorkspaceHeaderActions";
import WorkspaceLayout from "@/features/author-workspaces/WorkspaceLayout";
import SettingsNav from "@/components/author/settings/SettingsNav";

/**
 * Settings is a set of routes, not one long page with anchors.
 *
 * The shell and the index live here so every section keeps the same frame while
 * only its own panel re-renders on navigation. Authentication is already
 * enforced by the (app-author) layout above, so sections only fetch their data.
 */
export default function AuthorSettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <WorkspaceLayout
        header={
          <header>
            <h1 className="author-page-title">Settings</h1>
            <p className="mt-1 text-sm text-muted-foreground">A studio that works your way.</p>
          </header>
        }
        headerRight={<WorkspaceHeaderActions />}
        main={
          <div className="@container/settings mx-auto max-w-6xl">
            <div className="grid items-start gap-6 @min-[880px]/settings:grid-cols-[200px_minmax(0,1fr)] @min-[880px]/settings:gap-8">
              <SettingsNav />
              <div className="min-w-0 space-y-6">{children}</div>
            </div>
          </div>
        }
      />
    </div>
  );
}
