import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import ProviderActivityReport from "@/features/admin/finance/ProviderActivityReport";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Admin layout protects this page. The API independently requires a verified admin session.
async function currentMonth() { return new Date().toISOString().slice(0, 7); }

export default async function AdminFinancePage() {
  const initialMonth = await currentMonth();
  return <div className="page-content min-w-0 space-y-8 py-10">
    <div>
      <Breadcrumbs className="mb-4" items={[{ label: "Admin", href: "/admin" }, { label: "Stripe activity" }]} />
      <PageHeader eyebrow="Finance" title="Stripe account activity" description="Read balance entries from the configured platform account, with signed fees and net movements grouped by currency." />
    </div>
    <ProviderActivityReport initialMonth={initialMonth} />
  </div>;
}
