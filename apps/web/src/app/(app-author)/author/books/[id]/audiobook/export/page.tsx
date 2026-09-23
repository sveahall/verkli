import PrivateAudioExport from "@/features/audiobook/PrivateAudioExport";
export default async function Page({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ editionId?: string | string[] }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const editionId = typeof query.editionId === "string" ? query.editionId : null;
  return <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-12">{editionId ? <PrivateAudioExport bookId={id} editionId={editionId} /> : <div className="space-y-3"><h1 className="font-display text-3xl font-semibold">Audio export</h1><p role="alert" className="text-sm">Choose a book edition before exporting its audio. This link is missing an edition selection.</p></div>}</main>;
}
