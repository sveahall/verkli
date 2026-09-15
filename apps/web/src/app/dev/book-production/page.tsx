import { notFound } from "next/navigation";
import ProductionPreview from "./ProductionPreview";

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ProductionPreview />;
}
