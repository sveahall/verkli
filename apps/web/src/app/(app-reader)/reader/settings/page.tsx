import ReaderSettingsClient from "./ReaderSettingsClient";

export default function ReaderSettingsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <p className="text-[12px] uppercase tracking-[0.3em] text-muted-foreground">
          Settings
        </p>
        <h1 className="mt-2 text-[28px] font-semibold text-foreground">
          Reading preferences
        </h1>
        <p className="mt-2 text-[14px] text-muted-foreground">
          Customise how you read. Changes are saved automatically.
        </p>
        <div className="mt-8">
          <ReaderSettingsClient />
        </div>
      </div>
    </main>
  );
}
