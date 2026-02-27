# Marketing Portal — Cinematic Creative Workspace

## Design Vision

Omforma Marketing Portal till en **cinematisk kreativ workspace** med tydlig stegindikator, stor kreativ canvas, live-förhandsvisning och mörkt/ljust adaptiv design. Estetik: modern AI-verktyg, premium känsla.

---

## 1. Layout Grid System

### Master grid

- **Viewport**: Full viewport height minus global navbar; ingen overflow på `<main>` som bryter fixed header.
- **Struktur**:
  - **Top bar (fixed/sticky)**: Steg-indikator + kontext (t.ex. boktitel). Höjd: `56–64px`. Z-index över canvas.
  - **Body**: CSS Grid med tre kolumner:
    - **Left rail (optional)**: Smal panel för sekundära verktyg (t.ex. bokväljare, kanal). Bredd: `240–280px`, döljs eller stackas på `< lg`.
    - **Center (creative canvas)**: `minmax(0, 1fr)`. Min-width för läsbarhet; max-width optional för fokus.
    - **Right rail (live preview)**: `360–400px` fixed width på `lg+`, sticky. På mindre skärmar: under canvas eller i modal/drawer.

### Breakpoints & beteende

| Breakpoint | Layout |
|------------|--------|
| `< 1024px` | Single column: Step bar → Canvas (full width) → Preview som sektion under eller expanderbar panel. |
| `≥ 1024px` | Three-column: Left rail (optional) \| Canvas \| Preview. Step bar full width. |
| `≥ 1280px` | Samma, med större canvas max-width om önskat. |

### Spacing tokens (använd i grid)

- **Page gutter**: `px-4 sm:px-6 lg:px-8`.
- **Gap mellan canvas och rails**: `gap-6 lg:gap-8`.
- **Canvas inner padding**: `p-6 lg:p-8`.
- **Section vertical rhythm**: `space-y-6` inom canvas, `space-y-4` i side panels.

### Grid spec (Tailwind-friendly)

```css
/* Main workspace grid */
.workspace-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;
}
@media (min-width: 1024px) {
  .workspace-grid {
    grid-template-columns: minmax(240px, 280px) minmax(0, 1fr) minmax(360px, 400px);
    gap: 2rem;
  }
}
```

---

## 2. Component Hierarchy

### Nivå 1 — Page

- **Marketing Creative Workspace** (hela sidan)
  - Step progress bar (top)
  - Workspace grid (left \| canvas \| preview)

### Nivå 2 — Regions

- **StepProgressBar**: Steg 1 → 2 → 3 (t.ex. Setup → Create → Export). Klickbara för navigering om tillåtet.
- **LeftRail** (optional): BookSelector, ChannelSelector, ev. snabbkonfiguration.
- **CreativeCanvas**: Huvudområde för konfiguration och redigering (CampaignConfigForm, ContentTypeSelector, scenredigering).
- **LivePreviewPanel**: AssetPreviewArea + scenförhandsvisning + render progress.

### Nivå 3 — Blocks

- **CreativeCanvas** innehåller:
  - **ConfigSection**: Formulär (objective, tone, CTA, hashtags).
  - **SceneList** / **SceneEditor**: Scen-previews och ordning (när flera scener finns).
- **LivePreviewPanel** innehåller:
  - **PreviewFrame**: Aspect-ratio box (t.ex. 4:5) med video/cover/placeholder.
  - **PreviewMeta**: Bok, typ, kanal, tone, CTA.
  - **PreviewActions**: Generate, Export, Copy link.

### Nivå 4 — Primitives

- **Cards** (se Card styles nedan).
- **Buttons** (se Button hierarchy).
- **Form controls**: Input, select, textarea med `input-base` och design tokens.
- **Badges**: Draft / Final, Beta, status.

---

## 3. Card Styles

### Card tiers

