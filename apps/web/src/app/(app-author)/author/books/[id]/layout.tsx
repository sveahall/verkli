import { Suspense } from "react";

export default async function BookWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="-mx-4 -mt-4 sm:-mx-6 lg:-mx-8 lg:-mt-6">
      <div className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_top_left,_rgba(243,184,115,0.12),_transparent_22%),radial-gradient(circle_at_top_right,_rgba(142,121,255,0.1),_transparent_26%),linear-gradient(180deg,_#fbfbfd_0%,_#f5f6fb_100%)] px-4 pb-14 pt-6 dark:bg-[radial-gradient(circle_at_top_left,_rgba(243,184,115,0.06),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(142,121,255,0.08),_transparent_28%),linear-gradient(180deg,_#090a0f_0%,_#0d1017_100%)] sm:px-6 sm:pt-8 lg:px-8">
        <Suspense>{children}</Suspense>
      </div>
    </div>
  );
}
