import { notFound } from "next/navigation";
import StudioOverviewPreview from "./StudioOverviewPreview";

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <StudioOverviewPreview />;
}
