// design-sync shim — do not delete.
//
// brand-gradient-text.tsx uses `export default function BrandGradientText`.
// The converter runs in synth-entry mode (@verkli/web ships no dist), so its
// generated entry does `export * from` each source file — and ESM `export *`
// does NOT re-export a module's `default`. BrandGradientText was therefore
// missing from window.VerkliUI entirely. A named re-export fixes it, and it is
// unambiguous (the main namespace has no BrandGradientText key at all), so the
// bundle footer's Object.assign of the main namespace can't clobber it.
export { default as BrandGradientText } from "../apps/web/src/components/ui/brand-gradient-text";

// NOTE on `Skeleton`: it is deliberately NOT shimmed here. It is exported from
// BOTH ui/states.tsx and ui/Skeleton.tsx, so it is ambiguous in the main entry
// AND would be ambiguous between this shim and the main entry — `export *` drops
// the name from both sides, so no shim can recover it. It is excluded via
// cfg.componentSrcMap instead. The real fix is a one-line rename in the repo;
// see .design-sync/NOTES.md.
