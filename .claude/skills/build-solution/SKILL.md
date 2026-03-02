```skill
---
name: build-solution
description: Build X++ models on the D365 OneBox dev box using xppc.exe and run Best Practice checks via xppbp.exe. Use when the user asks to build, compile, or check for compilation/BP errors.
disable-model-invocation: false
argument-hint: "[ModelName or 'all']"
allowed-tools: Bash(powershell *), Bash(pwsh *), Read, Grep, Glob
---

Build X++ models on the D365 OneBox dev box and report compilation + Best Practice results.

## Instructions

1. Read [reference.md](reference.md) for full reference on the build architecture, xppc.exe/xppbp.exe flags, XML format, and troubleshooting.

2. Run the build using the PowerShell script:
```powershell
& "$WORKSPACE/scripts/Build-XppSolution.ps1" -Models "$ARGUMENTS"
```

If `$ARGUMENTS` is empty or "all", the script auto-discovers and builds all models from the solution.
If `$ARGUMENTS` is a specific model name (or comma-separated list), only those models are built.

3. The script will:
   - **Sort models by dependency order** (reads `ModuleReferences` from each model's Descriptor XML and topologically sorts so dependencies build first)
   - Invoke `xppc.exe` (X++ Compiler) for each model in dependency order
   - Run `xppbp.exe` (Best Practice checker) after compilation
   - Save XML logs to `.tmp/build-<model>.xml` and `.tmp/bp-<model>.xml`
   - Parse results and print a summary with error/warning/BP counts

4. After the script completes, check the results:
   - Exit code 0 = all models built successfully, exit code 1 = build or BP errors
   - If errors: read `.tmp/build-<model>.xml` for compile errors (`<Severity>Error</Severity>` or `<Severity>Fatal</Severity>`)
   - If BP issues: read `.tmp/bp-<model>.xml` for Best Practice violations
   - Report results clearly: per-model status, total errors, total warnings, BP errors/warnings, elapsed time

5. Useful flags:
   - `-Incremental` — only compile changed elements (faster for iterative development)
   - `-ShowVerbose` — show detailed phase timing from xppc.exe
   - `-SkipBP` — skip Best Practice checks (compile only)
   - `-Quiet` — suppress individual error output, show only summary

## Important Notes
- xppc.exe compiles the ENTIRE model (all classes, tables, forms, queries, etc.) — not individual files
- xppbp.exe runs Best Practice checks on the compiled model (labels, naming, patterns, etc.)
- Both Error and Fatal severity diagnostics are counted as errors
- A full model build + BP takes ~35-60s for a typical custom model; incremental + SkipBP is fastest
- The build does NOT run DB sync — only compilation, metadata validation, and BP analysis
- Build output assemblies go to `PackagesLocalDirectory\<Model>\bin\`
- The XML build/BP logs contain errors, warnings, and informational diagnostics
- **Models are automatically sorted by dependency order** — you can pass them in any order (e.g., `Tests,Main`) and the script will reorder them correctly

```