| Tier | Användning | Light | Dark | Radius |
|------|------------|--------|------|--------|
| **Canvas card** | Själva kreativa ytan (bakgrund för canvas) | Subtle border, lätt skugga | Border white/10, bg white/[0.04] | `--radius-xl` till `--radius-2xl` |
| **Panel card** | Left/right rails, formulärsektioner | `card-base` (befintlig) | Samma | `--radius-lg` / `--radius-xl` |
| **Surface card** | Innehållsblock inuti canvas (t.ex. en scen) | Lätt upphöjd, border | Border white/10, bg white/[0.06] | `--radius-lg` |
| **Draft card** | Osparad / utkast-innehåll | Dashed border, amber/slate accent | Dashed white/15, amber/20 accent | `--radius-lg` |
| **Final card** | Godkänt / publicerat innehåll | Solid border, emerald accent | Solid white/15, emerald/20 | `--radius-lg` |

### Klassnamn (utöver befintliga)

- **Canvas container**: `.card-canvas` — stor, mjuk skugga, stor radius. Wrapper för hela canvas-ytan.
- **Panel**: Behåll `.card-base` för rails.
- **Surface**: `.card-surface` — block inuti canvas.
- **Draft**: `.card-draft` (se Draft vs Final nedan).
- **Final**: `.card-final` (se Draft vs Final nedan).

### CSS (för nya klasser)

```css
.card-canvas {
  border-radius: var(--radius-2xl);
  border: 1px solid var(--border);
  background: var(--card);
  box-shadow: 0 8px 32px rgba(15, 23, 42, 0.08);
}
.dark .card-canvas {
  border-color: rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
  box-shadow: 0 12px 40px rgba(0,0,0,0.35);
}

.card-surface {
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--card);
}
.dark .card-surface {
  border-color: rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.06);
}
```

---

## 4. Button Hierarchy

### Nivåer

| Nivå | Användning | Stil | Exempel |
|------|------------|------|---------|
| **Primary** | Huvudaktion (Generate, Export, Save final) | Solid, hög kontrast. Befintlig `.btn-primary` eller accent (brand-violet) | "Generate video", "Export" |
| **Secondary** | Sekundära sidopanel-aktioner | Border + bg. Befintlig `.btn-secondary` | "Change book", "Preview" |
| **Ghost** | Tertiär (Cancel, Back, avmarkera) | Ingen border/bg, hover bg. `.btn-ghost` | "Cancel", "Clear" |
| **Danger** | Destruktiva (Delete, Discard draft) | Red border/bg, tydlig text | "Discard draft" |

### Accent för Creative Workspace

- Primary CTA: **brand-violet** eller gradient för "Generate" / "Create" — premium AI-känsla.
- Fokusring: behåll `focus:ring-[#907AFF]/50` för tillgänglighet.

### Specifikation

- **Primary (workspace)**: `btn-primary` eller `bg-[var(--brand-violet)] text-white hover:bg-[var(--brand-violet-hover)]` med samma padding/radius som `btn-primary`.
- **Secondary / Ghost**: Oförändrat från `globals.css`.
- **Loading state**: Disabled + spinner eller "Generating…"; ingen dubbelklick.

---

## 5. Visual Distinction: Draft vs Final

### Draft

- **Container**: `.card-draft`
  - Border: **dashed** (`border-dashed`), färg `slate-300` / `white/20`.
  - Optional vänster **accent**: 3–4px vertikal linje i amber (`border-l-4 border-amber-400`).
  - Badge: "Draft" med amber styling.
- **State**: Ändringar sparade lokalt eller "Unsaved" indikator.

### Final

- **Container**: `.card-final`
  - Border: **solid** (default card border).
  - Optional vänster **accent**: grön linje (`border-l-4 border-emerald-500`).
  - Badge: "Final" eller "Published" med emerald styling.
- **State**: Sparad, ev. timestamp eller "Exported".

### Badges

- **Draft**: `rounded-full px-2.5 py-1 text-[11px] font-semibold` — `bg-amber-100 text-amber-800 border border-amber-200` (light), `dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800`.
- **Final**: `bg-emerald-100 text-emerald-800 border border-emerald-200` (light), `dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800`.

