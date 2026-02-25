```skill
---
name: build-solution
description: Build X++ models on the D365 OneBox dev box using xppc.exe. Use when the user asks to build, compile, or check for compilation errors.
disable-model-invocation: false
argument-hint: "[ModelName or 'all']"
allowed-tools: Bash(powershell *), Bash(pwsh *), Read, Grep, Glob
---

Build X++ models on the D365 OneBox dev box and report compilation results.

## Instructions

1. Read [reference.md](reference.md) for full reference on the build architecture, xppc.exe flags, XML format, and troubleshooting.

2. Run the build using the PowerShell script:
```powershell
& "$WORKSPACE/scripts/Build-XppSolution.ps1" -Models "$ARGUMENTS"
```

If `$ARGUMENTS` is empty or "all", the script auto-discovers and builds all models from the solution.
If `$ARGUMENTS` is a specific model name (or comma-separated list), only those models are built.

3. The script will:
   - Invoke `xppc.exe` (X++ Compiler) for each model
   - Save XML build logs to `.tmp/build-<model>.xml`
   - Parse results and print a summary with error/warning counts

4. After the script completes, check the results:
   - Exit code 0 = all models built successfully, exit code 1 = build errors
   - If errors: read `.tmp/build-<model>.xml` to extract error details (look for `<Diagnostic>` elements with `<Severity>Error</Severity>`)
   - Report results clearly: per-model status, total errors, total warnings, elapsed time

5. Useful flags:
   - `-Incremental` — only compile changed elements (faster for iterative development)
   - `-ShowVerbose` — show detailed phase timing from xppc.exe
   - `-Quiet` — suppress individual error output, show only summary

## Important Notes
- xppc.exe compiles the ENTIRE model (all classes, tables, forms, queries, etc.) — not individual files
- A full model build takes ~60s for a typical custom model; incremental is faster
- The build does NOT run DB sync — only compilation and metadata validation
- Build output assemblies go to `PackagesLocalDirectory\<Model>\bin\`
- The XML build log contains errors, warnings, and informational diagnostics

```
