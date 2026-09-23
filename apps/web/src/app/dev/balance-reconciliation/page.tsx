import { notFound } from "next/navigation";
import BalanceReconciliationPreview from "./BalanceReconciliationPreview";

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <BalanceReconciliationPreview />;
}
