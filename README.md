# X++ Code Review & Development Toolkit

A set of GitHub Copilot agents, Claude Code skills, an automated test runner, and a React dashboard for reviewing, writing, testing, and maintaining X++ code in Dynamics 365 Finance & Operations projects.

## Quick Start

```bash
# 1. Install dependencies
npm install
npm run install:frontend

# 2. Build the dashboard
npm run build

# 3. Start the server
npm start
```

The dashboard is available at **http://localhost:3000**.

## Agents

Five Copilot agents live in `.github/agents/`. Invoke them in VS Code Copilot Chat using `@agent-name`.

### @xpp-solution-analyzer — Understand your solution

Run this **first** on any new solution. It reads your `.sln` and all `.rnrproj` projects, analyzes every table, class, form, enum, and EDT, then writes a structured summary to `.tmp/solution-summary.md`. All other agents depend on this summary.

```
@xpp-solution-analyzer analyze my solution
```

**What it does:**
- Parses `.sln` → `.rnrproj` → inventories all objects
- Deep-reads tables (fields, indexes, relations), classes (methods, inheritance), forms (datasources, patterns)
- Generates a comprehensive markdown summary with table relationships, class architecture, and form structure

### @xpp-code-reviewer — Review your code

Performs a comprehensive code review against X++ best practices, security patterns, performance rules, and common pitfalls.

```
@xpp-code-reviewer review my code
@xpp-code-reviewer review my changes
```

**Two modes:**
| Command | Mode | What it reviews |
|---------|------|-----------------|
| "review my code" | Full Review | All files in the solution |
| "review my changes" / "review my branch" | Branch Diff | Only files changed since the branch diverged from its parent |

**Output:**
- Chat summary with issues, strengths, and recommendations per file
- `.tmp/code-review-result.json` — structured data consumed by the dashboard
- View results at **http://localhost:3000** with severity/category charts, filters, and per-file detail pages

### @xpp-coder — Write and modify X++ code

An expert X++ developer that writes production-quality code following D365 conventions.

```
@xpp-coder create a batch job class that processes purchase orders
@xpp-coder add error handling to the validate method
@xpp-coder extend PurchTable with a new field
```

**Capabilities:**
- Write new classes, tables, forms, enums, EDTs, security objects, data entities
- Modify existing code — add methods, refactor, optimize, fix bugs
- Implement patterns — Chain of Command, SysOperation batch jobs, number sequences, event handlers
- Auto-updates `.rnrproj` project files when creating new objects

### @xpp-test-writer — Write and verify X++ tests

Writes thorough X++ test classes following SysTest framework patterns, then runs them on the OneBox dev box to verify they pass.

```
@xpp-test-writer write tests for PurchCopilotGenActionPlanParser
@xpp-test-writer add test coverage for the email filter feature
```

**Capabilities:**
- Generates test classes following AAA (Arrange/Act/Assert) pattern
- Uses ATL entity builders, `SysDetourContext` mocking, and form adaptors where appropriate
- Auto-runs tests via the CLI test runner after writing them
- Iterates up to 3 fix cycles if tests fail, then reports results

### @xpp-fix-applier — Apply accepted review fixes

After reviewing issues on the dashboard and clicking **Accept Fix**, this agent applies the accepted changes to your actual source files.

```
@xpp-fix-applier apply accepted fixes
```

**Workflow:**
1. Reads `.tmp/accepted-fixes.json` (populated by the dashboard)
2. Locates each source file using the solution paths
3. Finds the problematic code and replaces it with the fix
4. Marks applied fixes so they aren't re-applied
5. Reports a summary of applied and skipped fixes

## Typical Workflow

```
1.  @xpp-solution-analyzer analyze my solution
2.  @xpp-code-reviewer review my changes
3.  Open http://localhost:3000 → review issues → click "Accept Fix" on issues to fix
4.  @xpp-fix-applier apply accepted fixes
5.  @xpp-coder <implement new features or refactor code>
6.  @xpp-test-writer write tests for <class>
```

## Test Runner

An automated CLI test runner for X++ SysTests on a D365 OneBox dev box.

```powershell
# Run a single test class
.\scripts\Run-XppTests.ps1 -TestClasses "MyTestClass"

# Run multiple test classes
.\scripts\Run-XppTests.ps1 -TestClasses "ClassA,ClassB"
```

**Architecture:**
```
Run-XppTests.ps1                     PowerShell orchestrator
  └─► scripts/SysTestLauncher.exe    C# wrapper (bypasses ReadKey prompt)
        └─► SysTestConsole.17.0.exe  D365 built-in CLI test runner
              └─► AxDB SQL Server    Test execution with AutoRollback isolation
```

