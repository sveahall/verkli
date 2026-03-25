import { requireAdminPageAccess } from "@/lib/admin-page-auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPageAccess();
  return children;
}
