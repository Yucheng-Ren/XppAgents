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

## Multi-Project Support

The workspace supports **multiple D365 projects**. Each project has its own solution path and isolated working data, while sharing the same source code path, skills, and knowledge base.

### Configuration (`.env.json`)

```json
{
    "sourceCodePath": "C:\\AosService\\PackagesLocalDirectory",
    "activeProject": "extensibility",
    "solutionPath": "C:\\Users\\you\\source\\repos\\SCM Copilot",
    "projects": {
        "extensibility": {
            "solutionPath": "C:\\Users\\you\\source\\repos\\SCM Copilot",
            "description": "SCM Copilot extensibility project"
        },
        "Excel": {
            "solutionPath": "C:\\Users\\you\\source\\repos\\Copilot",
            "description": "Excel project"
        }
    }
}
```

- **`sourceCodePath`** — shared across all projects (X++ metadata root on the dev box)
- **`activeProject`** — which project agents and the dashboard currently operate on
- **`projects`** — map of project name → `{ solutionPath, description }`
- **`solutionPath`** (top-level) — mirrors the active project's path for backward compatibility

### Per-project data

Each project's working data lives in `.tmp/projects/<projectName>/`:

| File | Purpose |
|------|---------|
| `.memory.md` | Agent memory for this project |
| `solution-summary.md` | Solution structure analysis |
| `code-review-result.json` | Code review findings |
| `accepted-fixes.json` | Fixes accepted via the dashboard |
| `build-<model>.xml` | Build logs |
| `test-results.xml` | Test results |

Skills, knowledge, and scripts are **shared** across all projects.

### Solution discovery

When an agent starts working on a project, it:

1. Reads `.env.json` to get the active project's `solutionPath`
2. Finds and parses the `.sln` file to discover all `.rnrproj` project references
3. Reads each `.rnrproj` to extract the model name and all objects (classes, tables, forms, enums, etc.)
4. Locates source files at `<sourceCodePath>/<ModelName>/<ObjectType>/<ObjectName>.xml`

For details, see `knowledge/project-awareness.md` and `.claude/skills/xpp-solution-paths/SKILL.md`.

### Switching projects

- **Dashboard**: Use the project switcher dropdown in the header
- **Agents**: Update `activeProject` in `.env.json`, or tell any agent to switch
- **API**: `PUT /api/projects/active` with `{ "name": "projectName" }`

## Agents

Six Copilot agents live in `.github/agents/`. Invoke them in VS Code Copilot Chat using `@agent-name`.

### @xpp-solution-analyzer — Understand your solution

Run this **first** on any new project. It reads the `.sln` and all `.rnrproj` projects, analyzes every table, class, form, enum, and EDT, then writes a structured summary to the project-scoped `solution-summary.md`. All other agents depend on this summary.

```
@xpp-solution-analyzer analyze my solution
```

### @xpp-code-reviewer — Review your code

Performs a comprehensive code review against X++ best practices, security patterns, and performance rules.

```
@xpp-code-reviewer review my code
@xpp-code-reviewer review my changes
```

| Command | Mode | What it reviews |
|---------|------|-----------------|
| "review my code" | Full Review | All files in the solution |
| "review my changes" | Branch Diff | Only files changed since the branch diverged |

Output: chat summary + `code-review-result.json` for the dashboard.

### @xpp-coder — Write and modify X++ code

An expert X++ developer that writes production-quality code following D365 conventions.

```
@xpp-coder create a batch job class that processes purchase orders
@xpp-coder add error handling to the validate method
```

### @xpp-test-writer — Write and verify X++ tests

Writes X++ test classes following SysTest patterns, then runs them to verify they pass.

```
@xpp-test-writer write tests for MyClass
@xpp-test-writer add test coverage for the email filter feature
```

### @xpp-fix-applier — Apply accepted review fixes

After reviewing issues on the dashboard and clicking **Accept Fix**, this agent applies the changes to source files.

```
@xpp-fix-applier apply accepted fixes
```

### @fno-deployment — Deploy builds to dev box

Deploys FnO builds on inner-loop dev boxes using the Corext pipeline.

```
@fno-deployment deploy latest build
@fno-deployment what version is deployed
```

## Typical Workflow

```
1.  @xpp-solution-analyzer analyze my solution
2.  @xpp-code-reviewer review my changes
3.  Open http://localhost:3000 → review issues → click "Accept Fix"
4.  @xpp-fix-applier apply accepted fixes
5.  @xpp-coder <implement new features or refactor code>
6.  @xpp-test-writer write tests for <class>
```

## Test Runner

```powershell
.\scripts\Run-XppTests.ps1 -TestClasses "MyTestClass"
.\scripts\Run-XppTests.ps1 -TestClasses "ClassA,ClassB"
```

