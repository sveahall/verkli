import { notFound } from "next/navigation";
import EditorialPreview from "./EditorialPreview";

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <EditorialPreview />;
}
