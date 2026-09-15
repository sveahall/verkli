import { notFound } from "next/navigation";
import AgentTeamPreview from "./AgentTeamPreview";

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <AgentTeamPreview />;
}
