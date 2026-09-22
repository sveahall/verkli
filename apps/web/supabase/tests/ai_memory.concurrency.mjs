// Run against ai_memory.fixture.sql + the migration in a disposable local database.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
const database = process.env.AI_MEMORY_TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:55432/verkli_ai_memory";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(database).hostname), "Concurrency fixtures require a disposable local database.");
const psql = process.env.PSQL_BIN ?? "/usr/local/opt/postgresql@14/bin/psql";
const args = ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database];
function sql(statement) {
  return new Promise((resolve, reject) => {
    const child = spawn(psql, args, { stdio: ["pipe", "pipe", "pipe"] });
    let output = "", errors = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { errors += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(output) : reject(new Error(errors)));
    child.stdin.end(statement);
  });
}
const owner = "11111111-1111-4111-8111-111111111111";
const book = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const begin = `begin; set local role authenticated; select set_config('request.jwt.claim.sub','${owner}',true);`;
const request = "71000000-0000-4000-8000-000000000001";
const expiredThread = "72000000-0000-4000-8000-000000000001";
const expiredRequest = "72000000-0000-4000-8000-000000000002";
const reserve = (thread, id, content) => `select public.ai_reserve_request(p_book_id=>'${book}',p_tool=>'edit',p_request_id=>'${id}',p_content=>'${content}'${thread ? `,p_thread_id=>'${thread}'` : ""});`;
const jsonResults = (output) => output.split("\n").filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
async function holdTransaction(statement, whileLocked) {
  const child = spawn(psql, args, { stdio: ["pipe", "pipe", "pipe"] });
  let output = "", errors = "";
  let readyResolve;
  const ready = new Promise((resolve) => { readyResolve = resolve; });
  child.stdout.on("data", (chunk) => { output += chunk; if (output.includes("LOCK_HELD")) readyResolve(); });
  child.stderr.on("data", (chunk) => { errors += chunk; });
  const done = new Promise((resolve, reject) => { child.on("error", reject); child.on("close", (code) => code === 0 ? resolve(output) : reject(new Error(errors))); });
  child.stdin.end(`${begin}${statement}select 'LOCK_HELD';select pg_sleep(0.4);commit;`);
  await Promise.race([ready, done.then(() => { throw new Error("Lock fixture exited before acquiring lock."); })]);
  const second = await whileLocked();
  return { first: await done, second };
}
try {
  const duplicate = await holdTransaction(reserve(null, request, "Concurrent request"), () => sql(`${begin}${reserve(null, request, "Concurrent request")}commit;`));
  assert.equal(jsonResults(duplicate.first)[0].status, "reserved");
  assert.equal(jsonResults(duplicate.second)[0].status, "pending");
  assert.equal(await sql(`select count(*) from public.ai_messages where request_id='${request}';`), "1\n");
  await sql(`${begin}insert into public.ai_threads(id,owner_id,book_id,tool) values('${expiredThread}','${owner}','${book}','edit');insert into public.ai_messages(thread_id,owner_id,request_id,role,content,created_at) values('${expiredThread}','${owner}','${expiredRequest}','user','Old request',now()-interval '3 minutes');commit;`);
  const completion = await holdTransaction(`select public.ai_complete_request('${expiredThread}','${expiredRequest}','Completed response');`, () => sql(`${begin}${reserve(expiredThread, expiredRequest, "Old request")}commit;`));
  assert.equal(jsonResults(completion.second)[0].status, "completed", "A stale expiry check must not overwrite a concurrent completed response.");
  assert.equal(jsonResults(completion.second)[0].content, "Completed response");
  const deletion = await holdTransaction(`select public.ai_delete_thread('${book}','${request}');`, () => sql(`${begin}select public.ai_complete_request('${request}','${request}','Late reply');commit;`));
  assert.equal(jsonResults(deletion.second)[0].status, "deleted", "An in-flight reply must not restore deleted text.");
  console.log("AI memory concurrent reservation, completion/expiry and deletion assertions passed");
} finally {
  await sql(`delete from public.ai_threads where id in ('${request}','${expiredThread}');`);
}
