import WaitlistPageClient from "./WaitlistPageClient";

type WaitlistPageProps = {
  searchParams: Promise<{ access?: string | string[] }>;
};

export default async function WaitlistPage({ searchParams }: WaitlistPageProps) {
  const { access } = await searchParams;
  // This query controls guidance only. Middleware and server routes remain
  // responsible for authentication and beta access.
  return <WaitlistPageClient accessPending={access === "pending"} />;
}
