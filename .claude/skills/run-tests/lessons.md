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
