import ReaderSettingsClient from "./ReaderSettingsClient";

export default function ReaderSettingsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <p className="text-[12px] uppercase tracking-[0.3em] text-muted-foreground">
          Inst\u00e4llningar
        </p>
        <h1 className="mt-2 text-[28px] font-semibold text-foreground">
          L\u00e4sinst\u00e4llningar
        </h1>
        <p className="mt-2 text-[14px] text-muted-foreground">
          Anpassa hur du l\u00e4ser. \u00c4ndringarna sparas automatiskt.
        </p>
        <div className="mt-8">
          <ReaderSettingsClient />
        </div>
      </div>
    </main>
  );
}
