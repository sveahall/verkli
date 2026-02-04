# Design polish – sammanfattning

Genomförd finslipning av UI till production quality: konsekvent design, tydlig hierarki, samma handstil överallt. Ingen routing, authflöden eller affärslogik har ändrats.

---

## 1. Knappar och glass effect (`globals.css`)

- **Light mode:** Alla primära knappar har solid bakgrund (ingen glass på knappar). Klass `.glass-button` överstyrd i light mode till solid slate-900 bakgrund, tydlig kontrast mot vitt.
- **Dark mode:** Glass effect tillåten på knappar (blur, glow, translucency kvar).
- **`.btn-primary`:** Solid bakgrund i båda teman (slate-900 / white), min-h/min-w 44px, rounded-full, premium hover/active (scale 0.98).
- **`.btn-secondary`** / **`.btn-ghost`:** Konsekvent touch target, fokusring och active state.

---

## 2. Navbar

- **Huvudlänkar klickbara:** author-, reader- och public-nav använder `<Link href={item.href}>` för varje huvudlänk. Dropdowns är snabbgenvägar; man kan alltid klicka på själva länktexten och komma till landningssida.
- **Public nav:** Uppdaterad till Product (med dropdown), Pricing, FAQ med riktiga hrefs (`/product`, `/pricing`, `/faq`). Product-dropdown med children (Product, How it works, Case studies).
- **Dropdown-design:** Tydligare sektioner med border-bottom under rubrik, bättre padding (px-5 py-5 sm:px-6 sm:py-6), mjuk shadow och rounded-2xl. Hover på items: subtil bakgrund (slate-100/80 resp. white/8), inte aggressiv.
- **CTA i navbar:** Sign in / Sign up använder `.btn-secondary` och `.btn-primary` med samma storlek överallt (desktop och mobilmeny).

---

## 3. Auth-sidor (sign in, sign up, forgot-password, selector)

- **Kort i light mode:** Klass `.card-auth` ger solid vit bakgrund, ingen blur, tydlig border och shadow. I dark mode behålls glass.
- **"Back to Verkli":** Alla auth-sidor har synlig länk "Back to Verkli" (eller "← Back to Verkli") med `.btn-secondary`. Logotypen länkar till landningssida (author/reader/root).
- **En primär CTA per vy:** Submit-knappar är `.btn-primary` (ingen GlassSurface-wrapper). Google / sekundära actions är `.btn-secondary`.
- **Inputs och fel:** `.input-base` och enhetlig error-stil (rounded-xl, border, red-50/red-950) på author/reader signin, signup, author forgot-password, reader signup.
- **Selector:** Kort med `.card-auth`; "I am a author" = `.btn-primary`, "I am a reader" = `.btn-secondary`.

---

## 4. Hero och CTA (authorLandingPage, public reader)

- **Samma höjd och stil:** Sign up, Sign in, Start free, Explore stories, Join Verkli använder `.btn-primary` respektive `.btn-secondary` med min-w-[140px] där det behövs. Ingen glass på dessa knappar i light mode.
- **authorLandingPage:** Alla CTA-byttor ersatta med Link + btn-primary/btn-secondary. GlassSurface-import och glassBaseProps borttagna där de inte längre behövs.
- **Public reader page:** Hero-CTA:erna samma btn-klasser; GlassSurface och glassBaseProps borttagna.

---

## 5. Övriga uppdaterade komponenter/sidor

- **author books [id]:** "Continue editing" och "View public page" bytta till `.btn-primary` och `.btn-secondary` (ingen GlassSurface).
- **GlobalNavbar:** Desktop- och mobil-CTA använder btn-primary/btn-secondary; dropdown-innehåll med bättre padding och hover.

---

## 6. Designprinciper som införts

- **Theme-aware knappar:** Light = solid, dark = glass tillåten. Klass `.glass-button` får global override i light mode så att befintliga glass-knappar automatiskt blir solida.
- **En primär CTA per vy;** övriga actions secondary eller ghost.
- **Touch target minst 44px** på alla CTA och nav-länkar.
- **Samma border radius (rounded-full för knappar, rounded-2xl för kort)** och konsekvent spacing (section-gap, page-content).
- **Auth:** Mindre blur, mer solid struktur; tydlig "tillbaka"-länk och logotyp på varje auth-sida.

---

## Sammanfattning

- **Ändrat:** Knappstilar (theme-aware), navbar (klickbara länkar, omdesignade dropdowns, CTA-klasser), auth-kort (solid i light, Back to Verkli), hero- och CTA-knappar överallt, selector och author books [id].
- **Komponenter uppdaterade:** GlobalNavbar, GlassCard (card-auth), authorLandingPage, (auth)/author/signin, signup, forgot-password, (auth)/reader/signin, signup, (selector)/page, (public-reader)/reader/page, (app-author)/author/books/[id]. globals.css (btn-primary/secondary/ghost, glass-button override, card-auth, nav-mega).
- **Ingen routing, authflöden eller API** har ändrats; endast UI, styling och komponenter.
