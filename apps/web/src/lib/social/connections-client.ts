import { z } from "zod";
const connectionSchema = z.object({
  id: z.string(), platform: z.string(), platform_username: z.string().nullable(), status: z.string(), token_expires_at: z.string().nullable(),
});
export type SafeConnection = z.infer<typeof connectionSchema>;
export interface ConnectionsClient {
  list(): Promise<SafeConnection[]>;
  connectX(): Promise<void>;
  disconnectX(): Promise<void>;
}
const errors: Record<string, string> = {
  SOCIAL_FEATURE_DISABLED: "Social connections are not enabled in this environment.",
  PRO_SUBSCRIPTION_REQUIRED: "Connecting social accounts requires Pro under the current access rules.",
  SUBSCRIPTION_PAST_DUE: "Update your subscription payment before managing connected accounts.",
  SOCIAL_CONNECTION_CHANGED: "This connection changed. Reload before disconnecting it.",
  SOCIAL_DISCONNECT_FAILED: "Could not disconnect this account. Reload to check its current status.",
  SOCIAL_ALREADY_CONNECTED: "This account is already connected. Reload its status; disconnect it before reconnecting.",
};
async function request(url: string, method = "GET") {
  const response = await fetch(url, { method, credentials: "same-origin", cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data?.error === "string" && Object.prototype.hasOwnProperty.call(errors, data.error) ? errors[data.error] : "Could not update social connections. Reload and try again.");
  return data;
}
export const connectionsClient: ConnectionsClient = {
  async list() {
    const parsed = z.array(connectionSchema).safeParse((await request("/api/social/connections"))?.connections);
    if (!parsed.success) throw new Error("Could not read connection status. Reload and try again.");
    return parsed.data;
  },
  async connectX() {
    const data = await request("/api/social/connect/x", "POST");
    let url: URL;
    try { url = new URL(data.authUrl); } catch { throw new Error("Could not open X authorization. Reload and try again."); }
    if (url.protocol !== "https:" || url.hostname !== "twitter.com" || url.pathname !== "/i/oauth2/authorize" || url.username || url.password || url.port) throw new Error("Unexpected X authorization address. Connection stopped.");
    window.location.assign(url.toString());
  },
  async disconnectX() { await request("/api/social/connections/x", "DELETE"); },
};
export function connectionStatus(connection: SafeConnection | undefined, now = Date.now()): string {
  if (!connection || connection.status === "revoked") return "Not connected";
  if (connection.status !== "active") return "Needs attention";
  if (!connection.token_expires_at) return "Connected · expiry not provided";
  const expiry = Date.parse(connection.token_expires_at);
  if (!Number.isFinite(expiry)) return "Needs attention";
  return expiry <= now ? "Expired · reconnect required" : "Connected";
}
