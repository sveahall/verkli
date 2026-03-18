import { redirect } from "next/navigation";

export default async function LegacyBookRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ panel?: string; lang?: string }>;
}) {
  const { id } = await params;
  const query = searchParams ? await searchParams : undefined;
  const langParam = query?.lang ? `&lang=${query.lang}` : "";
  const panel = query?.panel?.trim() ?? null;

  if (panel === "pricing" || panel === "translate" || panel === "audiobook" || panel === "print") {
    const kindParam =
      panel === "translate"
        ? "&kind=translation"
        : panel === "audiobook"
          ? "&kind=audiobook"
          : "";
    redirect(`/author/production?bookId=${id}${kindParam}${langParam}`);
  }
  if (panel === "publish") {
    redirect(`/author/audience?bookId=${id}&surface=beta-readers`);
  }
  if (panel === "market") {
    redirect(`/author/audience?bookId=${id}&surface=campaigns`);
  }
  if (panel === "statistics") {
    redirect(`/author/analytics?bookId=${id}${langParam}`);
  }

  redirect(`/author/write?bookId=${id}${langParam}`);
}
