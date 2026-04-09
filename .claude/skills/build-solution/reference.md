# X++ Build Reference

## Architecture

The build system uses two tools from `C:\AosService\PackagesLocalDirectory\bin\`:

1. **`xppc.exe`** (X++ Compiler v7.0.7864.0) — Compiles X++ source code into assemblies
2. **`xppbp.exe`** (X++ Best Practice Checker) — Runs Best Practice analysis on compiled models

### Why xppc.exe + xppbp.exe instead of MSBuild?

The D365 `.rnrproj` projects use MSBuild with custom build tasks (`Microsoft.Dynamics.Framework.Tools.BuildTasks.17.0.dll`). However, those tasks depend on `Microsoft.VisualStudio.Shell.15.0` and other VS assemblies, making standalone MSBuild builds fail. `xppc.exe` is the underlying compiler and `xppbp.exe` is the Best Practice checker that those build tasks wrap — both work standalone with no VS dependencies.

### Automatic Dependency Ordering

When multiple models are built, the script reads each model's `ModuleReferences` from its Descriptor XML (`PackagesLocalDirectory\<Module>\Descriptor\*.xml`) and performs a topological sort (Kahn's algorithm) so that dependencies compile before dependents. This prevents stale cross-reference errors (e.g., `classStr()` can't find a class, `FormAdaptorTypeProvider` methods missing) that occur when a dependent model is compiled before its dependency's XppMetadata is up-to-date.

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

## xppbp.exe Command Line (Best Practice Checker)

### Required Arguments
| Flag | Description |
|------|-------------|
| `-metadata=<path>` | Path to metadata root (PackagesLocalDirectory) |
| `-module=<name>` | Module name (matches folder under PackagesLocalDirectory) |
| `-model=<name>` | Model name within the module (from Descriptor XML `<Name>`) |

### Optional Arguments
| Flag | Description |
|------|-------------|
| `-packagesRoot=<path>` | Path to packages root with binaries (default: same as metadata) |
| `-compilerMetadata=<path>` | Path to compiler metadata |
| `-all` | Check all element types (required if `-rules` not specified) |
| `-rules=Rule1;Rule2` | Run only specific rules |
| `-xmlLog=<path>` | Write diagnostics to XML file (same format as xppc.exe output) |
| `-log=<path>` | Write diagnostics to text file |
| `-runfixers` | After verification, auto-fix identified issues |
| `-TreatWarningsAsErrors="M1,M2"` | Promote specific warning monikers to errors |

### Model vs Module
- **Module**: The folder name under PackagesLocalDirectory (e.g., `SCMCopilot`)
- **Model**: The model name from the Descriptor XML at `PackagesLocalDirectory\<Module>\Descriptor\*.xml` (the `<Name>` element)
- These are often the same but can differ. The build script resolves this automatically.

### BP Diagnostic Types
Common BP monikers include:
- `BPErrorUnknownLabel` — References a label that doesn't exist
- Various naming, pattern, and coding standard rules

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
- **Severity**: `Fatal` (critical failure), `Error` (build failure), `Warning` (potential issue), `Informational` (FYI)
- **DiagnosticType**: `Compile`, `Metadata`, `FormPatternValidation`, `BestPractice`, `TaskListItem`, `Generation`
- **Path**: Dynamics path like `dynamics://Class/ClassName/Method/methodName`
- **Line/Column**: Source location of the issue

> **Note**: Both `Fatal` and `Error` severity diagnostics count as errors and cause build failure. The xppbp.exe BP log uses the same XML format.

## Model Discovery

Models are auto-discovered from `.rnrproj` project files in the solution directory:

