"use client";

import { useReaderSettings } from "@/hooks/useReaderSettings";

const FONT_OPTIONS = [
  { value: "serif", label: "Serif", family: "Georgia, serif", preview: "Aa" },
  { value: "sans", label: "Sans", family: "Inter, system-ui, sans-serif", preview: "Aa" },
  { value: "mono", label: "Mono", family: "'JetBrains Mono', monospace", preview: "Aa" },
] as const;

const THEME_OPTIONS = [
  { value: "light", label: "Light", bg: "bg-white", text: "text-slate-900", border: "border-slate-200" },
  { value: "sepia", label: "Sepia", bg: "bg-[#f5f0e8]", text: "text-[#5c4b37]", border: "border-[#e0d5c5]" },
  { value: "dark", label: "Dark", bg: "bg-slate-900", text: "text-slate-200", border: "border-slate-700" },
] as const;

const WIDTH_OPTIONS = [
  { value: "narrow", label: "Narrow", maxW: "max-w-md" },
  { value: "medium", label: "Medium", maxW: "max-w-2xl" },
  { value: "wide", label: "Wide", maxW: "max-w-4xl" },
] as const;

const PREVIEW_TEXT = "The castle stood silent in the night, its towers outlined against the moonlight. Elin had walked the forest path for hours, and now she felt the ground shift beneath her feet, from soft soil to cold stone.";

function getFontFamily(value: string): string {
  return FONT_OPTIONS.find((f) => f.value === value)?.family ?? "Georgia, serif";
}

function getThemeClasses(value: string) {
  return THEME_OPTIONS.find((t) => t.value === value) ?? THEME_OPTIONS[0];
}

export default function ReaderSettingsClient() {
  const { settings, updateSettings, isLoading } = useReaderSettings(true);

  if (isLoading) {
    return (
      <div className="space-y-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 rounded-2xl bg-muted/40" />
        ))}
      </div>
    );
  }

  const theme = getThemeClasses(settings.theme);

  return (
    <div className="space-y-8">
      {/* Font family */}
      <Section title="Font">
        <div className="flex gap-3">
          {FONT_OPTIONS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => updateSettings({ font_family: f.value })}
              className={`flex flex-1 flex-col items-center gap-2 rounded-2xl border p-4 transition ${
                settings.font_family === f.value
                  ? "border-[#907AFF] bg-[#907AFF]/5"
                  : "border-border hover:border-[#907AFF]/30"
              }`}
            >
              <span className="text-[24px]" style={{ fontFamily: f.family }}>
                {f.preview}
              </span>
              <span className="text-[12px] font-medium text-muted-foreground">{f.label}</span>
            </button>
          ))}
        </div>
      </Section>

      {/* Font size */}
      <Section title="Size">
        <div className="flex items-center gap-4">
          <span className="text-[13px] text-muted-foreground">14px</span>
          <input
            type="range"
            min={14}
            max={28}
            step={1}
            value={settings.font_size}
            onChange={(e) => updateSettings({ font_size: Number(e.target.value) })}
            className="flex-1 accent-[#907AFF]"
          />
          <span className="text-[13px] text-muted-foreground">28px</span>
          <span className="min-w-[48px] text-center text-[15px] font-semibold text-foreground">
            {settings.font_size}px
          </span>
        </div>
      </Section>

      {/* Theme */}
      <Section title="Theme">
        <div className="flex gap-3">
          {THEME_OPTIONS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => updateSettings({ theme: t.value })}
              className={`flex flex-1 flex-col items-center gap-2 rounded-2xl border p-4 transition ${t.bg} ${t.text} ${
                settings.theme === t.value
                  ? "ring-2 ring-[#907AFF] ring-offset-2"
                  : t.border
              }`}
            >
              <span className="text-[16px] font-medium">{t.label}</span>
            </button>
          ))}
        </div>
      </Section>

      {/* Line height */}
      <Section title="Line height">
        <div className="flex items-center gap-4">
          <span className="text-[13px] text-muted-foreground">1.2</span>
          <input
            type="range"
            min={1.2}
            max={2.0}
            step={0.1}
            value={settings.line_height}
            onChange={(e) => updateSettings({ line_height: Number(e.target.value) })}
            className="flex-1 accent-[#907AFF]"
          />
          <span className="text-[13px] text-muted-foreground">2.0</span>
          <span className="min-w-[48px] text-center text-[15px] font-semibold text-foreground">
            {settings.line_height.toFixed(1)}
          </span>
        </div>
      </Section>

      {/* Content width */}
      <Section title="Width">
        <div className="flex gap-3">
          {WIDTH_OPTIONS.map((w) => (
            <button
              key={w.value}
              type="button"
              onClick={() => updateSettings({ content_width: w.value })}
              className={`flex flex-1 flex-col items-center gap-2 rounded-2xl border p-4 transition ${
                settings.content_width === w.value
                  ? "border-[#907AFF] bg-[#907AFF]/5"
                  : "border-border hover:border-[#907AFF]/30"
              }`}
            >
              <div
                className={`h-2 rounded-full bg-current opacity-30 ${
                  w.value === "narrow" ? "w-8" : w.value === "medium" ? "w-14" : "w-20"
                }`}
              />
              <span className="text-[12px] font-medium text-muted-foreground">{w.label}</span>
            </button>
          ))}
        </div>
      </Section>

      {/* Preview */}
      <Section title="Preview">
        <div
          className={`rounded-2xl border p-6 transition-all ${theme.bg} ${theme.text} ${theme.border}`}
          style={{
            fontFamily: getFontFamily(settings.font_family),
            fontSize: `${settings.font_size}px`,
            lineHeight: String(settings.line_height),
          }}
        >
          {PREVIEW_TEXT}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-5">
      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}
