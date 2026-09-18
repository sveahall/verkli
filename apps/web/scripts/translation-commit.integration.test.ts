/** Explicit local-only runner; requires the reviewed external SQL proposal, never a remote database URL. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { commitReviewedTranslation, TranslationOutcomeUnknownError, type TranslationCommitRequest } from "../src/lib/translation-commit";

const candidate = process.env.TRANSLATION_RPC_TEST_SQL;
const pg = "/usr/local/opt/postgresql@14/bin";
const suite = candidate ? describe : describe.skip;
const args: string[] = [];
let scratch = "";
let started = false;
let frozen: TranslationCommitRequest;
const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(PG|SUPABASE|NEXT_PUBLIC_SUPABASE|DATABASE_URL)/.test(key))), NODE_ENV: process.env.NODE_ENV };
const quote = (value: unknown) => `'${(typeof value === "object" ? JSON.stringify(value) : String(value)).replaceAll("'", "''")}'`;
function sql(statement: string): string {
  return execFileSync(join(pg, "psql"), [...args, "-c", statement], { encoding: "utf8", env, stdio: ["pipe", "pipe", "pipe"] }).trim();
}
const client = { rpc: async (_name: string, request: TranslationCommitRequest) => {
  try {
    const data = JSON.parse(sql(`SET ROLE service_role; SELECT public.commit_reviewed_translation(${Object.entries(request).map(([key, value]) => `${key} => ${quote(value)}`).join(",")});`));
    return { data, error: null };
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? "";
    return { data: null, error: { code: stderr.match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1] ?? "", message: "isolated RPC rejected" } };
  }
} };
const snapshot = () => sql("SELECT jsonb_build_object('chapters',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM chapters c),'versions',(SELECT jsonb_agg(to_jsonb(v) ORDER BY id) FROM book_versions v),'jobs',(SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM ai_jobs j));");
suite("reviewed caller against isolated PostgreSQL", () => {
  beforeAll(() => {
    if (!candidate) throw new Error("Explicit proposal path required");
    const text = readFileSync(candidate, "utf8");
    expect(createHash("sha256").update(text).digest("hex")).toBe("5b4ffa13d72ecb09645de2383d1660905253fbf7f250fc6e005743d85eb6e1f2");
    scratch = mkdtempSync("/tmp/a02-caller-");
    mkdirSync(join(scratch, "socket"), { mode: 0o700 });
    execFileSync(join(pg, "initdb"), ["-D", join(scratch, "data"), "-U", "ai02_test", "-A", "trust", "--encoding=UTF8", "--no-instructions"], { env, stdio: "pipe" });
    writeFileSync(join(scratch, "data", "postgresql.conf"), "listen_addresses = ''\nunix_socket_permissions = 0700\n");
    writeFileSync(join(scratch, "data", "pg_hba.conf"), "local all all trust\nhost all all 0.0.0.0/0 reject\nhost all all ::/0 reject\n");
    execFileSync(join(pg, "pg_ctl"), ["-D", join(scratch, "data"), "-l", join(scratch, "server.log"), "-o", `-k ${join(scratch, "socket")} -p 55492`, "-w", "start"], { env, stdio: "pipe" });
    started = true;
    args.push("-X", "-Atq", "-h", join(scratch, "socket"), "-p", "55492", "-U", "ai02_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose");
    sql("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;");
    const fixturePath = process.env.TRANSLATION_RPC_TEST_FIXTURE || join(dirname(candidate), "local-rpc-v2-fixture.sql");
    const fixture = readFileSync(fixturePath, "utf8").replace("\\ir transactional-save.PROPOSAL.sql", text);
    writeFileSync(join(scratch, "fixture.sql"), fixture);
  }, 30_000);
  beforeEach(() => {
    sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT USAGE ON SCHEMA public TO PUBLIC;");
    execFileSync(join(pg, "psql"), [...args, "-f", join(scratch, "fixture.sql")], { encoding: "utf8", env, stdio: "pipe" });
    const row = JSON.parse(sql("SELECT to_jsonb(f) FROM fixture_contract f;"));
    frozen = {
      p_book_id: "00000000-0000-4000-8000-000000000001", p_author_id: "00000000-0000-4000-8000-000000000002",
      p_source_version_id: "00000000-0000-4000-8000-000000000003", p_target_version_id: "00000000-0000-4000-8000-000000000004",
      p_claim_marker: "translation-claim:00000000-0000-4000-8000-000000000010", p_claim_revision: row.revision,
      p_expected_source: row.source, p_expected_target: row.target, p_chapters: row.translated,
      p_scope: "book", p_overwrite: true, p_source_revision: row.source_revision,
      p_job_id: "00000000-0000-4000-8000-000000000010", p_job_revision: row.job_revision, p_final_report: row.final_report,
    };
  });
  afterAll(() => {
    if (started) execFileSync(join(pg, "pg_ctl"), ["-D", join(scratch, "data"), "-m", "immediate", "-w", "stop"], { env, stdio: "pipe" });
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  });
  it("commits the actual 15-argument caller and complete durable receipt atomically", async () => {
    const result = await commitReviewedTranslation(client, frozen);
    expect(result).toMatchObject({ savedChapters: 2, replayed: false });
    expect(sql("SELECT status FROM ai_jobs")).toBe("completed");
    expect(JSON.parse(sql("SELECT output FROM ai_jobs")).usageReceipts).toEqual(frozen.p_final_report.usageReceipts);
  });
  it("a lost post-commit response replays once with no repeated writes", async () => {
    let calls = 0;
    let committed = "";
    const revisions = frozen.p_expected_target.map((row) => row.version_number + 1).join(",");
    const flaky = { rpc: async (name: string, request: TranslationCommitRequest) => {
      const result = await client.rpc(name, request);
      if (++calls === 1) { committed = snapshot(); throw new Error("connection closed after COMMIT"); }
      return result;
    } };
    await expect(commitReviewedTranslation(flaky, frozen)).resolves.toMatchObject({ replayed: true });
    expect(sql("SELECT string_agg(version_number::text, ',' ORDER BY id) FROM chapters WHERE book_version_id='00000000-0000-4000-8000-000000000004'")).toBe(revisions);
    expect(snapshot()).toBe(committed);
  });
  it("retained request survives a caller crash before invocation and after commit", async () => {
    const restored = JSON.parse(JSON.stringify(frozen));
    await commitReviewedTranslation(client, restored);
    const committed = snapshot();
    await expect(commitReviewedTranslation(client, JSON.parse(JSON.stringify(restored)))).resolves.toMatchObject({ replayed: true });
    expect(snapshot()).toBe(committed);
  });
  it.each([
    ["source soft deletion", "UPDATE chapters SET deleted_at=now() WHERE id='00000000-0000-4000-8000-000000000005'"],
    ["source changed back", "UPDATE chapters SET content=content WHERE id='00000000-0000-4000-8000-000000000005'"],
    ["publication", "UPDATE book_versions SET published_at=now(), status='done' WHERE language_code='en'"],
    ["paid receipt mutation", "UPDATE ai_jobs SET output=jsonb_set(output,'{usageReceipts}', '[]')"],
    ["target edit", "UPDATE chapters SET content='Newer author text' WHERE id='00000000-0000-4000-8000-000000000008'"],
  ])("rejects %s with zero partial writes", async (_label, mutation) => {
    sql(mutation); const changed = snapshot();
    await expect(commitReviewedTranslation(client, frozen)).rejects.toThrow("no chapters were saved");
    expect(snapshot()).toBe(changed);
  });
  it("ledger completion failure rolls chapters and edition back", async () => {
    sql("ALTER TABLE ai_jobs ADD CONSTRAINT reject_completion CHECK(status <> 'completed');");
    const unchanged = snapshot();
    await expect(commitReviewedTranslation(client, frozen)).rejects.toThrow("no chapters were saved");
    expect(snapshot()).toBe(unchanged);
  });
  it("unknown followed by a changed owner remains unknown", async () => {
    let calls = 0;
    const flaky = { rpc: async (name: string, request: TranslationCommitRequest) => {
      if (++calls === 1) { await client.rpc(name, request); sql("UPDATE books SET author_id='00000000-0000-4000-8000-000000000099'"); throw new Error("response lost"); }
      return client.rpc(name, request);
    } };
    await expect(commitReviewedTranslation(flaky, frozen)).rejects.toBeInstanceOf(TranslationOutcomeUnknownError);
    expect(sql("SELECT status FROM ai_jobs")).toBe("completed");
  });
  it("changed replay is rejected after the original commit", async () => {
    await commitReviewedTranslation(client, frozen); const committed = snapshot();
    await expect(commitReviewedTranslation(client, { ...frozen, p_overwrite: false })).rejects.toThrow();
    expect(snapshot()).toBe(committed);
  });
  it("chapter save leaves another chapter and the draft status intact", async () => {
    frozen.p_scope = "chapter"; frozen.p_expected_source = frozen.p_expected_source.slice(0, 1); frozen.p_expected_target = frozen.p_expected_target.slice(0, 1); frozen.p_chapters = frozen.p_chapters.slice(0, 1);
    sql("UPDATE ai_jobs SET input=jsonb_set(input,'{scope}','\"chapter\"'), output=jsonb_set(output,'{scope}','\"chapter\"')");
    frozen.p_final_report.scope = "chapter"; frozen.p_job_revision = JSON.parse(sql("SELECT to_jsonb(updated_at) FROM ai_jobs"));
    await expect(commitReviewedTranslation(client, frozen)).resolves.toMatchObject({ savedChapters: 1 });
    expect(sql("SELECT status FROM book_versions WHERE language_code='en'")).toBe("draft");
    expect(sql("SELECT content FROM chapters WHERE id='00000000-0000-4000-8000-000000000008'")).toBe("Old target two");
  });
  it.each(["anon", "authenticated"])("rejects RPC execution by %s before any writes", async (role) => {
    const unchanged = snapshot();
    expect(() => sql(`SET ROLE ${role}; SELECT public.commit_reviewed_translation(${Object.entries(frozen).map(([key, value]) => `${key} => ${quote(value)}`).join(",")});`)).toThrow();
    expect(snapshot()).toBe(unchanged);
  });
  it("inserts an absent target chapter under its immediate version foreign key", async () => {
    sql("DELETE FROM chapters WHERE id='00000000-0000-4000-8000-000000000008'");
    frozen.p_expected_target = frozen.p_expected_target.filter((row) => row.order !== 1);
    await expect(commitReviewedTranslation(client, frozen)).resolves.toMatchObject({ savedChapters: 2 });
    expect(sql("SELECT count(*) FROM chapters WHERE book_version_id='00000000-0000-4000-8000-000000000004'")).toBe("2");
  });
  it("serializes simultaneous identical invocations into one commit and one replay", async () => {
    const invocation = `SELECT public.commit_reviewed_translation(${Object.entries(frozen).map(([key, value]) => `${key} => ${quote(value)}`).join(",")});`;
    const call = () => new Promise<string>((resolve, reject) => {
      execFile(join(pg, "psql"), [...args, "-c", "BEGIN; SET ROLE service_role", "-c", invocation, "-c", "SELECT pg_sleep(0.1)", "-c", "COMMIT"], { encoding: "utf8", env }, (error, stdout) => error ? reject(error) : resolve(stdout.trim()));
    });
    const results = await Promise.all([call(), call()]);
    expect(results.map((raw) => JSON.parse(raw).replayed).sort()).toEqual([false, true]);
    expect(sql("SELECT string_agg(version_number::text, ',' ORDER BY id) FROM chapters WHERE book_version_id='00000000-0000-4000-8000-000000000004'")).toBe(frozen.p_expected_target.map((row) => row.version_number + 1).join(","));
  });
  it.skipIf(!process.env.TRANSLATION_RPC_TEST_FIXTURE)("rolls back real incoming cascades and SET NULL, then applies them only on successful explicit overwrite", async () => {
    sql("INSERT INTO chapters(id,book_id,book_version_id,title,content,\"order\") VALUES ('00000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000004','Extra','Old extra chapter',2)");
    frozen.p_expected_target = JSON.parse(sql("SELECT jsonb_agg(jsonb_build_object('id',id,'title',title,'content',content,'order',\"order\",'updated_at',updated_at,'version_number',version_number,'deleted_at',deleted_at) ORDER BY \"order\") FROM chapters WHERE book_version_id='00000000-0000-4000-8000-000000000004'"));
    sql("INSERT INTO readings(user_id,book_id,chapter_id) VALUES ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000009'); INSERT INTO comments(author_id,book_id,chapter_id,body) VALUES ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000009','Fixture comment'); ALTER TABLE ai_jobs ADD CONSTRAINT reject_completion CHECK(status <> 'completed')");
    const unchanged = snapshot();
    await expect(commitReviewedTranslation(client, frozen)).rejects.toThrow();
    expect(snapshot()).toBe(unchanged);
    expect(sql("SELECT count(*) FROM comments")).toBe("1"); expect(sql("SELECT chapter_id FROM readings")).toBe("00000000-0000-4000-8000-000000000009");
    sql("ALTER TABLE ai_jobs DROP CONSTRAINT reject_completion");
    await expect(commitReviewedTranslation(client, frozen)).resolves.toMatchObject({ savedChapters: 2 });
    expect(sql("SELECT count(*) FROM comments")).toBe("0"); expect(sql("SELECT chapter_id IS NULL FROM readings")).toBe("t");
  });
});
