import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthorRole } from "@/lib/auth/require-author";
import { createClient } from "@/lib/supabase/server";
import { pickerQuerySchema } from "@/features/illustration-picker/contracts";
import SessionBoundary from "@/features/illustration-picker/SessionBoundary";
import PickerView from "@/features/illustration-picker/PickerView";
import { PickerError, readPicker } from "@/lib/illustration-picker/read";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const author = await requireAuthorRole();
  if (!author.ok) redirect("/author/signin");
  try {
    const query = pickerQuerySchema.safeParse(await searchParams);
    if (!query.success) throw new PickerError(400, "INVALID_SELECTION", "Choose a valid book and edition, or restart your selection.");
    const model = await readPicker(await createClient(), author.user.id, query.data);
    return <main className="p-4 sm:p-8"><SessionBoundary key={author.user.id} ownerId={author.user.id}><PickerView model={model} /></SessionBoundary></main>;
  } catch (error) {
    const failure = error instanceof PickerError ? error : new PickerError(503, "READ_FAILED", "Could not load your illustration workspace. Please try again.");
    console.error("[illustration picker] selection failed", { code: failure.code, status: failure.status });
    return <main className="mx-auto max-w-3xl space-y-4 p-6"><h1 className="text-2xl font-semibold">Illustration workspace unavailable</h1><p role="alert">{failure.message}</p><Link className="inline-flex rounded-xl border px-4 py-3" href="/author/illustrations">Restart selection</Link></main>;
  }
}