| State | Border | Accent | Badge |
|-------|--------|--------|-------|
| Draft | Dashed, neutral | Amber left stripe (optional) | "Draft" amber |
| Final | Solid | Emerald left stripe (optional) | "Final" emerald |

---

## 6. Loading Animation Concept (Video Build)

### Koncept

- **Queued**: Ikon (filmrulle/ kö) + "In queue". Optional puls.
- **Building**:
  - **Filmstrip-metaför**: 3–5 "rutor" som fylls sekventiellt (scen 1, 2, 3…). Varje ruta får fill eller check.
  - **Alternativ**: En progress bar med **gradient** (brand-violet → brand-rose) + shimmer. Text: "Building scene 2 of 4…" + ETA.
- **Encoding**: Samma bar, text "Encoding…".
- **Done**: Checkmark, "Ready", sedan video eller CTA "Play" / "Download".

### Teknisk implementation

- Deterministic progress från backend (`progress` eller `completedScenes/totalScenes`).
- CSS `transition` på bar width; filmstrip med `animation-delay` eller React state per steg.
- **Reduced motion**: Endast procent/stegtext, ingen fill-animation.

### Copy

- Queued: "In queue"
- Building: "Building…" + "Scene 2 of 4" (eller %)
- Encoding: "Encoding video…"
- Done: "Ready" + "Play" / "Download"

---

## 7. Scene Preview Visualization

### Syfte

För flerscens-video: visa thumbnails av varje scen i ordning; möjlighet att ändra ordning/redigera.

### Layout

- **Horisontell lista** av **scene cards**.
- Varje **scene card**:
  - **Thumbnail**: Aspect 4:5, placeholder eller genererad bild.
  - **Label**: "Scene 1", "Scene 2" eller titel.
  - **Duration**: t.ex. "2s".
  - **Hover**: Border highlight, optional "Reorder" / "Edit".
- **Drag-and-drop**: Optional; visuell feedback med placeholder-gap.

### Empty state

- En placeholder-ruta med dashed border: "Add scene".

### Stil

- Container: `.card-surface`, `aspect-[4/5]`, `overflow: hidden`.
- Hover: `ring-2 ring-[var(--brand-violet)]/40`.

---

## 8. Video Render Progress UI

### Placering

- Inuti **LivePreviewPanel**, under/över **PreviewFrame** när build körs.

### Komponent

- **Container**: Tunn panel (`.card-surface`) med padding.
- **Rad 1**: Status (Running / Encoding / Queued) + procent eller "Scene 2 of 4".
- **Rad 2**: Progress bar (full width, `h-2`, rounded). Fill: gradient (brand-violet → brand-rose), `transition-all duration-300`.
- **Rad 3** (optional): ETA "About 2 min left".

### States

| Status   | Färg (bar)     | Text             |
|----------|-----------------|------------------|
| Pending  | Muted           | "Queued"         |
| Running  | Violet gradient | "Building… 45%"  |
| Encoding | Violet gradient | "Encoding…"      |
| Done     | Emerald         | "Ready"          |
| Failed   | Red + Retry     | "Build failed"   |

### Tillgänglighet

- `role="progressbar"` med `aria-valuenow` / `aria-valuemin` / `aria-valuemax`.
- `aria-live="polite"` på status-text.

---

## 9. Empty State Illustration Concept

### Kontext

- Ingen bok vald; inga böcker; ingen video genererad; ingen scen.

### Koncept

- **Tema**: Film / kreativ studio. Enkel linjär eller flat ikonstil.
- **Element**: **Filmremsa** eller **klappbräda** (clapperboard); optional **bok** + **glöd/lampa** (idé). Färger: Muted + en accent (brand-violet eller amber).
- **Format**: SVG, `currentColor` eller ljust tema för dark mode.

### Layout

