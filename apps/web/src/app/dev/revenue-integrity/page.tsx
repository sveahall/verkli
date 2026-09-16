import { notFound } from "next/navigation";
import RevenueIntegrityPreview from "./RevenueIntegrityPreview";
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <RevenueIntegrityPreview />;
}
