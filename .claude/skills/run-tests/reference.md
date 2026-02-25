# Running X++ Tests from the Terminal

This skill describes how to execute X++ SysTest tests from the command line on a D365 Finance & Operations OneBox dev box. Use this when you need to run, verify, or validate X++ test classes without opening Visual Studio.

---

## Quick Start

```powershell
# Run a single test class
.\scripts\Run-XppTests.ps1 -TestClasses "MyTestClass"

# Run multiple test classes
.\scripts\Run-XppTests.ps1 -TestClasses "ClassA,ClassB"

# Quiet mode (summary only, no per-test output)
.\scripts\Run-XppTests.ps1 -TestClasses "MyTestClass" -Quiet

# Custom timeout (default is 20 minutes)
.\scripts\Run-XppTests.ps1 -TestClasses "MyTestClass" -TimeoutMinutes 30
```

Exit code `0` = all tests passed. Exit code `1` = one or more tests failed. Parse the XML or console output for details.

---

## Architecture

```
Run-XppTests.ps1                     PowerShell orchestrator
  └─► scripts/SysTestLauncher.exe    C# wrapper (bypasses ReadKey prompt)
        └─► SysTestConsole.17.0.exe  D365 built-in CLI test runner
              └─► AxDB SQL Server    Test execution with AutoRollback isolation
```

### Components

| File | Purpose |
|------|---------|
| `scripts/Run-XppTests.ps1` | Entry point. Locates tools, runs launcher, parses XML results, prints summary. |
| `scripts/SysTestLauncher.exe` | Compiled C# wrapper. Starts SysTestConsole as a child process sharing the parent console, injects Enter keystrokes via Win32 `WriteConsoleInput` to bypass the debug-attach prompt. |
| `scripts/SysTestLauncher.cs` | Source for the launcher. Rebuild with: `& "C:\Program Files\Microsoft Visual Studio\18\Enterprise\MSBuild\Current\Bin\Roslyn\csc.exe" /out:scripts\SysTestLauncher.exe /target:exe /platform:x64 scripts\SysTestLauncher.cs` |

### Output Files

All output goes to `.tmp/` in the workspace root:

| File | Content |
|------|---------|
| `.tmp/test-results.xml` | SysTestListenerXML format — structured test results |
| `.tmp/systest-stdout.log` | Raw stdout from SysTestConsole |
| `.tmp/systest-stderr.log` | Raw stderr from SysTestConsole |

---

## SysTestConsole.17.0.exe Reference

Located at: `C:\AosService\PackagesLocalDirectory\bin\SysTestConsole.17.0.exe`

### Command-Line Flags

| Flag | Description |
|------|-------------|
| `/test:<ClassName>` | Test class(es) to run. Comma-separated for multiple. |
| `/xml:<path>` | Write XML results to this file. |
| `/traceFile:<path>` | Write trace log to this file. |
| `/parallel` | Run test suites in parallel. |
| `/devfabric` | Use local Service Fabric endpoint (not needed on OneBox). |
| `/unattended` | Unattended mode (does NOT bypass the ReadKey prompt — use SysTestLauncher instead). |

### XML Result Format (SysTestListenerXML)

```xml
<test-results date="..." time="..." success="true|false">
  <test-suite name="Rainier Test Suite" time="ms" success="true|false">
    <results>
      <test-suite name="TestClassName" time="ms" success="true|false">
        <results>
          <test-case name="TestClassName.testMethodName"
                     success="true|false"
                     time="ms"
                     skipped="true|false"
                     starttime="ISO8601"
                     endtime="ISO8601">
            <!-- Optional: present on warnings/errors -->
            <infolog>
              <warning>Warning message</warning>
              <error>Error message</error>
            </infolog>
          </test-case>
        </results>
      </test-suite>
    </results>
  </test-suite>
</test-results>
```

### Parsing XML in PowerShell

```powershell
[xml]$xml = Get-Content ".tmp/test-results.xml"

# Get all class-level suites
$classSuites = $xml.SelectNodes("//test-suite[results/test-case]")

foreach ($suite in $classSuites) {
    foreach ($tc in $suite.SelectNodes("results/test-case")) {
        $name = $tc.name           # "ClassName.methodName"
        $ok   = $tc.success -eq "true"
        $ms   = [int]$tc.time     # execution time in ms
        $skip = $tc.skipped -eq "true"
    }
}
```

---

## Prerequisites & Setup

These are one-time setup steps. If tests already work, skip this section.

### 1. SQL Authentication

`SysTestConsole.17.0.exe.config` must have valid SQL credentials. The shipped defaults (`AOSUser` / `$CREDENTIAL_PLACEHOLDER$`) do not work.

**Check current config:**
```powershell
[xml]$cfg = Get-Content "C:\AosService\PackagesLocalDirectory\bin\SysTestConsole.17.0.exe.config"
$ns = @{ a = "urn:schemas-microsoft-com:asm.v1" }
$settings = $cfg.SelectNodes("//appSettings/add")
$settings | Where-Object { $_.key -like "DataAccess.*" } | 
    ForEach-Object { Write-Host "$($_.key) = $($_.value)" }
```

**If login fails**, reset the SQL password to a known value:
```powershell
# Use integrated auth (works for local admin on OneBox)
$conn = New-Object System.Data.SqlClient.SqlConnection("Server=localhost;Database=master;Integrated Security=True")
$conn.Open()
$cmd = $conn.CreateCommand()
$cmd.CommandText = "ALTER LOGIN [axdbadmin] WITH PASSWORD='<YourNewPassword>', CHECK_POLICY=OFF, CHECK_EXPIRATION=OFF"
$cmd.ExecuteNonQuery() | Out-Null
$conn.Close()
```

