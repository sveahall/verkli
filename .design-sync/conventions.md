## How to build with the Verkli design system

Tailwind v4 utilities plus a small set of **semantic classes** defined by this design system.
Reach for the semantic class first; fall back to raw Tailwind utilities for layout glue.

### Setup

No provider is required — design tokens are plain CSS custom properties on `:root`, so any
component works as soon as `styles.css` is loaded. Two exceptions:

- **Toasts**: `useToast` / `useToastHelpers` only work inside `<ToastProvider>`. Wrap the
  page root when you use them.
- **Dark mode**: the dark variant is `&:is(.dark *)`. Put `class="dark"` on an ancestor
  (normally `<html>`); there is no media-query fallback, so without that class the light
  palette always applies.

### Semantic classes — prefer these over ad-hoc utilities

**Typography** — `text-page-title`, `text-section-title`, `text-eyebrow`, `text-body`,
`text-label`, `text-caption`, `text-helper`, `text-stat`, `text-stat-sm`,
`text-brand-gradient`.

**Surfaces** — `card-base`, `card-base-subtle`, `card-surface`, `card-canvas`, `card-auth`,
`card-draft`, `card-final`, `empty-state-base`, `input-base`.

**Layout** — `page-content`, `page-content-narrow`, `section-gap`, `section-gap-lg`,
`workspace-page`, `workspace-grid`, `workspace-grid-canvas-only`, `scrollbar-none`,
`safe-area-inset-top`, `safe-area-inset-bottom`.

**Elevation** — `shadow-surface-sm`, `shadow-surface-md`, `shadow-surface-lg`.

Do not invent new `text-*` or `card-*` names — the list above is the whole vocabulary.

### Tokens

Colour comes from OKLCH custom properties, so write `var(--…)` rather than hex:

- Core: `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`,
  `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, each with a
  `-foreground` companion where it applies. `--radius` drives corner rounding.
- Status: `--color-success`, `--color-warning`, `--color-info`, `--color-error`, each with a
  `-muted` background companion. These back `Badge`'s semantic variants.
- Brand: `--brand-violet` (plus `-hover` / `-active`), `--brand-rose`, `--brand-amber`.
  The brand gradient ramp is `#907aff → #e29ed5 → #fcc997` (`BrandGradientText`).
- Type: `--font-inter` is the sans stack.

State must never be encoded by colour alone (DESIGN.md rule 6) — `Badge` therefore always
renders a text label, and shows a leading dot by default for semantic variants.

### Where the truth lives

Read `styles.css` and the files it `@import`s for the real token values and the semantic
class definitions. Per-component API and usage is in each
`components/<group>/<Name>/<Name>.prompt.md` and `<Name>.d.ts`. Broader brand rules are in
`guidelines/DESIGN.md`.

### Idiomatic example

```jsx
<div className="page-content section-gap">
  <PageHeader
    eyebrow="Library"
    title="My books"
    description="Everything you have written, imported or published on Verkli."
    actions={<Button size="sm">New book</Button>}
  />

  <Card>
    <CardHeader>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-section-title">The Lighthouse at Vinga</h3>
        <Badge variant="success">Published</Badge>
      </div>
      <p className="text-caption">12 chapters · last edited 2 hours ago</p>
    </CardHeader>
    <CardContent>
      <p className="text-body">A retired keeper returns to the island that raised him.</p>
    </CardContent>
    <CardFooter>
      <Button size="sm">Continue writing</Button>
    </CardFooter>
  </Card>
</div>
```

### Form validation

`Input` takes `error` (renders a red border plus the message) and `hint`. `Textarea` takes
`invalid` for the red border. For a labelled field, wrap either in `FormField` and pass
`error` there — it owns the label, the required asterisk, and the message, and wires
`aria-describedby` / `aria-invalid` onto the child for you.