- Illustration max 160–200px bredd, centrerad.
- **Titel**: "No video yet" (`text-section-title`).
- **Beskrivning**: 1–2 meningar (`text-helper`).
- **CTA**: Primär knapp "Choose a book" / "Generate your first video".

---

## 10. Visual System Tokens

### Färger (utöver befintliga)

| Token | Light | Dark | Användning |
|-------|--------|------|------------|
| `--workspace-bg` | `var(--background)` | `var(--background)` | Workspace body |
| `--workspace-canvas-bg` | `var(--card)` | `oklch(0.18 0 0)` / white/03 | Canvas yta |
| `--workspace-panel-bg` | `var(--card)` | `var(--card)` | Left/right panel |
| `--workspace-accent` | `var(--brand-violet)` | `var(--brand-violet)` | Progress, CTA, focus |
| `--workspace-accent-muted` | `#907AFF / 0.15` | `#907AFF / 0.25` | Subtle accent bg |
| `--workspace-draft-accent` | amber-500 | amber-400 | Draft |
| `--workspace-final-accent` | emerald-500 | emerald-400 | Final |
| `--workspace-progress-start` | `var(--brand-violet)` | `var(--brand-violet)` | Progress bar |
| `--workspace-progress-end` | `var(--brand-rose)` | `var(--brand-rose)` | Progress bar |

### Radier

- Canvas: `var(--radius-2xl)`.
- Panel: `var(--radius-xl)`.
- Scene/small: `var(--radius-lg)`.

### Skuggor

- **Canvas (light)**: `0 8px 32px rgba(15,23,42,0.08)`.
- **Canvas (dark)**: `0 12px 40px rgba(0,0,0,0.35)`.

### Typografi

- **Step label**: `text-[12px] font-semibold uppercase tracking-wider text-muted-foreground`.
- **Canvas section**: `text-section-title` eller `text-[18px] font-semibold`.
- **Preview title**: `text-[15px] font-semibold`.
- **Meta**: `text-helper` eller `text-[13px] text-muted-foreground`.

### Spacing

- **Step bar**: 56–64px höjd.
- **Panel padding**: `p-5` / `p-6`.
- **Canvas padding**: `p-6 lg:p-8`.
- **Section gap**: `space-y-6`.

---

## Output Summary

### Layout spec

- **Grid**: Step bar (full width) + body 1 kolumn (mobile) eller 3 kolumner (left \| canvas \| preview) från `lg`.
- **Canvas**: Flexibel bredd; **Live preview** 360–400px, sticky.
- **Gaps**: 24–32px mellan kolumner; 24px vertikal rhythm.

### Component spec

- **StepProgressBar**: Steg 1–3, current marker, optional connector.
- **CreativeCanvas**: `.card-canvas`, ConfigSection + optional SceneList.
- **LivePreviewPanel**: PreviewFrame + PreviewMeta + PreviewActions + Video render progress UI.
- **Cards**: `.card-canvas`, `.card-surface`, `.card-draft`, `.card-final`.
- **Buttons**: Primary (accent), Secondary, Ghost, Danger; loading med disabled + spinner/label.

### Design system decisions

- **Dark/light**: Semantic tokens; ingen hardcoded hex utom brand.
- **Premium**: Stora radier, mjuka skuggor, begränsad accent; whitespace.
- **Draft vs Final**: Dashed + amber vs solid + emerald med badges.
- **Loading**: Filmstrip eller gradient bar; reduced-motion fallback.

### Interaction states

- **Step bar**: Hover bg; current fet/underline; disabled grå.
- **Cards**: Hover border/skugga; focus ring.
- **Buttons**: Hover/active enligt befintlig; disabled 50% opacity.
- **Scene cards**: Hover ring; drag större skugga.
- **Preview**: Hover "Expand"; loading skeleton/spinner.
- **Progress**: Animated fill; ev. Cancel på container.

---

*Spec för implementation av Marketing Portal (Cinematic Creative Workspace).*
