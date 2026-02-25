<#
.SYNOPSIS
    Runs X++ SysTest tests using SysTestConsole.17.0.exe on a D365 OneBox dev box.

.DESCRIPTION
    Uses SysTestLauncher.exe to wrap SysTestConsole.17.0.exe, automatically
    bypassing the "Press any key" debug-attach prompt via Win32 WriteConsoleInput.
    Parses the XML results produced by SysTestListenerXML for clean output.

.PARAMETER TestClasses
    Comma-separated list of test class names to run.

.PARAMETER XmlOutput
    Path to write the XML test results file. Defaults to .tmp/test-results.xml.

.PARAMETER PackagesDir
    Path to PackagesLocalDirectory. Auto-detected if not specified.

.PARAMETER TimeoutMinutes
    Maximum time to wait for test execution (default: 20 minutes).

.PARAMETER Parallel
    When set, passes /parallel to SysTestConsole for parallel test execution.

.PARAMETER Quiet
    Suppress individual test-case output; show only the summary.

.EXAMPLE
    .\Run-XppTests.ps1 -TestClasses "MyTestClass"

.EXAMPLE
    .\Run-XppTests.ps1 -TestClasses "ClassA,ClassB" -TimeoutMinutes 30 -Parallel
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$TestClasses,

    [string]$XmlOutput = "",

    [string]$PackagesDir = "",

    [int]$TimeoutMinutes = 20,

    [switch]$Parallel,

    [switch]$Quiet
)

$ErrorActionPreference = "Stop"

#region --- Locate tools ---
# SysTestLauncher.exe must be alongside this script
$launcherExe = Join-Path $PSScriptRoot "SysTestLauncher.exe"
if (-not (Test-Path $launcherExe)) {
    Write-Error "SysTestLauncher.exe not found at: $launcherExe. Build it first with: csc.exe /out:scripts\SysTestLauncher.exe /target:exe /platform:x64 scripts\SysTestLauncher.cs"
    exit 1
}

# Auto-detect PackagesLocalDirectory
if (-not $PackagesDir) {
    $candidates = @(
        "C:\AosService\PackagesLocalDirectory",
        "K:\AosService\PackagesLocalDirectory",
        "J:\AosService\PackagesLocalDirectory"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { $PackagesDir = $c; break }
    }
    if (-not $PackagesDir) {
        Write-Error "Could not find PackagesLocalDirectory. Specify -PackagesDir."
        exit 1
    }
}

$sysTestExe = Join-Path $PackagesDir "bin\SysTestConsole.17.0.exe"
if (-not (Test-Path $sysTestExe)) {
    Write-Error "SysTestConsole.17.0.exe not found at: $sysTestExe"
    exit 1
}
#endregion

#region --- Prepare output paths ---
$workspaceRoot = Split-Path -Parent $PSScriptRoot
$tmpDir = Join-Path $workspaceRoot ".tmp"
if (-not (Test-Path $tmpDir)) { New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null }

if (-not $XmlOutput) {
    $XmlOutput = Join-Path $tmpDir "test-results.xml"
}
$stdoutLog = Join-Path $tmpDir "systest-stdout.log"
$stderrLog = Join-Path $tmpDir "systest-stderr.log"
$traceLog  = Join-Path $tmpDir "test-trace.log"

# Clean previous results
foreach ($f in @($XmlOutput, $stdoutLog, $stderrLog, $traceLog)) {
    Remove-Item $f -Force -ErrorAction SilentlyContinue
}
#endregion

#region --- Run tests ---
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " X++ Test Runner" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test classes : $TestClasses"
Write-Host "Launcher     : $launcherExe"
Write-Host "XML output   : $XmlOutput"
Write-Host "Timeout      : $TimeoutMinutes minutes"
Write-Host ""

$sysTestArgs = "/test:$TestClasses /xml:`"$XmlOutput`""
if ($Parallel) { $sysTestArgs += " /parallel" }

Write-Host "Starting SysTestLauncher..." -ForegroundColor Yellow
$startTime = Get-Date
$proc = Start-Process -FilePath $launcherExe `
    -ArgumentList $sysTestArgs `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError  $stderrLog `
    -PassThru -NoNewWindow -Wait

