"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LANGUAGE_OPTIONS, type SupportedLanguage } from "@/lib/languages";
import { resolveErrorMessage } from "@/lib/error-messages";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export default function CreateBookForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState<SupportedLanguage>("sv");
  const [originalUrl, setOriginalUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || "Namnlös",
          description: description.trim() || undefined,
          language,
          original_url: originalUrl.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(resolveErrorMessage(data.error));
        setLoading(false);
        return;
      }
      router.push(`/author/books/${data.id}`);
    } catch (err) {
      setError("Kunde inte skapa boken.");
      setLoading(false);
    }
  };

  return (
    <Card className="p-6" id="create-book">
      <div className="space-y-4">
        <div>
          <h2 className="text-section-title">Skapa en ny bok</h2>
          <p className="text-body">Börja en ny bok och lägg till översättningar senare.</p>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
          <FormField
            label="Titel"
            helper="Lämna blankt för att använda Namnlös."
            className="md:col-span-2"
          >
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Bokens titel"
            />
          </FormField>

          <FormField label="Beskrivning" helper="Valfritt" className="md:col-span-2">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Kort beskrivning"
            />
          </FormField>

          <FormField label="Språk">
            <Select value={language} onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}>
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Original-URL" helper="Valfritt">
            <Input
              type="url"
              value={originalUrl}
              onChange={(e) => setOriginalUrl(e.target.value)}
              placeholder="https://"
            />
          </FormField>

          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" isLoading={loading} loadingText="Skapar">
              Skapa bok
            </Button>
          </div>
        </form>
      </div>
    </Card>
  );
}