Then update the config:
```powershell
$cfgPath = "C:\AosService\PackagesLocalDirectory\bin\SysTestConsole.17.0.exe.config"
[xml]$cfg = Get-Content $cfgPath
$settings = $cfg.SelectNodes("//appSettings/add")
($settings | Where-Object { $_.key -eq "DataAccess.SqlUser" }).value = "axdbadmin"
($settings | Where-Object { $_.key -eq "DataAccess.SqlPwd" }).value = "<YourNewPassword>"
$cfg.Save($cfgPath)
```

**Important**: Changing the `axdbadmin` SQL password **WILL break AOS login** unless you also update `web.config`. After changing the SQL password, you MUST:

```powershell
# 1. Backup web.config
Copy-Item "C:\AosService\WebRoot\web.config" "C:\AosService\WebRoot\web.config.bak" -Force

# 2. Set plaintext password in web.config
[xml]$wc = Get-Content "C:\AosService\WebRoot\web.config"
$adds = $wc.configuration.appSettings.add
($adds | Where-Object { $_.key -eq 'DataAccess.SqlPwd' }).value = '<YourNewPassword>'
($adds | Where-Object { $_.key -eq 'DataAccess.AxAdminSqlPwd' }).value = '<YourNewPassword>'
$wc.Save("C:\AosService\WebRoot\web.config")

# 3. Re-encrypt (elevated) + iisreset
#    Save this as a .ps1, then: Start-Process powershell -ArgumentList "-File script.ps1" -Verb RunAs -Wait
& "C:\AosService\WebRoot\bin\Microsoft.Dynamics.AX.Framework.ConfigEncryptor.exe" -encrypt "C:\AosService\WebRoot\web.config"
iisreset
```

### 2. Missing DLLs

If you see `System.ValueTuple` or similar missing assembly errors:
```powershell
Copy-Item "C:\AosService\WebRoot\bin\System.ValueTuple.dll" "C:\AosService\PackagesLocalDirectory\bin\" -Force
```

### 3. Recompiling SysTestLauncher.exe

If the launcher needs changes or is missing:
```powershell
& "C:\Program Files\Microsoft Visual Studio\18\Enterprise\MSBuild\Current\Bin\Roslyn\csc.exe" `
    /out:scripts\SysTestLauncher.exe `
    /target:exe `
    /platform:x64 `
    scripts\SysTestLauncher.cs
```

Alternative csc.exe locations:
- `C:\Program Files\Microsoft Visual Studio\2022\Enterprise\MSBuild\Current\Bin\Roslyn\csc.exe`
- `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe` (older, avoid if possible)

---

## Troubleshooting

### "Cannot read keys when console input has been redirected"
You're running SysTestConsole directly with piped/redirected stdin. Use `SysTestLauncher.exe` instead — it shares the parent console and injects keystrokes via `WriteConsoleInput`.

### "Login failed for user 'AOSUser'"
The config has placeholder credentials. Follow the SQL Authentication setup above.

### "Login failed for user 'axdbadmin'" + account locked
Failed password attempts trigger SQL policy lockout. Fix with integrated auth:
```powershell
$conn = New-Object System.Data.SqlClient.SqlConnection("Server=localhost;Database=master;Integrated Security=True")
$conn.Open()
$cmd = $conn.CreateCommand()
$cmd.CommandText = "ALTER LOGIN [axdbadmin] WITH PASSWORD='<NewPassword>', CHECK_POLICY=OFF, CHECK_EXPIRATION=OFF"
$cmd.ExecuteNonQuery() | Out-Null
$conn.Close()
```
Setting `CHECK_POLICY=OFF` also unlocks the account.

### Tests take ~3 seconds each
This is normal. Each test method runs with `AutoRollback` isolation which incurs DB transaction overhead. A suite of 22 tests takes ~70-80 seconds of execution plus ~50 seconds of AOS kernel initialization = ~120 seconds total.

### Process hangs at "Press any key"
SysTestLauncher should handle this. If it doesn't, the key injector may not have a valid console handle. Ensure you're running from a real terminal (not piped). Check `.tmp/systest-stderr.log` for `[KeyInjector] No valid console input handle`.

### No XML output file created
SysTestConsole only writes the XML after all tests complete. If it crashes mid-run, no XML is produced. Check `.tmp/systest-stdout.log` for error messages.

---

## Approaches That Do NOT Work

These were tried and failed — do not re-attempt:

| Approach | Why it fails |
|----------|-------------|
| `echo. \| SysTestConsole.exe` | Redirects stdin, causing `Console.ReadKey()` to throw "Cannot read keys" |
| `WScript.Shell.SendKeys()` | Cannot activate console-app windows reliably from automated contexts |
| `Start-Process -RedirectStandardInput` | Same stdin redirection problem as pipe |
| `PostMessage WM_KEYDOWN` | Console windows don't process WM_KEYDOWN for ReadKey |
| `FreeConsole/AttachConsole` | Detaching the parent console breaks both processes |
| `vstest.console.exe` with X++ test adapter | Cannot discover X++ tests — the adapter needs AOS kernel context |
| REST API `/api/services/SysTestServices` | Returns 401 — requires complex auth setup |
