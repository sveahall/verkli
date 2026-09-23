import { notFound } from "next/navigation";
import ProductionStudioPreview from "./ProductionStudioPreview";

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ProductionStudioPreview />;
}
