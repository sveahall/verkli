import { notFound } from "next/navigation";
import SupportQueuePreview from "./SupportQueuePreview";

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <SupportQueuePreview />;
}
