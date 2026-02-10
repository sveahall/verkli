"use client";

export default function RootError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <html lang="sv">
      <body className="flex min-h-screen items-center justify-center bg-white text-slate-900 dark:bg-slate-950 dark:text-white">
        <main className="max-w-md px-6 py-20 text-center">
          <h1 className="text-2xl font-semibold">Något gick fel</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Ett oväntat fel uppstod ({error.message || "okänt fel"}).
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            Försök igen
          </button>
        </main>
      </body>
    </html>
  );
}
