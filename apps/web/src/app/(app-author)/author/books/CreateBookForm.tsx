"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LANGUAGE_OPTIONS, type SupportedLanguage } from "@/lib/languages";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export default function CreateBookForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState<SupportedLanguage>("en");
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
          title: title.trim() || "Untitled",
          description: description.trim() || undefined,
          language,
          original_url: originalUrl.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to create book.");
        setLoading(false);
        return;
      }
      router.push(`/author/books/${data.id}`);
    } catch (err) {
      setError("Failed to create book.");
      setLoading(false);
    }
  };

  return (
    <Card className="p-6" id="create-book">
      <div className="space-y-4">
        <div>
          <h2 className="text-section-title">Create a new book</h2>
          <p className="text-body">Start a new book and add translations later.</p>
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
            label="Title"
            helper="Leave blank to use Untitled."
            className="md:col-span-2"
          >
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Book title"
            />
          </FormField>

          <FormField label="Description" helper="Optional" className="md:col-span-2">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description"
            />
          </FormField>

          <FormField label="Language">
            <Select value={language} onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}>
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Original URL" helper="Optional">
            <Input
              type="url"
              value={originalUrl}
              onChange={(e) => setOriginalUrl(e.target.value)}
              placeholder="https://"
            />
          </FormField>

          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" isLoading={loading} loadingText="Creating">
              Create book
            </Button>
          </div>
        </form>
      </div>
    </Card>
  );
}
