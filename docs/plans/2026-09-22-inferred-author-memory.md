# Inferred author memory

Status: design, not started. Written 2026-09-22.

Extends PR #76 (`codex/ai-memory-20260921`), which is open. Its migration
`20260921220000_ai_memory` is not on `platform`, but the PR reports it as already
applied in production — so the database is ahead of the code until #76 merges.

## What #76 built, and what it left

#76 gives specialists resumable conversations and memories the author types
themselves: `ai_memories` rows scoped to author, book or edition, 500 characters
each, at most 24 applicable, editable and forgettable, loaded into the prompt by
`getPreferences()` in `features/ai-team/memory/server.ts`.

Its last line: *"Explicit preferences and bounded history only; automatic
summaries/inferred memories are deferred."*

That deferred half is the one that removes the work. A memory the author had to
type is a memory they had to think of first. The value is the model knowing how
they write without being told — the first prompt already being right.

## Three things worth knowing before designing this

**`ai_memories` is already the right shape.** Scoped, bounded free text with an
edit/forget surface. This design adds no new memory table.

**It has no provenance column.** A row the author dictated and a row the system
guessed are indistinguishable. That is not a metadata gap; it is the reason a
wrong guess could never be demoted, explained or selectively cleared.

**The best available signal is discarded.** In `EditorialReviewPanel.tsx`
accept/reject per correction is React state (`useState`), written to no table and
sent to no endpoint. It is gone when the panel closes.

That signal is labelled preference data of unusual quality, and rejection is the
stronger label. An accept can mean "fine, whatever". A rejection means the author
spent attention to disagree — that is the difference between a preference and
indifference.

## Design

### Two producers, and why the trust boundary is mechanical

The decision was: narrow observations apply immediately, broad claims about an
author's voice need a yes. The objection to that split is that the boundary gets
argued in every edge case.

It does not have to be argued, because the boundary is not what the memory says.
It is how the memory was produced:

**The counter — narrow, applies immediately, and uses no model at all.**
After a review session, count persisted decisions. Three or more rejections of
the same finding category within one book, with no accepts in that category,
emits one memory with templated text: *"Rejects `style` suggestions; treat as
deliberate."* Scope is the book, or the author once it holds across two books.

Counting is deterministic. It has no hallucination surface, needs no provider
call, and is covered by ordinary unit tests. It is both the cheaper producer and
the one with the better signal.

**The characteriser — broad, needs a yes.**
One pass at first review. Samples chapters, asks a model for at most three
candidate claims about the prose. Lands pending.

A memory derived from counting labelled events is narrow by construction. A
memory derived from a model interpreting prose is broad by construction. No
per-case judgement is required.

### Schema delta

`ai_memories` gains:

```
source    'author' | 'observed' | 'inferred'   not null default 'author'
status    'active' | 'pending'  | 'dismissed'  not null default 'active'
evidence  jsonb                                nullable
```

The counter writes `observed`/`active`. The characteriser writes
`inferred`/`pending`. The author keeps writing `author`/`active`, so #76 needs no
change to keep working.

`getPreferences()` filters to `status = 'active'`. The 24-memory cap counts
active rows only, so a pending queue cannot crowd out real preferences.

`evidence` records what the conclusion rested on — decision counts, chapter ids.
The memory panel shows *why*, not only *what*. A guess the author cannot trace is
a guess they cannot fairly judge.

### The prerequisite: persist the decisions

New table `editorial_decisions`: review run, chapter, finding category, severity,
decision (`accepted` | `rejected` | `undone`), timestamp. Written by the accept,
reject and undo handlers that currently only call `setDecisions`.

This is worth building on its own merits. It answers, in production, the question
`scripts/compare-critic.ts` only answers offline: whether the critic pass earns
its second model call. Rejection rate per category is the measurement.

### Two rules that keep it safe

**Precedence.** `author` beats `observed` beats `inferred`. When an author writes
something that contradicts a guess, the guess is dismissed. A guess never
outranks something the author formulated themselves.

**Forgetting.** When an author starts accepting suggestions in a category the
counter reversed on, the count unwinds and the memory is dismissed
automatically. A guess that has stopped being true should stop applying without
anyone doing anything about it. Without this, stale guesses only accumulate.

## Sequencing

1. **`editorial_decisions` capture.** Independent of #76 — it touches the review
   panel and a new table, not `ai_memories`. Buildable now, useful alone.
2. **The counter.** Needs #76 merged, since it writes `ai_memories` rows.
3. **The characteriser.** Last, and only if step 2 shows the memories change
   output in a way authors keep rather than forget.

Step 3 is genuinely optional. If the counter alone makes the assistant feel like
it knows the author, the model-driven producer is cost without a case.

## Out of scope, deliberately

No embeddings, no vector search, no per-message summarisation. Twenty-four rows
of free text is a small budget, and a small budget is the point: it forces the
producers to emit only what matters. Retrieval infrastructure before the idea is
proven is infrastructure for its own sake.

## Risks

**The counter's threshold is a guess.** Three rejections is a starting number,
not a derived one. `editorial_decisions` makes it tunable against real data,
which is another reason to build the capture first.

**Categories are coarse.** `editorialReportSchema` offers eight: spelling,
grammar, style, plot, characters, pacing, translation, consistency. "Rejects
style suggestions" is broad for something classed as narrow. If that proves too
blunt, the fix is to key on the finding's category plus a normalised quote
shape, not to widen the memory text.

**Prompt weight.** Twenty-four memories, 500 characters each, is 12k characters
before the manuscript. Worth measuring against the editorial budget pipeline
(`EDITORIAL_DAILY_BUDGET`) before the cap is raised.

## Testing

The counter is pure logic over rows: table-driven unit tests for the threshold,
the no-accepts condition, scope promotion from book to author, and the unwind.
Precedence and forgetting each get a test that asserts the author's own row
survives.

The characteriser is mocked at the provider boundary like `adjudicate.test.ts`,
asserting that its output lands `pending` and never `active`.
