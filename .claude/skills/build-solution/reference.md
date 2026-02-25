# X++ Build Reference

## Architecture

The build system uses `xppc.exe` (X++ Compiler v7.0.7864.0) located at `C:\AosService\PackagesLocalDirectory\bin\xppc.exe`.

### Why xppc.exe instead of MSBuild?

The D365 `.rnrproj` projects use MSBuild with custom build tasks (`Microsoft.Dynamics.Framework.Tools.BuildTasks.17.0.dll`). However, those tasks depend on `Microsoft.VisualStudio.Shell.15.0` and other VS assemblies, making standalone MSBuild builds fail. `xppc.exe` is the underlying compiler that those build tasks wrap — it works standalone with no VS dependencies.

### Build Pipeline Phases

xppc.exe follows this compilation pipeline:
1. Calculate metadata hash
2. Generate ASTs (Enums, Tables, Classes, Queries, Forms)
3. Form Observability Mutator
4. Load Assemblies
5. Run pipeline
6. Generate types (Form, Query, Table, Class)
7. Set base types and interfaces
8. Metadata Write-Back and Extends Lists
9. Constant folding
10. Pass 1 (type checking)
11. Pass 2 (Methods)
12. Netmodules generated
13. Pass 3 (Emit event delegate subscriptions, extension classes, type forwarders)
14. Pass 4
15. Save assembly
16. Metadata validation (models, classes, tables, forms, views, security, etc.)
17. Write Runtime Metadata
18. SC Compilation completed

A full build of a typical custom model takes ~60 seconds.

## xppc.exe Command Line

### Required Arguments
| Flag | Description |
|------|-------------|
| `-metadata=<path>` | Path to metadata root (PackagesLocalDirectory) |
| `-compilermetadata=<path>` | Path to compiler metadata (same as metadata) |
| `-modelmodule=<name>` | Model/module name to compile (e.g., MyModel) |
| `-output=<path>` | Assembly output directory |
| `-referenceFolder=<path>` | Referenced assemblies directory |

### Optional Arguments
| Flag | Description |
|------|-------------|
| `-xmllog=<path>` | Write diagnostics to XML file |
| `-log=<path>` | Write diagnostics to text file |
| `-verbose` | Show detailed phase timing |
| `-incremental` | Only compile changed elements |
| `-classes=C1,C2,...` | Compile specific classes only |
| `-tables=T1,T2,...` | Compile specific tables only |
| `-forms=F1,F2,...` | Compile specific forms only |

### Exit Codes
| Code | Meaning |
|------|---------|
| 0 | Build succeeded (may have warnings) |
| -1 | Build failed (errors or invalid arguments) |

## XML Build Log Format

The XML log at `-xmllog=<path>` has this structure:

```xml
<?xml version="1.0" encoding="utf-8"?>
<Diagnostics GenerationTime="2026-02-25T10:06:06.0335644+01:00">
  <Items>
    <Diagnostic>
      <DiagnosticType>BestPractice</DiagnosticType>
      <Severity>Error|Warning|Informational</Severity>
      <Path>dynamics://Class/MyClass/Method/myMethod</Path>
      <ElementType>Class Method</ElementType>
      <Moniker>RuleName</Moniker>
      <Line>42</Line>
      <Column>8</Column>
      <EndLine>42</EndLine>
      <EndColumn>50</EndColumn>
      <Message>Description of the issue</Message>
    </Diagnostic>
    ...
  </Items>
</Diagnostics>
```

### Key Fields
- **Severity**: `Error` (build failure), `Warning` (potential issue), `Informational` (FYI)
- **DiagnosticType**: `BestPractice`, `TaskListItem`, `Generation`, `Compilation`
- **Path**: Dynamics path like `dynamics://Class/ClassName/Method/methodName`
- **Line/Column**: Source location of the issue

## Model Discovery

Models are auto-discovered from `.rnrproj` project files in the solution directory:

1. The script reads the `.sln` file to find all `.rnrproj` project references
2. Each `.rnrproj` contains a `<Model>` XML tag with the model name
3. The model name maps to a subfolder under `PackagesLocalDirectory` (e.g., `<Model>MyModel</Model>` → `PackagesLocalDirectory\MyModel\`)

The default behavior (`-Models "all"`) discovers and builds all models from the solution. To build specific models, pass their names explicitly.

> **Note**: The project name in the `.sln` (e.g., "My Project") may differ from the model name in the `.rnrproj` (e.g., "MyModel"). Always use the `<Model>` value, not the project display name.

## Build Script Usage

```powershell
# Default: auto-discover and build all models from the solution
.\scripts\Build-XppSolution.ps1

# Build a specific model
.\scripts\Build-XppSolution.ps1 -Models "MyModel"

# Build multiple specific models
.\scripts\Build-XppSolution.ps1 -Models "MyModel,MyModelTests"

# Incremental build (faster — only changed elements)
.\scripts\Build-XppSolution.ps1 -Models "MyModel" -Incremental

# Verbose output with phase timing
.\scripts\Build-XppSolution.ps1 -Models "MyModel" -ShowVerbose

# Quiet mode — summary only
.\scripts\Build-XppSolution.ps1 -Quiet
```

## Troubleshooting

### "Could not find PackagesLocalDirectory"
The script auto-detects common paths (C:\, K:\, J:\AosService\PackagesLocalDirectory). If your dev box uses a different drive, pass `-PackagesDir`:
```powershell
.\scripts\Build-XppSolution.ps1 -PackagesDir "D:\AosService\PackagesLocalDirectory"
```

### "xppc.exe not found"
Ensure `xppc.exe` exists at `PackagesLocalDirectory\bin\xppc.exe`. This should always be present on a D365 OneBox.

### Build succeeds but no assembly output
Check that the output directory `PackagesLocalDirectory\<Model>\bin\` exists and is writable.

### Warnings vs Errors
- **Warnings** do not cause build failure (exit code 0) — they are informational
- **Errors** cause build failure (exit code -1) and must be fixed
- The XML log contains all diagnostics with their severity

### Build after code changes
After modifying X++ source files, run a build to verify the changes compile. The full build always recompiles everything. Use `-Incremental` for faster iterative builds.
