import { notFound } from "next/navigation";
import BookEditor from "./BookEditor";
import { loadBookWorkspaceData } from "./loadBookWorkspaceData";
import type { Tool } from "./editor/bookEditor.shared";

const VALID_PANELS: Tool[] = [
  "edit", "cover", "translate", "audiobook", "print",
  "pricing", "publish", "market", "review", "statistics", "import",
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

  return (
    <BookEditor
      book={data.book}
      chapters={data.chapters}
      bookVersions={data.versions}
      activeVersion={data.activeVersion}
      authorDisplayName={data.authorDisplayName}
      defaultPublishVisibility={data.defaultPublishVisibility}
      latestAudiobookAsset={data.latestAudiobookAsset}
      marketingCampaigns={data.marketingCampaigns}
      stripeConfigured={data.stripeConfigured}
      initialTool={initialTool}
    />
  );
}
