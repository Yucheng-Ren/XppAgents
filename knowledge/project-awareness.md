# Project-Aware Paths

This workspace supports **multiple projects**. All `.tmp/` data is scoped per project.

## How to resolve project paths

1. Read `.env.json` at the workspace root.
2. Get the `activeProject` value (e.g., `"extensibility"`).
3. Get the project's `solutionPath` from `projects[activeProject].solutionPath`.
4. Use `.tmp/projects/<activeProject>/` as the **data directory** for ALL file paths.

## `.env.json` structure

```json
{
    "sourceCodePath": "C:\\...\\Metadata",
    "activeProject": "extensibility",
    "solutionPath": "C:\\...\\SCM Copilot",
    "projects": {
        "extensibility": {
            "solutionPath": "C:\\...\\SCM Copilot",
            "description": "SCM Copilot extensibility project"
        }
    }
}
```

- `sourceCodePath` — shared across all projects (X++ metadata root)
- `activeProject` — which project is currently active
- `solutionPath` — top-level field mirrors the active project's solution path (backward compat)
- `projects` — map of project name → `{ solutionPath, description }`

## Discovering solution content

After resolving paths, agents should understand what the project contains:

1. **Find the `.sln` file** in the project's `solutionPath` directory.
2. **Parse project references** from the `.sln`. Each line has the format:
   ```
   Project("{GUID}") = "Name", "relative\path\to\project.rnrproj", "{GUID}"
   ```
   Resolve each `.rnrproj` path relative to the `.sln` directory.
3. **Read each `.rnrproj`** and extract:
   - `<Model>` — the model name (e.g., `SCMCopilot`)
   - `<Content Include="...">` entries — the objects in the project, formatted as `<ObjectType>\<ObjectName>`:
     - `AxClass\MyController` → Class
     - `AxTable\MyDataTable` → Table
     - `AxForm\MyFormUI` → Form
     - `AxEnum\MyEnumType`, `AxEdt\MyEdtName`, `AxSecurityDuty\...`, etc.
4. **Locate source files** using: `<sourceCodePath>/<ModelName>/<ObjectType>/<ObjectName>.xml`
   - Example: `C:\...\Metadata\SCMCopilot\AxClass\MyController.xml`

This gives agents a complete inventory of classes, tables, forms, enums, etc. in the active project before they start working.

For full parsing details, see `.claude/skills/xpp-solution-paths/SKILL.md`.

## Project-scoped file locations

If `activeProject` is `"extensibility"`, then:

| File | Path |
|------|------|
| Memory | `.tmp/projects/extensibility/.memory.md` |
| Solution summary | `.tmp/projects/extensibility/solution-summary.md` |
| Code review result | `.tmp/projects/extensibility/code-review-result.json` |
| Accepted fixes | `.tmp/projects/extensibility/accepted-fixes.json` |
| Build logs | `.tmp/projects/extensibility/build-<model>.xml` |
| Build stderr | `.tmp/projects/extensibility/build-<model>-stderr.log` |
| Test results | `.tmp/projects/extensibility/test-results.xml` |
| Test stdout/stderr | `.tmp/projects/extensibility/systest-stdout.log` / `systest-stderr.log` |
| Diff cache | `.tmp/projects/extensibility/diff-cache.json` |

## Rule

**Every** `.tmp/` path mentioned in agent instructions refers to the project-scoped directory (`.tmp/projects/<activeProject>/`), never the bare `.tmp/` root.

When an agent says "read `solution-summary.md`" or "save `code-review-result.json`", it always means the project-scoped path.