- Exit code `0` = all passed, `1` = failures
- Results written to project-scoped `test-results.xml`
- First test ~15s (AOS kernel init), subsequent ~3s each

## Build System

```powershell
.\scripts\Build-XppSolution.ps1                           # All models from solution
.\scripts\Build-XppSolution.ps1 -Models "ModelName"        # Specific model
.\scripts\Build-XppSolution.ps1 -Models "ModelName" -Incremental  # Faster incremental
```

- Exit code `0` = success, `1` = errors
- Build logs written to project-scoped `build-<model>.xml`
- Full build ~60s; incremental is faster

## Claude Code Skills

Domain knowledge and automation in `.claude/skills/`, shared across all projects.

| Skill | Type | Description |
|-------|------|-------------|
| `run-tests` | Task (`/run-tests`) | Run X++ tests and report results |
| `build-solution` | Task (`/build-solution`) | Build X++ models and report errors |
| `create-pr` | Task (`/create-pr`) | Create Azure DevOps PR (requires ADO MCP) |
| `xpp-patterns` | Reference | X++ coding patterns, rules, and anti-patterns |
| `xpp-test-patterns` | Reference | X++ test writing patterns (AAA, naming, setup) |
| `xpp-solution-paths` | Reference | Solution/source path resolution and caching |
| `less-vrtt` | Reference | LESS styles and VRTT for extensible controls |

## Dashboard

A React app (Vite + React 19) that visualizes code review results for the active project.

**Features:**
- Project switcher — switch between projects from the header
- File list with aggregate stats (total issues, severity breakdown)
- Per-file detail pages with issue cards, severity/category charts
- Filter by severity and category
- Accept fixes (persisted to project-scoped `accepted-fixes.json`)
- "Applied to source" status after the fix-applier agent runs

**API endpoints:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/review` | Review data for active project |
| GET | `/api/accepted-fixes` | Accepted fixes for active project |
| POST | `/api/accept-fix` | Accept a single fix |
| PATCH | `/api/accepted-fixes/mark-applied` | Mark fixes as applied |
| DELETE | `/api/accepted-fixes/applied` | Remove applied fixes |
| DELETE | `/api/accepted-fixes` | Clear all accepted fixes |
| GET | `/api/projects` | List all projects |
| PUT | `/api/projects/active` | Switch active project |
| POST | `/api/projects` | Create a new project |
| PUT | `/api/projects/:name` | Update a project |
| DELETE | `/api/projects/:name` | Delete a project |
| PUT | `/api/source-code-path` | Update shared source code path |

## Project Structure

```
XppAgents/
├── .github/agents/              # Copilot agent definitions
│   ├── xpp-solution-analyzer.agent.md
│   ├── xpp-code-reviewer.agent.md
│   ├── xpp-coder.agent.md
│   ├── xpp-test-writer.agent.md
│   ├── xpp-fix-applier.agent.md
│   └── Fno-deployment.agent.md
├── .claude/
│   ├── CLAUDE.md                # Claude Code project instructions
│   └── skills/                  # Shared skills (all projects)
│       ├── run-tests/
│       ├── build-solution/
│       ├── create-pr/
│       ├── xpp-patterns/
│       ├── xpp-test-patterns/
│       ├── xpp-solution-paths/
│       └── less-vrtt/
├── knowledge/                   # Shared knowledge (all projects)
│   ├── project-awareness.md     # Multi-project path resolution rules
│   └── agent-memory.md          # Cross-session memory instructions
├── scripts/                     # CLI build & test tools
│   ├── Build-XppSolution.ps1
│   ├── Run-XppTests.ps1
│   ├── SysTestLauncher.exe
│   └── SysTestLauncher.cs
├── frontend/                    # React dashboard (Vite)
│   └── src/
│       ├── components/          # Header, ProjectSwitcher, StatsGrid, Charts, etc.
│       ├── pages/               # FileListPage, FileDetailPage, DiffPage
│       ├── App.jsx
│       ├── api.js
│       └── utils.js
├── server.js                    # Node.js HTTP server (API + static files)
├── package.json
├── .env.json                    # Project config & cached paths (git-ignored)
└── .tmp/                        # Generated data (git-ignored)
    └── projects/
        ├── extensibility/       # Per-project working data
        │   ├── .memory.md
        │   ├── solution-summary.md
        │   ├── code-review-result.json
        │   ├── accepted-fixes.json
        │   └── ...
        └── Excel/
            └── ...
```

## Prerequisites

The `create-pr` skill requires the **Azure DevOps MCP server**:
> **https://github.com/microsoft/azure-devops-mcp**

## Development

```bash
npm start                  # Start the server (port 3000)
npm run dev:frontend       # Vite dev server (port 5173, proxies API to 3000)
npm run build              # Rebuild frontend for production
```
