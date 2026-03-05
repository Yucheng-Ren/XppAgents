---
name: xpp-solution-paths
description: How to gather and cache D365 solution paths and source code paths for X++ agents. Covers .sln parsing, .rnrproj parsing, and source file location. Used automatically by other skills that need to locate X++ source files. Supports multi-project workspaces.
user-invocable: false
---

# Gathering Solution & Source Paths

All X++ agents need two paths before they can work. These paths are cached in `.env.json` at the workspace root to avoid asking repeatedly. The workspace supports **multiple projects** — each with its own `solutionPath` — while sharing a single `sourceCodePath`.

## Step 1: Check Cached Paths

**IMPORTANT**: The `.env.json` file is in `.gitignore`, so file search tools will NOT find it. You MUST read it directly by path — do NOT use file search or glob patterns. Use the `read` tool to open `.env.json` from the workspace root directly.

Read `.env.json` and parse its JSON. It has this structure:
```json
{
    "sourceCodePath": "C:\\AosService\\PackagesLocalDirectory",
    "activeProject": "MyProject",
    "solutionPath": "C:\\Users\\you\\source\\repos\\MyProject",
    "projects": {
        "MyProject": {
            "solutionPath": "C:\\Users\\you\\source\\repos\\MyProject",
            "description": "Main feature project"
        },
        "AnotherProject": {
            "solutionPath": "C:\\Users\\you\\source\\repos\\AnotherProject",
            "description": "Secondary project"
        }
    }
}
```

**Path resolution:**
- `sourceCodePath` — shared across all projects (same dev box), from the top-level field.
- `solutionPath` — from `projects[activeProject].solutionPath` (or the top-level `solutionPath` for backward compat).

- If **both** `sourceCodePath` and the active project's `solutionPath` are non-empty strings, use them directly — **do NOT ask the user again**. Briefly confirm: "Using project **{activeProject}**: solution at `{solutionPath}`, source at `{sourceCodePath}`."
- If **either** path is empty or the file doesn't exist, proceed to Step 2 to ask the user.
- If the user explicitly asks to **change paths**, **reset paths**, **use a different solution**, or **switch project**, proceed to Step 2 regardless of cached values.

## Step 2: Ask the User (only if needed)

1. **Project name**: A friendly name for the project (e.g., "MyFeature", "ActionPlan").
2. **Solution path**: The path to the folder containing the `.sln` solution file. This file references all `.rnrproj` projects in the solution.
3. **Source code path**: The base directory where the actual X++ source files are physically located on disk (e.g., the PackagesLocalDirectory or metadata folder). This is shared across all projects.

Prompt the user with:
> To get started, I need project details:
> 1. **Project name** — A friendly name for this project (e.g., "MyFeature").
> 2. **Solution path** — The folder containing the `.sln` solution file (e.g., `C:\Users\you\source\repos\MyProject`).
> 3. **Source code path** — The base directory where the actual X++ source files are located on disk (shared across projects).
>
> Please provide these details.

If the user provides only one path or is unclear, ask for clarification before proceeding.

## Step 3: Save Paths to Cache

After obtaining paths (from user or cache), **always** save them to `.env.json` at the workspace root. When adding a new project:
```json
{
    "sourceCodePath": "<the source code path>",
    "activeProject": "<the project name>",
    "solutionPath": "<the solution path>",
    "projects": {
        "<the project name>": {
            "solutionPath": "<the solution path>",
            "description": ""
        }
    }
}
```

When the user switches to an existing project, update `activeProject` and `solutionPath` (top-level) to match.

## Per-Project Memory & Data

Each project's working data is stored in `.tmp/projects/<projectName>/`:
- `.tmp/projects/<projectName>/.memory.md` — project-specific agent memory
- `.tmp/projects/<projectName>/code-review-result.json` — review results
- `.tmp/projects/<projectName>/accepted-fixes.json` — accepted fixes
- `.tmp/projects/<projectName>/build-<model>.xml` — build logs
- `.tmp/projects/<projectName>/test-results.xml` — test results
- `.tmp/projects/<projectName>/solution-summary.md` — solution analysis

The root `.tmp/` is used only when no active project is set (backward compat).

**Shared across projects**: skills (`.claude/skills/`), knowledge (`knowledge/`), scripts (`scripts/`).

## Parsing the Solution

