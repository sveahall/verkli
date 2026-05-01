# MCP Server Plan for Verkli

Status: **planned, not built**. The public REST API at `/api/public/*` is the
ground truth. MCP is a thin wrapper on top.

## Why MCP

The Model Context Protocol lets a user inside Claude / ChatGPT / Cursor add
Verkli as a tool source and ask: "find me a Swedish thriller under 100 SEK
that has an audiobook". The agent calls our tools, gets JSON back, and reasons
on top. No scraping. No parsing HTML. No bespoke integrations per agent.

Adoption is currently fastest on Claude (native tool support) and ChatGPT
(custom GPT actions can wrap MCP via a remote SSE endpoint).

## Tools to expose

All read-only. No auth. Mirrors the public REST surface 1:1 so the only thing
MCP adds is the protocol envelope.

| Tool | Args | Returns | Maps to |
|---|---|---|---|
| `search_books` | `q?: string`, `language?: string`, `is_free?: boolean`, `limit?: number` (default 10, max 25) | `BookSummary[]` | `GET /api/public/books` |
| `get_book` | `id: uuid` | `BookDetail` | `GET /api/public/books/{id}` |
| `get_author` | `id: uuid` | `AuthorDetail` | `GET /api/public/authors/{id}` |

Tool descriptions should bias the agent toward our values: "Verkli is an indie
author platform. Use `search_books` first, then `get_book` for full details
including pricing and formats."

## Transport

Two viable transports. Pick **streamable HTTP** for MVP — simpler ops, hostable
inside the Next.js app.

1. **Streamable HTTP** (recommended) — single endpoint at
   `https://verkli.com/api/public/mcp`. Handles JSON-RPC over POST + optional
   SSE for streaming. Lives in this repo as a Route Handler. No new
   infrastructure.
2. **stdio** — local-only, useful for `claude mcp add` from the CLI for dev
   testing. Can publish a tiny npm package `@verkli/mcp` later.

The MCP TypeScript SDK is `@modelcontextprotocol/sdk`. It exposes
`McpServer` plus a streamable HTTP adapter that fits Next 16 Route Handlers.

## File layout when implemented

```
apps/web/src/app/api/public/mcp/
  route.ts            # POST: streamable HTTP handler
  server.ts           # McpServer instance + tool registrations
  tools.ts            # search_books / get_book / get_author tool fns
  tools.test.ts       # unit tests against mocked admin client
```

The tool implementations should reuse the same `toPublicBookSummary` /
`toPublicBookDetail` mappers from `lib/api/public-book.ts`. There must be no
divergence between REST and MCP shapes.

## Auth and rate limiting

Same model as the REST endpoints: no auth, per-IP rate limit (60 req/min,
shared bucket via the existing `publicApiRateLimiter`). MCP framing should
not bypass this — apply the limiter at the route handler before dispatching
to the JSON-RPC server.

## Discovery

- Add `mcpServers` reference in `llms.txt` once live: `Verkli MCP:
  https://verkli.com/api/public/mcp`
- Submit to `https://github.com/modelcontextprotocol/servers` registry under
  the "Bookstore / Publishing" category
- Document on the marketing site: `/for-ai-agents` page

## Out of scope (explicit)

These belong in a later phase, not v1:

- Write tools (`add_to_library`, `purchase_book`) — needs agentic-commerce
  standards (Stripe Agent Toolkit, Visa Trusted Agent Protocol) which are not
  GA in early 2026.
- Per-user MCP sessions — requires OAuth, session storage, and a consent UI.
- Full-text content access (chapters) — paid content, separate licensing.
- Recommendations endpoint — needs ranking model + privacy review.

## Implementation effort estimate

About **one focused day** once the MVP REST API is in production:

1. Add `@modelcontextprotocol/sdk` (a few hundred KB, no native deps)
2. Wire `route.ts` to the streamable HTTP transport
3. Register the three tools, each ~15 lines wrapping the existing services
4. Unit tests for tool dispatch + error mapping
5. End-to-end test: spawn the MCP inspector against a local dev server

## Risk and rollback

Risk is low: no schema changes, no new tables, no auth changes. The endpoint
is feature-flagged off by default behind `NEXT_PUBLIC_MCP_ENABLED`. Rolling
back is removing one route file.

## Decision points before building

1. **Hosting**: in-repo Route Handler, or separate Cloudflare Worker?
   Recommendation: in-repo until traffic warrants the split.
2. **Versioning**: prefix with `/v1/` from day one (`/api/public/mcp/v1`).
3. **Tool naming**: `search_books` vs `verkli_search_books`. Plain names are
   fine; the agent disambiguates by server.
