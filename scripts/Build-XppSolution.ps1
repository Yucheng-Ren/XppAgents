<#
.SYNOPSIS
    Builds X++ models using xppc.exe (X++ Compiler) on a D365 OneBox dev box.

.DESCRIPTION
    Compiles one or more X++ models by invoking xppc.exe directly.
    This bypasses MSBuild/Visual Studio entirely and works from the command line.
    Produces an XML build log per model and reports errors/warnings.

.PARAMETER Models
    Comma-separated list of model names to compile, or "all" (default) to
    auto-discover all models from the solution .rnrproj files.

.PARAMETER PackagesDir
    Path to PackagesLocalDirectory. Auto-detected if not specified.

.PARAMETER SolutionDir
    Path to the solution directory. Read from .env.json if not specified.

.PARAMETER Incremental
    When set, passes -incremental to xppc.exe to only compile changed elements.

.PARAMETER Verbose
    When set, shows detailed phase timing from xppc.exe.

.PARAMETER Quiet
    Suppress individual diagnostic output; show only the summary.

.EXAMPLE
    .\Build-XppSolution.ps1
    Discovers all models from the solution and builds them.

.EXAMPLE
    .\Build-XppSolution.ps1 -Models "MyModel"
    Build a single specific model.

.EXAMPLE
    .\Build-XppSolution.ps1 -Models "MyModel,MyModelTests" -Incremental
    Incremental build of two specific models.

.EXAMPLE
    .\Build-XppSolution.ps1 -Quiet
    Build all discovered models with summary-only output.
#>
[CmdletBinding()]
param(
    [string]$Models = "all",

    [string]$PackagesDir = "",

    [string]$SolutionDir = "",

    [switch]$Incremental,

    [switch]$ShowVerbose,

    [switch]$Quiet
)

$ErrorActionPreference = "Stop"

#region --- Locate tools ---
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

$xppcExe = Join-Path $PackagesDir "bin\xppc.exe"
if (-not (Test-Path $xppcExe)) {
    Write-Error "xppc.exe not found at: $xppcExe"
    exit 1
}

# Read solution dir from .env.json if not specified
if (-not $SolutionDir) {
    $workspaceRoot = Split-Path -Parent $PSScriptRoot
    $envJson = Join-Path $workspaceRoot ".env.json"
    if (Test-Path $envJson) {
        $env = Get-Content $envJson -Raw | ConvertFrom-Json
        $SolutionDir = $env.solutionPath
    }
}
#endregion

#region --- Resolve models ---
# If "all", discover from .rnrproj files in solution directory
$modelList = @()
if ($Models -eq "all") {
    if (-not $SolutionDir -or -not (Test-Path $SolutionDir)) {
        Write-Error "Cannot discover models: SolutionDir not found. Specify -SolutionDir or set solutionPath in .env.json."
        exit 1
    }
    # Find .sln and parse project references
    $slnFile = Get-ChildItem $SolutionDir -Filter "*.sln" -File | Select-Object -First 1
    if ($slnFile) {
        $slnContent = Get-Content $slnFile.FullName -Raw
        $projRefs = [regex]::Matches($slnContent, 'Project\([^)]+\)\s*=\s*"[^"]+",\s*"([^"]+\.rnrproj)"')
        foreach ($match in $projRefs) {
            $relPath = $match.Groups[1].Value
            $projPath = Join-Path $SolutionDir $relPath
            $projPath = [System.IO.Path]::GetFullPath($projPath)
            if (Test-Path $projPath) {
                $projContent = Get-Content $projPath -Raw
                if ($projContent -match '<Model>([^<]+)</Model>') {
                    $modelList += $Matches[1]
                }
            }
        }
    }
    if ($modelList.Count -eq 0) {
        Write-Error "No models discovered from solution at: $SolutionDir"
        exit 1
    }
} else {
    $modelList = $Models -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
}
#endregion

#region --- Prepare output ---
$workspaceRoot = Split-Path -Parent $PSScriptRoot
$tmpDir = Join-Path $workspaceRoot ".tmp"
if (-not (Test-Path $tmpDir)) { New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null }
#endregion

#region --- Build models ---
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " X++ Build" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Models       : $($modelList -join ', ')"
Write-Host "Compiler     : $xppcExe"
Write-Host "Packages     : $PackagesDir"
if ($Incremental) { Write-Host "Mode         : Incremental" }
Write-Host ""

$overallStartTime = Get-Date
$totalErrors   = 0
$totalWarnings = 0
$modelResults  = @()
$overallExitCode = 0

