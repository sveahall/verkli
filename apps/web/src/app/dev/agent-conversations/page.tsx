import { notFound } from "next/navigation";
import ConversationPreview from "./ConversationPreview";
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ConversationPreview />;
}
