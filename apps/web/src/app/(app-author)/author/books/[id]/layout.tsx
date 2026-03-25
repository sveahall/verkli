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
      <div className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_top_left,rgba(148,163,184,0.18),transparent_40%),radial-gradient(circle_at_top_right,rgba(144,122,255,0.08),transparent_45%),linear-gradient(180deg,#fbfcff_0%,#f4f6fb_100%)] px-4 pb-14 pt-6 dark:bg-[radial-gradient(circle_at_top_left,rgba(144,122,255,0.10),transparent_42%),radial-gradient(circle_at_top_right,rgba(255,255,255,0.06),transparent_45%),linear-gradient(180deg,_#090a0f_0%,_#0d1017_100%)] sm:px-6 sm:pt-8 lg:px-8">
        <Suspense>{children}</Suspense>
      </div>
    </div>
  );
}
