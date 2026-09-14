import { notFound } from "next/navigation";
import WorkflowPreview from "./WorkflowPreview";

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <WorkflowPreview />;
}
