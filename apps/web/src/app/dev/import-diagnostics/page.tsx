import { notFound } from "next/navigation";
import ImportDiagnosticsPreview from "./ImportDiagnosticsPreview";
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ImportDiagnosticsPreview />;
}
