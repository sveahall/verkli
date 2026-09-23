# AI memory — approved first release

Approved by the user on 21 September 2026, including the four private tables. Implemented from `platform` at `1526b6ff` in an isolated worktree; the active Claude checkout is untouched. No new dependencies.

## User experience

Specialists resume saved conversations within the current book, edition and tool. The author explicitly saves preferences for this book, this edition or all their books. Applicable preferences are shared between specialists and can be edited, forgotten or switched off. A new conversation keeps preferences; a temporary conversation neither loads nor saves preferences or stored history. Current manuscript context still accompanies temporary requests.

History displays the latest 20 conversations and 50 messages in a selected conversation. The author can export the loaded text or delete that conversation. Historical proposals are unconfirmed, readable text; they cannot execute changes against a newer manuscript. A shortened proposal includes an explicit truncation notice. Forgetting a preference does not rewrite old conversation text, so the UI explains how to start a fresh conversation.

## Boundaries

Four RLS-protected tables: `ai_threads`, `ai_messages`, `ai_memories`, `ai_memory_settings`. Ownership comes from authenticated sessions, with book and edition ownership checked again by the database. Author-wide preferences have no book or edition. Existing book/edition/account deletion cascades remove dependent data. Deleting a conversation removes content and retains only request identity tombstones to prevent delayed requests from recreating it.

Durable requests reserve a stable request ID before calling the provider, use server history rather than client history, and report whether the response was saved. Duplicate requests replay saved text without another provider call. Interrupted reservations expire after two minutes; they are not automatically rerun. Memory retrieval failures block a durable request with a retry or explicit temporary-mode choice.

Context is bounded to 24 applicable preferences of at most 500 characters and the latest 12 stored messages. Preferences are untrusted user context, not system instructions. Current user instructions and current manuscript take precedence. This release adds no model extraction calls, inferred preferences, summaries or vector search.

## Deferred

Automatic inferred memories and rolling summaries require a separate quality and user-control design. Persistent pronunciation application to full audiobook generation is separate from remembering an explicit preference. This memory release does not certify payments, print fulfilment or complete audiobook production as launch-ready.

## Verification

See the implementation plan and `docs/qa/2026-09-21-ai-memory.md` for checks and the six-step UI script.
