import { NextResponse } from "next/server";
import {
  MCP_TOOL_DEFINITIONS,
  getAuthor,
  getBook,
  searchBooks,
} from "@/lib/api/mcp-tools";
import { getClientIp, publicApiRateLimiter } from "../_shared";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "verkli-public", version: "1.0.0" } as const;

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
};

function rpcResult(id: JsonRpcRequest["id"], result: unknown) {
  return { jsonrpc: "2.0" as const, id: id ?? null, result };
}

function rpcError(
  id: JsonRpcRequest["id"],
  code: number,
  message: string,
  data?: unknown
) {
  return {
    jsonrpc: "2.0" as const,
    id: id ?? null,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  };
}

function asTextContent(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

async function dispatch(req: JsonRpcRequest): Promise<unknown | null> {
  // Notifications (no id) get no response per JSON-RPC 2.0
  const isNotification = req.id === undefined || req.id === null;

  switch (req.method) {
    case "initialize":
      return rpcResult(req.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions:
          "Read-only Verkli public API. Use search_books, get_book, get_author for discovery. No writes, no purchases.",
      });

    case "notifications/initialized":
    case "notifications/cancelled":
      return isNotification ? null : rpcResult(req.id, {});

    case "ping":
      return rpcResult(req.id, {});

    case "tools/list":
      return rpcResult(req.id, { tools: MCP_TOOL_DEFINITIONS });

    case "tools/call": {
      const params = req.params ?? {};
      const name = String(params.name ?? "");
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      try {
        let value: unknown;
        if (name === "search_books") {
          value = await searchBooks({
            q: typeof args.q === "string" ? args.q : undefined,
            language: typeof args.language === "string" ? args.language : undefined,
            is_free: typeof args.is_free === "boolean" ? args.is_free : undefined,
            limit: typeof args.limit === "number" ? args.limit : undefined,
          });
        } else if (name === "get_book") {
          if (typeof args.id !== "string") {
            return rpcError(req.id, -32602, "get_book: id is required");
          }
          value = await getBook({ id: args.id });
        } else if (name === "get_author") {
          if (typeof args.id !== "string") {
            return rpcError(req.id, -32602, "get_author: id is required");
          }
          value = await getAuthor({ id: args.id });
        } else {
          return rpcError(req.id, -32601, `Unknown tool: ${name}`);
        }
        return rpcResult(req.id, asTextContent(value));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Tool execution failed";
        return rpcResult(req.id, {
          content: [{ type: "text", text: message }],
          isError: true,
        });
      }
    }

    default:
      if (isNotification) return null;
      return rpcError(req.id, -32601, `Method not found: ${req.method}`);
  }
}

export async function POST(request: Request) {
  const limit = await publicApiRateLimiter.check(getClientIp(request));
  if (!limit.allowed) {
    return NextResponse.json(
      rpcError(null, -32000, "Rate limit exceeded", {
        retryAfterSeconds: limit.retryAfterSeconds,
      }),
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(rpcError(null, -32700, "Parse error"), { status: 400 });
  }

  if (Array.isArray(body)) {
    const responses: unknown[] = [];
    for (const item of body) {
      const res = await dispatch(item as JsonRpcRequest);
      if (res !== null) responses.push(res);
    }
    if (responses.length === 0) return new Response(null, { status: 204 });
    return NextResponse.json(responses);
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(rpcError(null, -32600, "Invalid Request"), { status: 400 });
  }

  const res = await dispatch(body as JsonRpcRequest);
  if (res === null) return new Response(null, { status: 204 });
  return NextResponse.json(res);
}

export function GET() {
  return NextResponse.json(
    {
      name: SERVER_INFO.name,
      version: SERVER_INFO.version,
      protocolVersion: PROTOCOL_VERSION,
      transport: "streamable-http",
      tools: MCP_TOOL_DEFINITIONS.map((t) => t.name),
      docs: "https://modelcontextprotocol.io",
      hint: "POST JSON-RPC 2.0 requests to this endpoint.",
    },
    { headers: { "cache-control": "public, max-age=300" } }
  );
}
