import { notFound } from "next/navigation";
import BookEditor from "./BookEditor";
import { loadBookWorkspaceData } from "./loadBookWorkspaceData";
import type { Tool } from "./editor/bookEditor.shared";
import { isDemoModeActive } from "@/lib/flags";

const VALID_PANELS: Tool[] = [
  "dashboard", "edit", "cover", "translate", "audiobook", "production", "distribute",
  "print", "pricing", "publish", "market", "trailer", "review", "statistics", "import", "ai",
];

function isValidPanel(value: string | null): value is Tool {
  if (!value) return false;
  return VALID_PANELS.includes(value as Tool);
}

export default async function BookWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ panel?: string; lang?: string }>;
}) {
  const { id } = await params;
  const query = searchParams ? await searchParams : undefined;
  const panel = query?.panel?.trim() ?? null;
  const initialTool: Tool = isValidPanel(panel) ? panel : "edit";

  const data = await loadBookWorkspaceData(id, query?.lang?.trim() ?? null);
  if (!data) notFound();

  // Demo-only sidebar entry. The "Production" tool is the investor-pitch
  // façade that consolidates audiobook + translation generation behind a
  // single "Produce everything" button. It only appears when both
  // (a) the deployment-level demo flag is on AND (b) this profile is the
  // protected demo author. Real users never see it; the regular editor
  // panels stay untouched.
  //
  // In demo mode the stepper + sidebar both collapse to the three pitch
  // surfaces the investor walks through (Cover → Production → Distribute).
  // Direct URL navigation to other panels still resolves via ALL_TOOLS.
  const demoActive = isDemoModeActive({ demo_mode: data.authorDemoMode });
  const visibleTools: Tool[] | undefined = demoActive
    ? (["cover", "production", "distribute"] as Tool[])
    : undefined;

  return (
    <BookEditor
      book={data.book}
      chapters={data.chapters}
      bookVersions={data.versions}
      activeVersion={data.activeVersion}
      authorDisplayName={data.authorDisplayName}
      authorDisplayNameSet={data.authorDisplayNameSet}
      defaultPublishVisibility={data.defaultPublishVisibility}
      latestAudiobookAsset={data.latestAudiobookAsset}
      marketingCampaigns={data.marketingCampaigns}
      stripeConfigured={data.stripeConfigured}
      initialTool={initialTool}
      visibleTools={visibleTools}
    />
  );
}
