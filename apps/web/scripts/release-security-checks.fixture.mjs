// Preloaded only by release-security-checks.test.ts: no env files, providers,
// Redis connections or release commands are used by these subprocess tests.
import { createRequire, syncBuiltinESMExports } from "node:module";
import childProcess from "node:child_process";
import net from "node:net";
import dns from "node:dns/promises";

const require = createRequire(import.meta.url);
require("dotenv").config = () => ({ parsed: {} });
net.Socket.prototype.connect = () => {
  throw new Error("Unexpected network connection in release check test");
};

const scenario = JSON.parse(process.env.RELEASE_CHECK_SCENARIO);
const policy = {
  policyname: "chapters_select",
  cmd: "SELECT",
  permissive: "PERMISSIVE",
  roles: ["anon", "authenticated"],
  qual: "has_book_entitlement(book_id)",
};

globalThis.fetch = async (url, init) => {
  const parsed = new URL(url);
  let response;
  let probe;
  if (parsed.pathname.endsWith("/billing_plan_catalog")) {
    probe = "catalog";
    response = scenario.catalog;
  } else if (parsed.pathname.startsWith("/v1/prices/")) {
    probe = "price";
    response = scenario.price;
  } else if (parsed.pathname === "/v1/webhook_endpoints") {
    probe = "webhooks";
    response = scenario.webhooks;
  } else if (parsed.pathname.endsWith("/rpc/policy_inventory")) {
    probe = "inventory";
    response = scenario.inventory ?? { body: [policy] };
  } else if (parsed.pathname.endsWith("/books")) {
    const service = new Headers(init?.headers).get("apikey") === "test-service-role";
    probe = service ? "books" : "anon-books";
    response = (service ? scenario.books : scenario.anonBooks)
      ?? { body: [{ id: "paid-book", title: "Paid fixture" }] };
  } else if (parsed.pathname.endsWith("/chapters")) {
    const service = new Headers(init?.headers).get("apikey") === "test-service-role";
    probe = service ? "service-chapters" : "anon-chapters";
    response = service
      ? scenario.serviceChapters ?? { body: [{ id: "paid-chapter" }] }
      : scenario.anonChapters ?? { body: [] };
  }
  if (!response) throw new Error(`Unexpected fetch in release check test: ${parsed.pathname}`);
  console.log(`[fixture request] ${probe}`);
  if (response.throw) throw new Error(response.throw);
  return new Response(response.raw ?? JSON.stringify(response.body), {
    status: response.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
};

if (scenario.queues) {
  dns.lookup = async () => ({ address: "127.0.0.1", family: 4 });
  const bullmqPath = require.resolve("bullmq");
  require(bullmqPath);
  require.cache[bullmqPath].exports = { Queue: class Queue {
    constructor(name) { this.name = name; }
    async getWorkers() { return Array(scenario.queues[this.name]?.workers ?? 1).fill({}); }
    async getJobCounts() { return { waiting: scenario.queues[this.name]?.pending ?? 0 }; }
    async close() {}
  } };
}

// qa-beta's orchestration is real; its Redis SDK and child commands are mocks.
const redisPath = require.resolve("ioredis");
require(redisPath);
require.cache[redisPath].exports = class Redis {
  on() {}
  async connect() {}
  async ping() { return "PONG"; }
  async quit() {}
  disconnect() {}
};
childProcess.execSync = (command) => {
  console.log(`[fixture command] ${command}`);
  if (scenario.qaSkip && command.includes(`scripts/${scenario.qaSkip}`)) {
    console.log("SKIPPED — required check input unavailable in fixture");
    if (command.includes("--strict")) throw new Error("Strict check cannot skip");
  }
  return Buffer.alloc(0);
};
syncBuiltinESMExports();