$elapsed = [Math]::Round(((Get-Date) - $startTime).TotalSeconds, 1)
$exitCode = $proc.ExitCode
Write-Host "Completed in ${elapsed}s (exit code: $exitCode)" -ForegroundColor $(if ($exitCode -eq 0) { "Green" } else { "Yellow" })
#endregion

#region --- Parse XML results ---
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Test Results" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

if (-not (Test-Path $XmlOutput)) {
    Write-Host "No results XML found at: $XmlOutput" -ForegroundColor Red
    if (Test-Path $stdoutLog) {
        Write-Host ""
        Write-Host "--- stdout (last 40 lines) ---" -ForegroundColor Yellow
        Get-Content $stdoutLog -Tail 40
    }
    if (Test-Path $stderrLog) {
        $errContent = Get-Content $stderrLog -ErrorAction SilentlyContinue
        if ($errContent) {
            Write-Host ""
            Write-Host "--- stderr ---" -ForegroundColor Red
            $errContent | Select-Object -Last 20
        }
    }
    Write-Host ""
    exit $(if ($exitCode -ne 0) { $exitCode } else { 1 })
}

# SysTestListenerXML format:
#   <test-results success="true|false">
#     <test-suite name="Rainier Test Suite" success="..." time="ms">
#       <results>
#         <test-suite name="ClassName" success="..." time="ms">
#           <results>
#             <test-case name="Class.Method" success="true|false" time="ms" skipped="true|false">
#               <infolog><warning>...</warning></infolog>    (optional)
#               <infolog><error>...</error></infolog>         (optional)
#             </test-case>
#           </results>
#         </test-suite>
#       </results>
#     </test-suite>
#   </test-results>

[xml]$xml = Get-Content $XmlOutput

$totalPassed  = 0
$totalFailed  = 0
$totalSkipped = 0
$failures     = @()

# Walk all test-suite elements that directly contain test-case children (the class-level suites)
$classSuites = $xml.SelectNodes("//test-suite[results/test-case]")
foreach ($suite in $classSuites) {
    $suiteName = $suite.name
    $suiteOk   = $suite.success -eq "true"
    Write-Host ""
    Write-Host "Suite: $suiteName" -ForegroundColor $(if ($suiteOk) { "White" } else { "Red" })

    foreach ($tc in $suite.SelectNodes("results/test-case")) {
        $name    = $tc.name
        $ok      = $tc.success -eq "true"
        $skip    = $tc.skipped -eq "true"
        $timeMs  = [int]$tc.time

        if ($skip) {
            $totalSkipped++
            if (-not $Quiet) { Write-Host "  SKIP  $name" -ForegroundColor DarkYellow }
            continue
        }

        if ($ok) {
            $totalPassed++
            if (-not $Quiet) { Write-Host "  PASS  $name  (${timeMs}ms)" -ForegroundColor Green }
        } else {
            $totalFailed++
            # Collect failure details from infolog
            $msgs = @()
            foreach ($info in $tc.SelectNodes("infolog/*")) {
                $msgs += "[$($info.LocalName)] $($info.InnerText)"
            }
            $failInfo = @{ Name = $name; Messages = $msgs }
            $failures += $failInfo
            Write-Host "  FAIL  $name  (${timeMs}ms)" -ForegroundColor Red
            foreach ($m in $msgs) {
                Write-Host "        $m" -ForegroundColor DarkRed
            }
        }
    }
}

# Summary
$total = $totalPassed + $totalFailed + $totalSkipped
Write-Host ""
Write-Host "----------------------------------------"
$summaryColor = if ($totalFailed -gt 0) { "Red" } elseif ($totalSkipped -gt 0) { "Yellow" } else { "Green" }
Write-Host "$total total: $totalPassed passed, $totalFailed failed, $totalSkipped skipped  (${elapsed}s)" -ForegroundColor $summaryColor

if ($failures.Count -gt 0) {
    Write-Host ""
    Write-Host "Failed tests:" -ForegroundColor Red
    foreach ($f in $failures) {
        Write-Host "  - $($f.Name)" -ForegroundColor Red
        foreach ($m in $f.Messages) {
            Write-Host "    $m" -ForegroundColor DarkRed
        }
    }
}

Write-Host ""
Write-Host "Results: $XmlOutput"
Write-Host "Logs:    $stdoutLog"
#endregion

exit $(if ($totalFailed -gt 0) { 1 } else { 0 })
