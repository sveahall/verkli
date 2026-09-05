import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const appRoot = path.resolve(__dirname, "../../..");
const empty = "export default function Empty() { return null; }";
const adapters: Record<string, string> = {
  "next/navigation": "export const useRouter = () => ({ push() {}, refresh() { window.autosaveHarness.refresh(); } });",
  "next/image": empty,
  "@/components/ui/toast": `
    const toast = { error: (message) => window.autosaveHarness.toasts.push(message), success: (message) => window.autosaveHarness.successes.push(message) };
    export const useToastHelpers = () => toast;
  `,
  "@/lib/supabase/client": `
    export const createClient = () => ({
      from(table) {
        if (!['chapters', 'ai_jobs', 'chapter_audio_cache'].includes(table)) throw Error('Unexpected table: ' + table);
        return {
          select(columns) {
            if (table !== 'chapters' || columns !== 'id, order') throw Error('Order reconciliation must not read content');
            return { eq(scope, bookId) {
              if (scope !== 'book_id' || bookId !== 'book') throw Error('Missing book scope in order reconciliation');
              return { in(column, ids) {
                if (column !== 'id' || !ids.length || ids.some(id => !['a', 'b', 'c'].includes(id))) throw Error('Unscoped order reconciliation');
                return window.autosaveHarness.readOrders(ids);
              }};
            }};
          },
          insert(payload) {
            if (table !== 'chapters' || payload.book_id !== 'book' || payload.book_version_id !== 'version' || payload.order !== 3) throw Error('Unexpected chapter insert');
            return { select(columns) {
              if (columns !== 'id, title, content, order, book_version_id') throw Error('Unexpected insert projection');
              return { single() { return window.autosaveHarness.create(payload); } };
            }};
          },
          update(payload) {
            if (table === 'chapters' && Object.keys(payload).join() === 'order') {
              return { eq(column, id) {
                if (column !== 'id' || !['a', 'b', 'c'].includes(id)) throw Error('Unscoped order update');
                return {
                  select(columns) {
                    if (columns !== 'id') throw Error('Unexpected order affected-row projection');
                    window.autosaveHarness.orderProjections.push(columns);
                    return window.autosaveHarness.writeOrder(id, payload.order);
                  },
                  then(resolve, reject) { return window.autosaveHarness.writeOrder(id, payload.order).then(resolve, reject); }
                };
              }};
            }
            if (table === 'chapters' && Object.keys(payload).join() === 'title') {
              return { eq(column, id) {
                if (column !== 'id' || !['a', 'b', 'c'].includes(id)) throw Error('Unscoped chapter rename');
                return {
                  select(columns) {
                    if (columns !== 'id') throw Error('Unexpected rename affected-row projection');
                    window.autosaveHarness.renameProjections.push(columns);
                    return window.autosaveHarness.rename(id, payload.title);
                  },
                  then(resolve, reject) { return window.autosaveHarness.rename(id, payload.title).then(resolve, reject); }
                };
              }};
            }
            if (table !== 'chapters' || Object.keys(payload).join() !== 'content') throw Error('Unexpected update');
            return { eq(column, id) {
              if (column !== 'id' || !['a', 'b', 'c'].includes(id)) throw Error('Unscoped chapter update');
              return { select(columns) {
                if (columns !== 'id') throw Error('Missing affected-row verification');
                return window.autosaveHarness.persist(id, payload.content);
              }};
            }};
          },
          delete() {
            const remove = (column, id) => {
              const expected = { chapters: 'id', ai_jobs: 'input->>chapterId', chapter_audio_cache: 'chapter_id' }[table];
              if (column !== expected || !['a', 'b', 'c'].includes(id)) throw Error('Unscoped chapter deletion');
              if (table !== 'chapters') return window.autosaveHarness.remove(table, column, id);
              return {
                select(columns) {
                  if (columns !== 'id') throw Error('Unexpected delete affected-row projection');
                  window.autosaveHarness.deleteProjections.push(columns);
                  return window.autosaveHarness.remove(table, column, id);
                },
                then(resolve, reject) { return window.autosaveHarness.remove(table, column, id).then(resolve, reject); }
              };
            };
            return { eq: remove, filter(column, operator, id) {
              if (operator !== 'eq') throw Error('Unexpected delete filter');
              return remove(column, id);
            }};
          }
        };
      }
    });
  `,
  "@/lib/supabase/storage": "export const uploadChapterMedia = () => { throw Error('Unexpected media transport'); };",
  "next/dynamic": `
    import React, { lazy, Suspense } from 'react';
    export default function dynamic(load) {
      const Component = lazy(load);
      return function Dynamic(props) {
        return <Suspense fallback={null}><Component {...props} /></Suspense>;
      };
    }
  `,
  "@/components/editor/EditorSidePanel": empty,
  "@/components/editor/EditorStatusBar": empty,
  "../../BookWorkflowHeader": empty,
};

export async function startAutosaveHarness() {
  const parent = readFileSync(path.join(appRoot, "src/app/(app-author)/author/books/[id]/editor/BookEditorView.tsx"), "utf8");
  const boundary = parent.match(/const \[chapters, setChapters\] = useState<Chapter\[\]>\(initialChapters\);[\s\S]*?\}, \[initialChapters\]\);/)?.[0];
  if (!boundary || !readFileSync(path.join(__dirname, "fixture.tsx"), "utf8").includes(boundary)) {
    throw new Error("BookEditorView chapter prop boundary changed; update the mounted autosave fixture to match");
  }
  const bundle = await build({
    absWorkingDir: appRoot,
    entryPoints: [path.join(__dirname, "fixture.tsx")],
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
    alias: { "@": path.join(appRoot, "src") },
    plugins: [{
      name: "synthetic-autosave-io",
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, (args) =>
          adapters[args.path] ? { path: args.path, namespace: "synthetic" } : undefined);
        builder.onLoad({ filter: /.*/, namespace: "synthetic" }, (args) => ({
          contents: adapters[args.path], loader: "jsx", resolveDir: appRoot,
        }));
      },
    }],
  });
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (request.method !== "GET" || !["/", "/app.js"].includes(pathname)) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader("Content-Type", pathname === "/app.js" ? "text/javascript" : "text/html");
    // No remote resources or connections, including when opened manually.
    response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'");
    response.end(pathname === "/app.js" ? bundle.outputFiles[0].contents
      : '<!doctype html><html><head><title>Synthetic autosave regression</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Autosave harness did not bind to loopback");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

// Optional manual localhost QA, using the same isolated fixture as the tests.
if (process.argv[1] && path.resolve(process.argv[1]) === path.join(__dirname, "server.ts")) {
  void startAutosaveHarness().then(({ origin, close }) => {
    console.log(`Synthetic autosave UI: ${origin}/?mode=held (also mode=error or mode=missing)`);
    process.once("SIGINT", () => { void close(); });
    process.once("SIGTERM", () => { void close(); });
  });
}
