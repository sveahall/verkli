import { notFound } from "next/navigation";
import AudiobookPreview from "./AudiobookPreview";

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <AudiobookPreview />;
}