### Step A: Read the .sln file

1. Find the `.sln` file in the solution path (search for `*.sln`).
2. Parse the project references. Each project line has this format:
   ```
   Project("{GUID}") = "Project Name", "relative\path\to\project.rnrproj", "{GUID}"
   ```
   For example:
   ```
   Project("{FC65038C-1B2F-41E1-A629-BED71D161FFF}") = "My Project (SYS) [My Project]", "My Project.rnrproj", "{5B076764-...}"
   Project("{FC65038C-1B2F-41E1-A629-BED71D161FFF}") = "My Project Tests (SYS) [My Project Tests]", "..\My Project Tests\My Project Tests.rnrproj", "{EAA0AC0A-...}"
   ```
3. Extract ALL `.rnrproj` paths from the project lines.
4. Resolve each path **relative to the `.sln` file's directory**. For example, if the `.sln` is at `C:\repos\My Project\My Project.sln`:
   - `"My Project.rnrproj"` → `C:\repos\My Project\My Project.rnrproj`
   - `"..\My Project Tests\My Project Tests.rnrproj"` → `C:\repos\My Project Tests\My Project Tests.rnrproj`

### Step B: Read EVERY .rnrproj file

For **each** `.rnrproj` found in the `.sln`:

1. Read the XML file and parse the `<ItemGroup>` section containing `<Content Include="...">` elements.
2. Extract classes, tables, forms, and other objects from the `Include` attribute. The format is `<ObjectType>\<ObjectName>`, for example:
   - `AxClass\MyController` → Class named `MyController`
   - `AxTable\MyDataTable` → Table named `MyDataTable`
   - `AxForm\MyFormUI` → Form named `MyFormUI`
   - `AxEnum\MyEnumType` → Enum named `MyEnumType`
   - `AxEdt\MyEdtName` → EDT named `MyEdtName`
   - Other prefixes: `AxSecurityDuty`, `AxSecurityPrivilege`, `AxMenuItemAction`, `AxLabelFile`, etc.

3. Extract the `<Model>` property from each `.rnrproj` file (e.g., `<Model>MyModel</Model>`). Different projects may have different model names.

4. **Aggregate** all objects across all projects. Keep track of which model each object belongs to (needed for file path resolution).

## Locating Source Files

Use the **source code path** + **model name** to locate actual source files:

- Classes: `<SourcePath>/<ModelName>/AxClass/<ClassName>.xml`
- Tables: `<SourcePath>/<ModelName>/AxTable/<TableName>.xml`
- Forms: `<SourcePath>/<ModelName>/AxForm/<FormName>.xml`
- Enums: `<SourcePath>/<ModelName>/AxEnum/<EnumName>.xml`
- EDTs: `<SourcePath>/<ModelName>/AxEdt/<EdtName>.xml`
- Security: `<SourcePath>/<ModelName>/AxSecurityDuty/<Name>.xml`, `AxSecurityPrivilege/<Name>.xml`
- Menu Items: `<SourcePath>/<ModelName>/AxMenuItemAction/<Name>.xml`

If the exact path is unclear, search for the file by name under the source code path.

## Dual-Path Architecture: Source vs Deploy

On D365 OneBox dev boxes, there are typically **two** directories containing X++ metadata:

| Path | Purpose | Typical Value |
|------|---------|---------------|
| **sourceCodePath** (git overlay) | Where developers edit files, version-controlled | `C:\Users\<user>\git\ApplicationSuite\Source\Metadata` |
| **PackagesLocalDirectory** (deploy dir) | Where AOS runtime and xppc.exe read metadata by default | `C:\AosService\PackagesLocalDirectory` |

These paths are configured in:
- `.env.json` → `sourceCodePath` (git overlay)
- `C:\AosService\WebRoot\web.config` → `Aos.MetadataDirectory` (points to git overlay)
- `C:\AosService\WebRoot\web.config` → `Aos.PackageDirectory` (points to PackagesLocalDirectory)

**Why this matters for new files**: When you create a new X++ class/table/form in the git source overlay, the build script and test runner (which use PackagesLocalDirectory by default) **cannot find it** until you either:
1. Copy the file to the matching path under PackagesLocalDirectory, OR
2. Override the `-metadata` flag to point to the git overlay

See the build-solution skill reference for detailed instructions on both approaches.
