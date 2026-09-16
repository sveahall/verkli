import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/20260916010000_private_book_production.sql");

describe("private book production migration security", () => {
  it("isolates drafts from public book metadata and binds direct RLS access to the complete edition ownership tuple", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();
    expect(sql).toContain("create table if not exists public.book_production_drafts");
    expect(sql).toMatch(/version_id uuid primary key references public\.book_versions\(id\) on delete cascade/);
    expect(sql).toContain("alter table public.book_production_drafts enable row level security");
    expect(sql).toContain("owner_id = (select auth.uid())");
    expect(sql).toContain("public.owns_book_production_edition(book_id, version_id)");
    expect(sql).toContain("v.book_id = b.id");
    expect(sql).toContain("b.author_id = (select auth.uid())");
    expect(sql).toContain("revoke all on public.book_production_drafts from public, anon, authenticated");
    expect(sql).toContain("grant select, insert, update on public.book_production_drafts to authenticated");
    expect(sql).not.toMatch(/alter table (?:public\.)?books/);
    expect(sql).not.toContain("print_on_demand_settings");
  });

  it("protects immutable draft identity and monotonic revisions for direct database writes", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();
    expect(sql).toContain("new.book_id is distinct from old.book_id");
    expect(sql).toContain("new.version_id is distinct from old.version_id");
    expect(sql).toContain("new.owner_id is distinct from old.owner_id");
    expect(sql).toContain("new.revision <> old.revision + 1");
    expect(sql).toContain("before update on public.book_production_drafts");
    expect(sql).toContain("revision = 1");
  });

  it("keeps artwork private, edition-scoped and immutable even through direct storage access", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();
    expect(sql).toMatch(/'print-artwork',\s*'print-artwork',\s*false,\s*20971520/);
    expect(sql).toContain("array['image/jpeg', 'image/png']");
    expect(sql).toContain("split_part(object_name, '/', 1) = (select auth.uid())::text");
    expect(sql).toContain("b.id::text = split_part(object_name, '/', 2)");
    expect(sql).toContain("v.id::text = split_part(object_name, '/', 3)");
    expect(sql).toContain("public.owns_book_production_artwork(name)");
    expect(sql).toMatch(/for select to authenticated[\s\S]*bucket_id = 'print-artwork'/);
    expect(sql).toMatch(/for insert to authenticated[\s\S]*bucket_id = 'print-artwork'/);
    expect(sql).toMatch(/on storage\.objects\s+as restrictive for select to authenticated/);
    expect(sql).toMatch(/on storage\.objects\s+as restrictive for insert to authenticated/);
    expect(sql).toMatch(/as restrictive for select to anon\s+using \(bucket_id <> 'print-artwork'\)/);
    expect(sql).toMatch(/as restrictive for insert to anon\s+with check \(bucket_id <> 'print-artwork'\)/);
    expect(sql).toMatch(/on storage\.objects\s+as restrictive for update to public/);
    expect(sql).toMatch(/on storage\.objects\s+as restrictive for delete to public/);
    expect(sql).toContain("case when bucket_id = 'print-artwork' then public.owns_book_production_artwork(name) else true end");
    expect(sql).toContain("using (bucket_id <> 'print-artwork')");
    expect(sql).toContain("with check (bucket_id <> 'print-artwork')");
    expect(sql).not.toContain("security definer");
  });
});
