# Lessons Learned

## X++ Test Runner (2026-02-24)

### SysTestConsole.17.0.exe quirks
- **ReadKey blocker**: `WaitForDebugger()` calls `Console.ReadKey()` which crashes when stdin is redirected ("Cannot read keys when either application does not have a console or when console input has been redirected from a file"). Fix: share the parent console (`CreateNoWindow=false`, `UseShellExecute=false`) and inject Enter keystrokes via Win32 `WriteConsoleInput` on the shared `STD_INPUT_HANDLE`.
- **WScript.Shell SendKeys does NOT work** for non-GUI console apps in automated/headless scenarios — the window may not be activatable.
- **cmd pipe (`echo. |`) does NOT work** because it redirects stdin, which causes ReadKey to crash.

### SQL Authentication
- `SysTestConsole.17.0.exe.config` ships with `AOSUser` / `$CREDENTIAL_PLACEHOLDER$` — these are dummy values that don't work.
- AOS uses `axdbadmin` with an encrypted password in `web.config`. The encrypted password is too long (808 chars) to use as a literal SQL password.
- **Solution**: Reset the SQL login password to a known plaintext value via `ALTER LOGIN [axdbadmin] WITH PASSWORD='...', CHECK_POLICY=OFF`.
- **Gotcha**: Failed password attempts can lock the SQL login (`IsLocked=1`). Must set `CHECK_POLICY=OFF` to unlock.

### Missing DLLs
- `System.ValueTuple.dll` may be missing from `PackagesLocalDirectory\bin\` but present in `WebRoot\bin\`. Copy it over.

### AOS web.config Password Sync
- **CRITICAL**: If you change the `axdbadmin` SQL password, you MUST also update `C:\AosService\WebRoot\web.config` (`DataAccess.SqlPwd` AND `DataAccess.AxAdminSqlPwd`), then re-encrypt and restart IIS. Otherwise AOS login breaks ("You are not authorized to login with your current credentials").
- **Procedure**: (1) Set plaintext password in web.config XML, (2) Run `ConfigEncryptor.exe -encrypt web.config` elevated, (3) Run `iisreset` elevated.
- `ConfigEncryptor.exe` is at `C:\AosService\WebRoot\bin\Microsoft.Dynamics.AX.Framework.ConfigEncryptor.exe`.
- The `-decrypt` command may fail with "EncryptionAlgorithmType: 0 was not found" on older encrypted values — use `-encrypt` with new plaintext values instead.
- Both encrypt and iisreset require elevation (Run as Administrator).

### Key Pattern
When facing a "wall" (multiple failed approaches), STOP and re-analyze the root cause. The `Console.ReadKey()` problem was ultimately solved by understanding that `WriteConsoleInput` works on shared console handles, not by trying to avoid the prompt.

## New Test Class Deployment (2026-02-26)

### Test runner finds 0 tests for a new class
- **Root cause**: The XML class file exists in the git overlay but NOT in PackagesLocalDirectory. The build script uses `-metadata=$PackagesDir` by default, so xppc compiles from PackagesLocalDirectory. If the file is missing there, the class isn't compiled into the assembly, and the test runner can't discover it.
- **Fix**: Copy the XML file from git overlay to PackagesLocalDirectory:
  ```powershell
  Copy-Item "<gitOverlayPath>\<Model>\<Model>\AxClass\MyTest.xml" `
            "<PackagesDir>\<Model>\<Model>\AxClass\MyTest.xml" -Force
  ```
  Then rebuild the model.

### SysTestExpectedError not available
- The `[SysTestExpectedError('', false)]` attribute does not exist in all D365 environments. Compilation fails with "class SysTestExpectedError not found".
- **Fix**: Replace with a try/catch pattern: wrap the failing call in `try { ... } catch (Exception::Error) { exceptionThrown = true; }`, then `assertTrue(exceptionThrown)`.

### New class must be in .rnrproj AND PackagesLocalDirectory
- Three steps before a new test class can run: (1) add `<Content Include>` to `.rnrproj`, (2) copy XML to PackagesLocalDirectory, (3) build the model. Missing any step → test runner returns 0 tests.

### End-to-end checklist for new test files
1. Create XML in git overlay source path
2. Add to `.rnrproj` in alphabetical order
3. Copy XML to PackagesLocalDirectory
4. Build: `.\scripts\Build-XppSolution.ps1 -Models "<TestModel>"`
5. Run: `.\scripts\Run-XppTests.ps1 -TestClasses "<TestClassName>"`
6. If 0 tests found, check step 3 first — most common failure.
