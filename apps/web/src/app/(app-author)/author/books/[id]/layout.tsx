import { Suspense } from "react";

export default async function BookWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="-mx-4 -mt-4 sm:-mx-6 lg:-mx-8 lg:-mt-6">
      <div className="min-h-[calc(100vh-4rem)] bg-background px-4 pb-14 pt-0 sm:px-6 sm:pt-0 lg:px-8">
        <Suspense>{children}</Suspense>
      </div>
    </div>
  );
}
