import { Suspense } from "react";
import WorkflowStepNav from "./WorkflowStepNav";

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
      <div className="min-h-[calc(100vh-4rem)] bg-[#f8f8fa] px-5 pb-10 pt-6 dark:bg-[#08080d]">
        {children}
        <Suspense>
          <WorkflowStepNav bookId={id} />
        </Suspense>
      </div>
    </div>
  );
}
