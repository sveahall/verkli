"use client";
import { useState } from "react";
import { ChannelConnections } from "@/components/marketing/ChannelConnections";
import type { ConnectionsClient, SafeConnection } from "@/lib/social/connections-client";
function createSyntheticClient(): ConnectionsClient {
  let connection: SafeConnection | null = null;
  return {
    async list() { return connection ? [structuredClone(connection)] : []; },
    async connectX() { connection = { id: "synthetic-x", platform: "x", platform_username: "sample_author", status: "active", token_expires_at: null }; },
    async disconnectX() { connection = null; },
  };
}
export default function ChannelConnectionsPreview() {
  const [client] = useState(createSyntheticClient);
  return <main className="mx-auto max-w-3xl p-6"><p className="mb-4 text-sm text-muted-foreground">Local session only. Reloading the page resets this synthetic connection.</p><ChannelConnections client={client} testMode /></main>;
}