foreach ($model in $modelList) {
    Write-Host "----------------------------------------" -ForegroundColor Cyan
    Write-Host " Building: $model" -ForegroundColor Cyan
    Write-Host "----------------------------------------" -ForegroundColor Cyan

    $outputDir = Join-Path $PackagesDir "$model\bin"
    $xmlLog    = Join-Path $tmpDir "build-$model.xml"
    $stdoutLog = Join-Path $tmpDir "build-$model-stdout.log"
    $stderrLog = Join-Path $tmpDir "build-$model-stderr.log"

    # Ensure output directory exists
    if (-not (Test-Path $outputDir)) {
        New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
    }

    # Clean previous logs
    foreach ($f in @($xmlLog, $stdoutLog, $stderrLog)) {
        Remove-Item $f -Force -ErrorAction SilentlyContinue
    }

    # Build xppc arguments
    $xppArgs = @(
        "-metadata=$PackagesDir",
        "-compilermetadata=$PackagesDir",
        "-modelmodule=$model",
        "-output=$outputDir",
        "-referenceFolder=$PackagesDir",
        "-xmllog=$xmlLog"
    )
    if ($ShowVerbose) { $xppArgs += "-verbose" }
    if ($Incremental) { $xppArgs += "-incremental" }

    # Run xppc.exe
    $startTime = Get-Date
    Write-Host "Starting xppc.exe..." -ForegroundColor Yellow

    $proc = Start-Process -FilePath $xppcExe `
        -ArgumentList $xppArgs `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError  $stderrLog `
        -PassThru -NoNewWindow -Wait

    $elapsed = [Math]::Round(((Get-Date) - $startTime).TotalSeconds, 1)
    $exitCode = $proc.ExitCode

    # Parse XML results
    $errors   = 0
    $warnings = 0
    $errorDetails = @()

    if (Test-Path $xmlLog) {
        [xml]$xml = Get-Content $xmlLog -Raw
        $diags = $xml.SelectNodes('//Diagnostic')
        foreach ($diag in $diags) {
            switch ($diag.Severity) {
                "Error" {
                    $errors++
                    $errorDetails += @{
                        Path    = $diag.Path
                        Message = $diag.Message
                        Line    = $diag.Line
                        Column  = $diag.Column
                    }
                }
                "Warning" { $warnings++ }
            }
        }
    }

    $totalErrors   += $errors
    $totalWarnings += $warnings

    # Determine success
    $buildOk = ($exitCode -eq 0) -and ($errors -eq 0)
    if (-not $buildOk) { $overallExitCode = 1 }

    $statusColor = if ($buildOk) { "Green" } else { "Red" }
    $statusText  = if ($buildOk) { "SUCCEEDED" } else { "FAILED" }

    $modelResults += @{
        Model    = $model
        Status   = $statusText
        Errors   = $errors
        Warnings = $warnings
        Elapsed  = $elapsed
        ExitCode = $exitCode
    }

    Write-Host "$statusText in ${elapsed}s (exit code: $exitCode, errors: $errors, warnings: $warnings)" -ForegroundColor $statusColor

    # Show errors
    if ($errors -gt 0 -and -not $Quiet) {
        Write-Host ""
        $shown = 0
        foreach ($err in $errorDetails) {
            if ($shown -ge 20) {
                Write-Host "  ... and $($errors - 20) more errors (see $xmlLog)" -ForegroundColor DarkRed
                break
            }
            Write-Host "  ERROR: $($err.Path)" -ForegroundColor Red
            Write-Host "         $($err.Message) (line $($err.Line), col $($err.Column))" -ForegroundColor DarkRed
            $shown++
        }
    }

    # Show stderr if any
    if (Test-Path $stderrLog) {
        $errContent = Get-Content $stderrLog -ErrorAction SilentlyContinue
        if ($errContent) {
            Write-Host ""
            Write-Host "--- stderr ---" -ForegroundColor Red
            $errContent | Select-Object -Last 10
        }
    }

    Write-Host ""
}
#endregion

#region --- Summary ---
$overallElapsed = [Math]::Round(((Get-Date) - $overallStartTime).TotalSeconds, 1)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Build Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

foreach ($r in $modelResults) {
    $color = if ($r.Status -eq "SUCCEEDED") { "Green" } else { "Red" }
    Write-Host "  $($r.Model): $($r.Status) ($($r.Elapsed)s, $($r.Errors) errors, $($r.Warnings) warnings)" -ForegroundColor $color
}

Write-Host ""
$summaryColor = if ($totalErrors -gt 0) { "Red" } elseif ($totalWarnings -gt 0) { "Yellow" } else { "Green" }
Write-Host "Total: $($modelList.Count) model(s), $totalErrors error(s), $totalWarnings warning(s) in ${overallElapsed}s" -ForegroundColor $summaryColor
Write-Host "Build logs: $tmpDir\build-*.xml"
Write-Host ""
#endregion

exit $overallExitCode
