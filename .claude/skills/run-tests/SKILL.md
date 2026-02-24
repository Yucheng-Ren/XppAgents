---
name: run-tests
description: Run X++ SysTest tests on the D365 OneBox dev box and report results. Use when the user asks to run tests, verify tests, or check test results.
disable-model-invocation: false
argument-hint: "[TestClassName]"
allowed-tools: Bash(powershell *), Bash(pwsh *), Read, Grep, Glob
---

Run X++ SysTest tests on the D365 OneBox dev box and report results.

## Instructions

1. Read [reference.md](reference.md) for full reference on the test runner architecture, XML format, and troubleshooting.

2. Run the test using the PowerShell script:
```powershell
& "$WORKSPACE/scripts/Run-XppTests.ps1" -TestClasses "$ARGUMENTS"
```

If `$ARGUMENTS` is empty, ask the user which test class(es) to run.

3. The script will:
   - Use `SysTestLauncher.exe` to bypass the debug-attach prompt automatically
   - Execute tests via `SysTestConsole.17.0.exe`
   - Parse XML results and print a summary

4. After the script completes, read the results:
   - Exit code 0 = all passed, exit code 1 = failures
   - If failures: read `.tmp/test-results.xml` to extract failure details (look for `<test-case ... success="false">` and their `<infolog>` children)
   - Report results clearly: total passed, failed, skipped, and list any failures with their error messages

5. If the script fails to start (missing exe, SQL errors, etc.), consult the Troubleshooting section in [reference.md](reference.md) and fix the issue before retrying.

## Important Notes
- Tests run with AutoRollback isolation — they do NOT modify the database permanently
- First test in a run takes ~15s (AOS kernel init), subsequent tests take ~3s each
- The XML results are at `.tmp/test-results.xml`
- Stdout/stderr logs are at `.tmp/systest-stdout.log` and `.tmp/systest-stderr.log`