1. The script reads the `.sln` file to find all `.rnrproj` project references
2. Each `.rnrproj` contains a `<Model>` XML tag with the model name
3. The model name maps to a subfolder under `PackagesLocalDirectory` (e.g., `<Model>MyModel</Model>` → `PackagesLocalDirectory\MyModel\`)

The default behavior (`-Models "all"`) discovers and builds all models from the solution. To build specific models, pass their names explicitly.

> **Note**: The project name in the `.sln` (e.g., "My Project") may differ from the model name in the `.rnrproj` (e.g., "MyModel"). Always use the `<Model>` value, not the project display name.

## Build Script Usage

```powershell
# Default: auto-discover and build all models from the solution (with BP checks)
.\scripts\Build-XppSolution.ps1

# Build a specific model
.\scripts\Build-XppSolution.ps1 -Models "MyModel"

# Build multiple specific models
.\scripts\Build-XppSolution.ps1 -Models "MyModel,MyModelTests"

# Incremental build (faster — only changed elements)
.\scripts\Build-XppSolution.ps1 -Models "MyModel" -Incremental

# Skip Best Practice checks (compile only)
.\scripts\Build-XppSolution.ps1 -Models "MyModel" -SkipBP

# Verbose output with phase timing
.\scripts\Build-XppSolution.ps1 -Models "MyModel" -ShowVerbose

# Quiet mode — summary only
.\scripts\Build-XppSolution.ps1 -Quiet
```

### Output Files
| File | Description |
|------|-------------|
| `.tmp/build-<model>.xml` | Compilation diagnostics (xppc.exe) |
| `.tmp/bp-<model>.xml` | Best Practice diagnostics (xppbp.exe) |
| `.tmp/build-<model>-stdout.log` | Compiler stdout |
| `.tmp/build-<model>-stderr.log` | Compiler stderr |
| `.tmp/bp-<model>-stdout.log` | BP checker stdout |
| `.tmp/bp-<model>-stderr.log` | BP checker stderr |

## Git Overlay vs PackagesLocalDirectory (Dual-Path Architecture)

On D365 OneBox dev boxes, X++ source files may live in **two locations**:

1. **PackagesLocalDirectory** (`C:\AosService\PackagesLocalDirectory\<Model>\`) — the deployment directory where the AOS runtime reads metadata and where xppc.exe looks by default (via `-metadata=$PackagesDir`).
2. **Git overlay** (e.g., `C:\Users\<user>\git\ApplicationSuite\Source\Metadata\<Model>\`) — the version-controlled source directory referenced by `web.config`'s `Aos.MetadataDirectory` setting. This is where developers edit files.

### When New Files Are Only in the Git Overlay

The build script passes `-metadata=$PackagesDir` by default. If you create a **new** X++ class (or table, form, etc.) in the git overlay, xppc.exe **will not find it** unless you do one of the following:

**Option A (Recommended): Copy files to PackagesLocalDirectory**

Before building, copy new XML files from the git overlay to the matching path under PackagesLocalDirectory:

```powershell
$src = "C:\Users\<user>\git\ApplicationSuite\Source\Metadata\<Model>\<Model>\AxClass\MyNewClass.xml"
$dst = "C:\AosService\PackagesLocalDirectory\<Model>\<Model>\AxClass\MyNewClass.xml"
Copy-Item $src $dst -Force
```

Then build normally:
```powershell
.\scripts\Build-XppSolution.ps1 -Models "<Model>"
```

**Option B: Override the metadata path**

Pass the git overlay as `-metadata` and PackagesLocalDirectory as `-compilermetadata` and `-referenceFolder`:

```powershell
$gitOverlay = "C:\Users\<user>\git\ApplicationSuite\Source\Metadata"
$packagesDir = "C:\AosService\PackagesLocalDirectory"

& "$packagesDir\bin\xppc.exe" `
    "-metadata=$gitOverlay" `
    "-compilermetadata=$packagesDir" `
    "-modelmodule=<Model>" `
    "-output=$packagesDir\<Model>\bin" `
    "-referenceFolder=$packagesDir" `
    "-xmllog=.tmp\build-<Model>.xml"
```

This tells xppc to read source metadata from the git overlay but resolve cross-references and dependencies from PackagesLocalDirectory.

### How to Know Which Path Has Your Files

Check `.env.json` in the workspace root:
```json
{
    "solutionPath": "C:\\Users\\<user>\\source\\repos\\MyProject",
    "sourceCodePath": "C:\\Users\\<user>\\git\\ApplicationSuite\\Source\\Metadata"
}
```

- `sourceCodePath` = where source XML files are edited (git overlay)
- PackagesLocalDirectory = where the runtime and compiler look by default

If `sourceCodePath` differs from PackagesLocalDirectory, new files must be synced.

### Post-Build Metadata Sync (Automatic)

When `sourceCodePath` differs from `PackagesLocalDirectory`, the build script **automatically syncs** three folders from the source tree to PackagesLocalDirectory after each model's compilation:

| Folder | Purpose |
|--------|---------|
| `bin/` | Compiled DLLs, netmodules, exports, cross-references |
| `<Model>/` | Main metadata (AxForm, AxClass, AxTable, etc.) — needed for `formControlStr()` resolution |
| `XppMetadata/` | Compiler-friendly metadata — needed for `FormAdaptorTypeProvider` and TypeProvider resolution |

This sync is critical for **multi-model builds** where a downstream module (e.g., `MyModelTests`) depends on an upstream module (e.g., `MyModel`). Without syncing, the downstream compiler reads stale metadata from PackagesLocalDirectory and fails with errors like:

- `Form control 'ControlName' is not found in 'FormName'` — `formControlStr()` can't resolve controls from stale main metadata
- `The provided type 'FormAdaptor@[PurchCopilotGenUI]' does not have a method 'ControlName()'` — TypeProvider generates typed accessors from XppMetadata, which is stale
- `The provided type 'FormAdaptor@[FormName]' does not have a method 'genUI.MethodName()'` — same: XppMetadata is missing controls/methods

**Note:** XppMetadata is a **subset** of the main metadata — it strips code-behind (`<Source>` CDATA blocks) and keeps only declarative metadata. When new form controls are added to the main metadata XML, XppMetadata must be regenerated (normally done by Visual Studio/MSBuild, not xppc.exe). The sync ensures the latest XppMetadata from the source tree is available in PackagesLocalDirectory.

If the sync step is missing or fails, manually copy the full model folder:
```powershell
robocopy "$MetadataDir\MyModel" "$PackagesDir\MyModel" /MIR /NJH /NJS /NFL /NDL /NP
```

---

## Deploying New Files Checklist

When creating new X++ objects (classes, tables, etc.) in the git overlay:

1. **Create the XML file** in `<sourceCodePath>/<Model>/<Model>/AxClass/<ClassName>.xml` (or AxTable, AxForm, etc.)
2. **Add to `.rnrproj`** — add `<Content Include="AxClass\<ClassName>" />` in alphabetical order within the `<ItemGroup>`
3. **Copy to PackagesLocalDirectory** — copy the XML to `<PackagesDir>/<Model>/<Model>/AxClass/<ClassName>.xml`
4. **Build** — run the build script
5. **Verify** — check `.tmp/build-<Model>.xml` for errors

---

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

### New class not found by xppc (classStr/tableStr errors)
The file likely only exists in the git overlay but not in PackagesLocalDirectory. Copy the XML file to the matching path under PackagesLocalDirectory and rebuild. See "Git Overlay vs PackagesLocalDirectory" section above.

### Test module build fails but main module build succeeds
The most common cause is **stale metadata in PackagesLocalDirectory**. When the main module's form or class metadata changes, the test module's `formControlStr()` and `FormAdaptorTypeProvider` resolve against stale XppMetadata/main metadata in PackagesLocalDirectory. The fix:
1. Build the main module first (the build script auto-sorts by dependency order)
2. The post-build sync step copies updated metadata to PackagesLocalDirectory
3. Then the test module can compile successfully

If building modules individually, ensure the main module is built (and synced) before building the test module.

### Warnings vs Errors
- **Fatal/Error** severity diagnostics cause build failure (exit code 1) and must be fixed
- **Warnings** do not cause build failure (exit code 0) — they are informational
- BP errors also cause build failure; BP warnings do not
- The XML logs contain all diagnostics with their severity

### Build after code changes
After modifying X++ source files, run a build to verify the changes compile and pass BP checks. The full build always recompiles everything. Use `-Incremental -SkipBP` for fastest iterative builds.