- Exit code `0` = all passed, `1` = failures
- Results written to `.tmp/test-results.xml` (SysTestListenerXML format)
- First test takes ~15s (AOS kernel init), subsequent tests ~3s each

## Claude Code Skills

Domain knowledge and task automation packaged as [Claude Code skills](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/skills) in `.claude/skills/`. These are also referenced by the GitHub Copilot agents as shared knowledge.

| Skill | Type | Description |
|-------|------|-------------|
| `run-tests` | Task (invokable via `/run-tests`) | Run X++ tests and report results |
| `xpp-patterns` | Reference (auto-loaded) | X++ coding patterns, rules, and anti-patterns |
| `xpp-test-patterns` | Reference (auto-loaded) | X++ test writing patterns (AAA, naming, setup) |
| `xpp-solution-paths` | Reference (auto-loaded) | Solution/source path resolution and caching |
| `less-vrtt` | Reference (auto-loaded) | LESS styles and VRTT for extensible controls |

## Dashboard

A React app (Vite + React 19) that visualizes code review results.

**Features:**
- File list view with aggregate stats (total issues, severity breakdown)
- Per-file detail pages with issue cards, severity/category charts
- Filter issues by severity and category
- Accept individual fixes (persisted to `.tmp/accepted-fixes.json`)
- Shows "Applied to source" status after the fix-applier agent runs
- Branch diff info when reviewing changes

**API endpoints:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/review` | Review data from `code-review-result.json` |
| GET | `/api/accepted-fixes` | All accepted fixes |
| POST | `/api/accept-fix` | Accept a single fix |
| PATCH | `/api/accepted-fixes/mark-applied` | Mark fixes as applied |
| DELETE | `/api/accepted-fixes/applied` | Remove applied fixes |
| DELETE | `/api/accepted-fixes` | Clear all accepted fixes |

## Project Structure

```
XppAgents/
├── .github/agents/              # Copilot agent definitions
│   ├── xpp-solution-analyzer.agent.md
│   ├── xpp-code-reviewer.agent.md
│   ├── xpp-coder.agent.md
│   ├── xpp-test-writer.agent.md
│   └── xpp-fix-applier.agent.md
├── .claude/
│   ├── CLAUDE.md                # Claude Code project instructions
│   └── skills/                  # Claude Code skills
│       ├── run-tests/           # Test runner skill (SKILL.md + reference.md + lessons.md)
│       ├── xpp-patterns/        # X++ coding patterns (SKILL.md)
│       ├── xpp-test-patterns/   # X++ test patterns (SKILL.md + reference.md)
│       ├── xpp-solution-paths/  # Path resolution (SKILL.md)
│       └── less-vrtt/           # LESS/VRTT docs (SKILL.md)
├── scripts/                     # CLI test runner
│   ├── Run-XppTests.ps1         # PowerShell orchestrator
│   ├── SysTestLauncher.exe      # C# wrapper (bypasses Console.ReadKey)
│   └── SysTestLauncher.cs       # Source for the launcher
├── frontend/                    # React dashboard app (Vite)
│   ├── src/
│   │   ├── components/          # Header, StatsGrid, Charts, FilterBar, IssueCard
│   │   ├── pages/               # FileListPage, FileDetailPage, DiffPage
│   │   ├── App.jsx              # Router setup
│   │   ├── api.js               # API client
│   │   └── utils.js             # Helpers
│   └── package.json
├── knowledge/
│   └── agent-memory.md          # Cross-session memory instructions
├── server.js                    # Node.js HTTP server (API + static file serving)
├── package.json                 # Root scripts
├── .env.json                    # Cached solution/source paths (git-ignored)
└── .tmp/                        # Generated output files (git-ignored)
    ├── .memory.md               # Agent memory file
    ├── code-review-result.json
    ├── accepted-fixes.json
    ├── test-results.xml
    └── solution-summary.md
```

## Path Configuration

On first use, any agent will ask for two paths:

1. **Solution path** — folder containing the `.sln` file (e.g., `C:\Users\you\source\repos\MyProject`)
2. **Source code path** — base directory with X++ source files (e.g., `C:\AosService\PackagesLocalDirectory`)

These are cached in `.env.json` so you only need to provide them once. To reset, delete `.env.json` or tell any agent to "use a different solution".

## Development

```bash
# Run the dashboard in dev mode (hot reload on port 5173, proxies API to 3000)
npm start                  # start the server
npm run dev:frontend       # start Vite dev server

# Rebuild after frontend changes
npm run build
```
