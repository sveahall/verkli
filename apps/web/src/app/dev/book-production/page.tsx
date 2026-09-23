import { notFound } from "next/navigation";
import ProductionPreview from "./ProductionPreview";
import WorkspacePreview from "./WorkspacePreview";

export default async function Page({ searchParams }: { searchParams: Promise<{ workspace?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  return (await searchParams).workspace === "1" ? <WorkspacePreview /> : <ProductionPreview />;
}
