import ReaderSettingsClient from "./ReaderSettingsClient";

export default function ReaderSettingsPage() {
  return (
    <div className="mx-auto max-w-2xl text-foreground">
      <header className="border-b border-border pb-6">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-accent-foreground">
          Settings
        </p>
        <h1 className="mt-1 text-page-title font-display">
          Reading preferences
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Customise how you read. Changes are saved automatically.
        </p>
      </header>
      <div className="mt-8">
        <ReaderSettingsClient />
      </div>
    </div>
  );
}
