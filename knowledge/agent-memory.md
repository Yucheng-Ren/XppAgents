# Agent Memory System

All agents share a persistent memory file at `.tmp/.memory.md` in the workspace. This allows decisions, agreements, and important context to carry over across conversations.

## Reading Memory (at start of every session)

**IMPORTANT**: `.tmp/.memory.md` is in `.gitignore` (the entire `.tmp/` folder is ignored), so file search tools will NOT find it. Read it directly by path using the `read` tool.

1. Read `.tmp/.memory.md` from the workspace at the **very beginning** of your session, before doing any other work.
2. Review all entries to understand prior decisions, user preferences, agreements, and context.
3. If the file doesn't exist or is empty, proceed normally — there's no prior context.
4. If a past entry is relevant to the current task, follow the recorded decision unless the user explicitly overrides it.

## Writing Memory (at end of conversation)

Before finishing your work, evaluate whether anything from this conversation should be remembered. **Append** a new entry to `.tmp/.memory.md` if any of the following occurred:

- The user made a **decision** or stated a **preference** (e.g., "always use SysDa instead of while select")
- You and the user **agreed** on an approach or design pattern
- The user provided **clarification** about business logic or domain rules
- Important **context** was discovered about the codebase
- A **convention** was established (naming, structure, etc.)
- The user asked you to **remember** something

**Do NOT** record:
- Routine actions (file reads, searches)
- Temporary details that won't matter in future sessions
- Information already captured in `knowledge/` files or `.tmp/solution-summary.md`

## Entry Format

Append entries using this format (newest at the top, just below the header):

```markdown
### {Date} — {Agent Name} — {Brief Topic}
- **Context**: {What was being discussed}
- **Decision**: {What was decided or agreed}
- **Details**: {Any additional specifics, if needed}
```

Example:
```markdown
### 2026-02-12 — xpp-coder — Foreign key naming convention
- **Context**: User asked to rename table fields
- **Decision**: Foreign key fields referencing another table's RecId should NOT have the RecId suffix. Use the entity name directly (e.g., `Email` not `EmailRecId`).
- **Details**: This is also recorded in knowledge/xpp-patterns.md as a review rule.
```

## Important Rules

- **Never delete** existing entries — memory is append-only.
- **Keep entries concise** — 2-4 lines per entry is ideal.
- **Don't duplicate** — if a decision is already in memory, don't add it again.
- **Respect memory** — if the user previously decided something, follow it. Only override if the user explicitly changes their mind (and record the change).
