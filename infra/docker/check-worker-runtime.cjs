// Run inside every worker image after npm ci. No credentials or network needed.
const { createClient } = require("@supabase/supabase-js");

if (Number(process.versions.node.split(".")[0]) < 22 || typeof WebSocket !== "function") {
  throw new Error("[worker runtime] Node.js 22+ with native WebSocket is required by the Supabase client.");
}

createClient("https://runtime-check.invalid", "runtime-check", {
  auth: { persistSession: false, autoRefreshToken: false },
});
console.log(`[worker runtime] Supabase client initialized on ${process.version}; native WebSocket available.`);
