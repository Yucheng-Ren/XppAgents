---
name: xpp-solution-paths
description: How to gather and cache D365 solution paths and source code paths for X++ agents. Covers .sln parsing, .rnrproj parsing, and source file location. Used automatically by other skills that need to locate X++ source files.
user-invocable: false
---

# Gathering Solution & Source Paths

All X++ agents need two paths before they can work. These paths are cached in `.env.json` at the workspace root to avoid asking repeatedly.

## Step 1: Check Cached Paths

**IMPORTANT**: The `.env.json` file is in `.gitignore`, so file search tools will NOT find it. You MUST read it directly by path — do NOT use file search or glob patterns. Use the `read` tool to open `.env.json` from the workspace root directly.

Read `.env.json` and parse its JSON. It has this structure:
```json
{
    "solutionPath": "C:\\Users\\you\\source\\repos\\MyProject",
    "sourceCodePath": "C:\\AosService\\PackagesLocalDirectory"
}
```

- If **both** `solutionPath` and `sourceCodePath` are non-empty strings, use them directly — **do NOT ask the user again**. Briefly confirm: "Using saved paths: solution at `{solutionPath}`, source at `{sourceCodePath}`."
- If **either** path is empty or the file doesn't exist, proceed to Step 2 to ask the user.
- If the user explicitly asks to **change paths**, **reset paths**, or **use a different solution**, proceed to Step 2 regardless of cached values.

## Step 2: Ask the User (only if needed)

1. **Solution path**: The path to the folder containing the `.sln` solution file. This file references all `.rnrproj` projects in the solution.
2. **Source code path**: The base directory where the actual X++ source files are physically located on disk (e.g., the PackagesLocalDirectory or metadata folder).

Prompt the user with:
> To get started, I need two paths:
> 1. **Solution path** — The folder containing the `.sln` solution file (e.g., `C:\Users\you\source\repos\MyProject`).
> 2. **Source code path** — The base directory where the actual X++ source files are located on disk.
>
> Please provide both paths.

If the user provides only one path or is unclear, ask for clarification before proceeding.

## Step 3: Save Paths to Cache

After obtaining paths (from user or cache), **always** save them to `.env.json` at the workspace root:
```json
{
    "solutionPath": "<the solution path>",
    "sourceCodePath": "<the source code path>"
}
```
This ensures the next agent invocation can reuse them without asking again.

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
