<#
.SYNOPSIS
    Builds X++ models using xppc.exe (X++ Compiler) and runs Best Practice
    checks via xppbp.exe on a D365 OneBox dev box.

.DESCRIPTION
    Compiles one or more X++ models by invoking xppc.exe directly, then
    optionally runs Best Practice (BP) analysis via xppbp.exe.
    This bypasses MSBuild/Visual Studio entirely and works from the command line.
    Produces XML build and BP logs per model and reports errors/warnings/BP violations.

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

.PARAMETER SkipBP
    Skip Best Practice (xppbp.exe) checks after compilation.

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

    [switch]$SkipBP,

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

$xppbpExe = Join-Path $PackagesDir "bin\xppbp.exe"
if (-not $SkipBP -and -not (Test-Path $xppbpExe)) {
    Write-Warning "xppbp.exe not found at: $xppbpExe — skipping Best Practice checks."
    $SkipBP = $true
}

# Read solution dir and sourceCodePath from .env.json if not specified (supports multi-project)
$MetadataDir = ""
if (-not $SolutionDir) {
    $workspaceRoot = Split-Path -Parent $PSScriptRoot
    $envJson = Join-Path $workspaceRoot ".env.json"
    if (Test-Path $envJson) {
        $env = Get-Content $envJson -Raw | ConvertFrom-Json
        # Multi-project: use activeProject's solutionPath, fallback to top-level
        if ($env.activeProject -and $env.projects -and $env.projects.PSObject.Properties[$env.activeProject]) {
            $SolutionDir = $env.projects.($env.activeProject).solutionPath
        } elseif ($env.solutionPath) {
            $SolutionDir = $env.solutionPath
        }
        # Read sourceCodePath — the actual X++ metadata directory (may differ from PackagesDir)
        if ($env.sourceCodePath -and (Test-Path $env.sourceCodePath)) {
            $MetadataDir = $env.sourceCodePath
        }
    }
}
# Fall back to PackagesDir if no separate metadata path is configured
if (-not $MetadataDir) {
    $MetadataDir = $PackagesDir
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
# Use project-scoped output directory if an active project is configured
$envJsonPath = Join-Path $workspaceRoot ".env.json"
if (Test-Path $envJsonPath) {
    $envData = Get-Content $envJsonPath -Raw | ConvertFrom-Json
    if ($envData.activeProject) {
        $tmpDir = Join-Path $workspaceRoot ".tmp" "projects" $envData.activeProject
    }
}
if (-not (Test-Path $tmpDir)) { New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null }
#endregion

#region --- Sort models by dependency order ---
# Read each model's ModuleReferences from its Descriptor XML and topologically
# sort so that dependencies are built before the models that depend on them.
if ($modelList.Count -gt 1) {
    $modelSet = [System.Collections.Generic.HashSet[string]]::new(
        [string[]]$modelList, [System.StringComparer]::OrdinalIgnoreCase)
    # Build adjacency: model -> list of models in our set that it depends on
    $deps = @{}
    foreach ($m in $modelList) {
        $deps[$m] = @()
        # Check MetadataDir first (source path), then fall back to PackagesDir
        $descDir = Join-Path $MetadataDir "$m\Descriptor"
        if (-not (Test-Path $descDir)) {
            $descDir = Join-Path $PackagesDir "$m\Descriptor"
        }
        if (Test-Path $descDir) {
            $descFile = Get-ChildItem $descDir -Filter "*.xml" | Select-Object -First 1
            if ($descFile) {
                $descXml = [xml](Get-Content $descFile.FullName -Raw)
                $refs = $descXml.AxModelInfo.ModuleReferences.string
                if ($refs) {
                    $deps[$m] = @($refs | Where-Object { $modelSet.Contains($_) })
                }
            }
        }
    }

    # Topological sort (Kahn's algorithm)
    $inDegree = @{}
    foreach ($m in $modelList) { $inDegree[$m] = 0 }
    foreach ($m in $modelList) {
        foreach ($dep in $deps[$m]) {
            $inDegree[$dep] = ($inDegree[$dep]) # ensure key exists
            $inDegree[$m]++
        }
    }

    $queue   = [System.Collections.Queue]::new()
    $sorted  = @()
    foreach ($m in $modelList) {
        if ($inDegree[$m] -eq 0) { $queue.Enqueue($m) }
    }
    while ($queue.Count -gt 0) {
        $current = $queue.Dequeue()
        $sorted += $current
        # For each model that depends on $current, decrement in-degree
        foreach ($m in $modelList) {
            if ($deps[$m] -contains $current) {
                $inDegree[$m]--
                if ($inDegree[$m] -eq 0) { $queue.Enqueue($m) }
            }
        }
    }

    if ($sorted.Count -eq $modelList.Count) {
        $modelList = $sorted
    } else {
        Write-Warning "Could not fully resolve dependency order (possible circular refs). Building in original order."
    }
}
#endregion

#region --- Build models ---
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " X++ Build" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Models       : $($modelList -join ', ')"
Write-Host "Compiler     : $xppcExe"
Write-Host "Metadata     : $MetadataDir"
Write-Host "Packages     : $PackagesDir"
if ($Incremental) { Write-Host "Mode         : Incremental" }
Write-Host ""

$overallStartTime = Get-Date
$totalErrors     = 0
$totalWarnings   = 0
$totalBPWarnings = 0
$totalBPErrors   = 0
$modelResults    = @()
$overallExitCode = 0

foreach ($model in $modelList) {
    Write-Host "----------------------------------------" -ForegroundColor Cyan
    Write-Host " Building: $model" -ForegroundColor Cyan
    Write-Host "----------------------------------------" -ForegroundColor Cyan

    $outputDir = Join-Path $MetadataDir "$model\bin"
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
    # -metadata uses the source code path (where actual X++ metadata lives)
    # -referenceFolder includes both MetadataDir (for locally-built modules) and PackagesDir (for platform binaries)
    $xppArgs = @(
        "-metadata=$MetadataDir",
        "-compilermetadata=$PackagesDir",
        "-modelmodule=$model",
        "-output=$outputDir",
        "-referenceFolder=$MetadataDir",
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
        -WorkingDirectory $MetadataDir `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError  $stderrLog `
        -PassThru -NoNewWindow -Wait

    $elapsed = [Math]::Round(((Get-Date) - $startTime).TotalSeconds, 1)
    $exitCode = $proc.ExitCode

    # --- Sync metadata to PackagesLocalDirectory ---
    # When MetadataDir differs from PackagesDir (separate source overlay), xppc outputs
    # to MetadataDir but downstream modules resolve cross-module references (formControlStr,
    # FormAdaptorTypeProvider, etc.) from PackagesDir. Sync the built model's artifacts so
    # dependent modules can compile against the latest metadata and binaries.
    if ($MetadataDir -ne $PackagesDir) {
        $srcModelDir = Join-Path $MetadataDir $model
        $pkgModelDir = Join-Path $PackagesDir $model

        if ((Test-Path $srcModelDir) -and (Test-Path $pkgModelDir)) {
            $syncErrors = 0

            # 1. Sync bin output (compiled DLLs, netmodules, exports, cross-refs)
            #    Use /E (not /MIR) to avoid deleting PKG files that may be locked by AOS.
            #    Copy new/updated files only — locked files will be retried up to 3 times.
            $srcBin = Join-Path $srcModelDir "bin"
            $pkgBin = Join-Path $pkgModelDir "bin"
            if (Test-Path $srcBin) {
                if (-not (Test-Path $pkgBin)) { New-Item -ItemType Directory -Path $pkgBin -Force | Out-Null }
                $roboOut = robocopy $srcBin $pkgBin /E /NJH /NJS /NP /R:3 /W:2 /XF *.delete 2>&1
                $roboExit = $LASTEXITCODE
                if ($roboExit -ge 8) {
                    $syncErrors++
                    $failedFiles = $roboOut | Where-Object { $_ -match 'ERROR \d+' }
                    if ($failedFiles -and -not $Quiet) {
                        Write-Host "  Warning: Some bin files could not be synced (locked by AOS?)" -ForegroundColor DarkYellow
                        $failedFiles | Select-Object -First 3 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkYellow }
                    }
                }
            }

            # 2. Sync main metadata (AxForm, AxClass, etc. — needed for formControlStr resolution)
            $srcMeta = Join-Path $srcModelDir $model
            $pkgMeta = Join-Path $pkgModelDir $model
            if (Test-Path $srcMeta) {
                if (-not (Test-Path $pkgMeta)) { New-Item -ItemType Directory -Path $pkgMeta -Force | Out-Null }
                robocopy $srcMeta $pkgMeta /MIR /NJH /NJS /NFL /NDL /NP /R:3 /W:2 | Out-Null
            }

            # 3. Sync XppMetadata (compiler-friendly metadata used by TypeProviders)
            $srcXppMeta = Join-Path $srcModelDir "XppMetadata"
            $pkgXppMeta = Join-Path $pkgModelDir "XppMetadata"
            if (Test-Path $srcXppMeta) {
                if (-not (Test-Path $pkgXppMeta)) { New-Item -ItemType Directory -Path $pkgXppMeta -Force | Out-Null }
                robocopy $srcXppMeta $pkgXppMeta /MIR /NJH /NJS /NFL /NDL /NP /R:3 /W:2 | Out-Null
            }

            if (-not $Quiet) {
                if ($syncErrors -gt 0) {
                    Write-Host "Synced $model to PackagesLocalDirectory (with $syncErrors sync warning(s) — locked files skipped)" -ForegroundColor DarkYellow
                } else {
                    Write-Host "Synced $model to PackagesLocalDirectory" -ForegroundColor DarkGray
                }
            }
        }
    }

    # Parse XML results
    $errors   = 0
    $warnings = 0
    $errorDetails = @()

    if (Test-Path $xmlLog) {
        [xml]$xml = Get-Content $xmlLog -Raw
        $diags = $xml.SelectNodes('//Diagnostic')
        foreach ($diag in $diags) {
            switch ($diag.Severity) {
                { $_ -in @('Error', 'Fatal') } {
                    $errors++
                    $errorDetails += @{
                        Path     = $diag.Path
                        Message  = $diag.Message
                        Line     = $diag.Line
                        Column   = $diag.Column
                        Severity = $diag.Severity
                    }
                }
                "Warning" { $warnings++ }
            }
        }
    }

    # --- Best Practice checks ---
    $bpWarnings = 0
    $bpErrors   = 0
    $bpDetails  = @()
    $bpElapsed  = 0

    if (-not $SkipBP) {
        $bpXmlLog = Join-Path $tmpDir "bp-$model.xml"
        $bpStdoutLog = Join-Path $tmpDir "bp-$model-stdout.log"
        $bpStderrLog = Join-Path $tmpDir "bp-$model-stderr.log"

        foreach ($f in @($bpXmlLog, $bpStdoutLog, $bpStderrLog)) {
            Remove-Item $f -Force -ErrorAction SilentlyContinue
        }

        # Resolve model name from descriptor (may differ from module name)
        $descriptorDir = Join-Path $PackagesDir "$model\Descriptor"
        $bpModelName = $model  # default: same as module
        if (Test-Path $descriptorDir) {
            $descFile = Get-ChildItem $descriptorDir -Filter "*.xml" | Select-Object -First 1
            if ($descFile) {
                $descXml = [xml](Get-Content $descFile.FullName -Raw)
                $descName = $descXml.AxModelInfo.Name
                if ($descName) { $bpModelName = $descName }
            }
        }

        $bpArgs = @(
            "-metadata=$PackagesDir",
            "-module=$model",
            "-model=$bpModelName",
            "-packagesRoot=$PackagesDir",
            "-all",
            "-xmlLog=$bpXmlLog"
        )

        Write-Host "Running BP checks..." -ForegroundColor Yellow
        $bpStartTime = Get-Date

        $bpProc = Start-Process -FilePath $xppbpExe `
            -ArgumentList $bpArgs `
            -RedirectStandardOutput $bpStdoutLog `
            -RedirectStandardError  $bpStderrLog `
            -PassThru -NoNewWindow -Wait

        $bpElapsed = [Math]::Round(((Get-Date) - $bpStartTime).TotalSeconds, 1)

        # Parse BP XML results (same schema as compiler output)
        if (Test-Path $bpXmlLog) {
            [xml]$bpXml = Get-Content $bpXmlLog -Raw
            $bpDiags = $bpXml.SelectNodes('//Diagnostic')
            foreach ($bpDiag in $bpDiags) {
                switch ($bpDiag.Severity) {
                    { $_ -in @('Error', 'Fatal') } {
                        $bpErrors++
                        $bpDetails += @{
                            Path     = $bpDiag.Path
                            Message  = $bpDiag.Message
                            Moniker  = $bpDiag.Moniker
                            Severity = $bpDiag.Severity
                        }
                    }
                    "Warning" {
                        $bpWarnings++
                        $bpDetails += @{
                            Path     = $bpDiag.Path
                            Message  = $bpDiag.Message
                            Moniker  = $bpDiag.Moniker
                            Severity = "Warning"
                        }
                    }
                }
            }
        }

        # Show BP stderr if any
        if (Test-Path $bpStderrLog) {
            $bpErrContent = Get-Content $bpStderrLog -ErrorAction SilentlyContinue
            if ($bpErrContent) {
                Write-Host "--- BP stderr ---" -ForegroundColor Red
                $bpErrContent | Select-Object -Last 5
            }
        }
    }

    $totalBPWarnings += $bpWarnings
    $totalBPErrors   += $bpErrors
    $totalErrors     += $errors + $bpErrors
    $totalWarnings   += $warnings

    # Determine success
    $buildOk = ($exitCode -eq 0) -and ($errors -eq 0) -and ($bpErrors -eq 0)
    if (-not $buildOk) { $overallExitCode = 1 }

    $statusColor = if ($buildOk) { "Green" } else { "Red" }
    $statusText  = if ($buildOk) { "SUCCEEDED" } else { "FAILED" }

    $bpSuffix = ""
    if (-not $SkipBP -and ($bpWarnings -gt 0 -or $bpErrors -gt 0)) {
        $bpSuffix = ", BP: $bpErrors errors/$bpWarnings warnings"
    }

    $modelResults += @{
        Model      = $model
        Status     = $statusText
        Errors     = $errors
        Warnings   = $warnings
        BPErrors   = $bpErrors
        BPWarnings = $bpWarnings
        Elapsed    = $elapsed
        BPElapsed  = $bpElapsed
        ExitCode   = $exitCode
    }

    Write-Host "$statusText in ${elapsed}s (exit code: $exitCode, errors: $errors, warnings: $warnings$bpSuffix)" -ForegroundColor $statusColor

    # Show compile errors
    if ($errors -gt 0 -and -not $Quiet) {
        Write-Host ""
        $shown = 0
        foreach ($err in $errorDetails) {
            if ($shown -ge 20) {
                Write-Host "  ... and $($errors - 20) more errors (see $xmlLog)" -ForegroundColor DarkRed
                break
            }
            Write-Host "  ERROR [$($err.Severity)]: $($err.Path)" -ForegroundColor Red
            Write-Host "         $($err.Message) (line $($err.Line), col $($err.Column))" -ForegroundColor DarkRed
            $shown++
        }
    }

    # Show BP violations
    if ($bpDetails.Count -gt 0 -and -not $Quiet) {
        Write-Host ""
        $shown = 0
        foreach ($bp in $bpDetails) {
            if ($shown -ge 30) {
                $remaining = $bpDetails.Count - 30
                Write-Host "  ... and $remaining more BP issues (see $(Join-Path $tmpDir "bp-$model.xml"))" -ForegroundColor DarkYellow
                break
            }
            $bpColor = if ($bp.Severity -in @('Error','Fatal')) { "Red" } else { "DarkYellow" }
            $bpLabel = if ($bp.Severity -in @('Error','Fatal')) { "BP ERROR" } else { "BP WARN" }
            Write-Host "  ${bpLabel}: [$($bp.Moniker)] $($bp.Path)" -ForegroundColor $bpColor
            Write-Host "         $($bp.Message)" -ForegroundColor $bpColor
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

# Clean up GeneratedXppSource created by xppc.exe at the metadata root
# xppc generates persister .xpp files for data entities here; they pollute the git overlay
$genXppDir = Join-Path $MetadataDir "GeneratedXppSource"
if (Test-Path $genXppDir) {
    Remove-Item $genXppDir -Recurse -Force -ErrorAction SilentlyContinue
}
# Also clean from workspace root in case xppc ran with a different CWD
$genXppDirCwd = Join-Path $PSScriptRoot ".." "Source" "Metadata" "GeneratedXppSource"
if (Test-Path $genXppDirCwd) {
    Remove-Item $genXppDirCwd -Recurse -Force -ErrorAction SilentlyContinue
}
#endregion

#region --- Summary ---
$overallElapsed = [Math]::Round(((Get-Date) - $overallStartTime).TotalSeconds, 1)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Build Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

foreach ($r in $modelResults) {
    $color = if ($r.Status -eq "SUCCEEDED") { "Green" } else { "Red" }
    $bpInfo = ""
    if (-not $SkipBP -and ($r.BPErrors -gt 0 -or $r.BPWarnings -gt 0)) {
        $bpInfo = ", BP: $($r.BPErrors) errors/$($r.BPWarnings) warnings"
    }
    Write-Host "  $($r.Model): $($r.Status) ($($r.Elapsed)s, $($r.Errors) errors, $($r.Warnings) warnings$bpInfo)" -ForegroundColor $color
}

Write-Host ""
$summaryColor = if ($totalErrors -gt 0) { "Red" } elseif ($totalWarnings -gt 0 -or $totalBPWarnings -gt 0) { "Yellow" } else { "Green" }
$bpSummary = ""
if (-not $SkipBP) {
    $bpSummary = ", $totalBPErrors BP error(s), $totalBPWarnings BP warning(s)"
}
Write-Host "Total: $($modelList.Count) model(s), $totalErrors error(s), $totalWarnings warning(s)$bpSummary in ${overallElapsed}s" -ForegroundColor $summaryColor
Write-Host "Build logs: $tmpDir\build-*.xml$(if(-not $SkipBP){', bp-*.xml'})"
Write-Host ""
#endregion

exit $overallExitCode
