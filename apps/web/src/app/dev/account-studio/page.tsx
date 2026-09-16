import { notFound } from "next/navigation";
import AccountStudioPreview from "./AccountStudioPreview";

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <AccountStudioPreview />;
}
