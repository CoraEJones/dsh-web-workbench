[CmdletBinding()]
param(
    [string]$Profile = 'desktop',
    [string]$Source,
    [string]$DshCommand,
    [string]$ReportDirectory,
    [switch]$CheckOnly,
    [switch]$DeveloperLink
)
$ErrorActionPreference = 'Stop'
if (-not $Source) { $Source = Split-Path -Parent $PSScriptRoot }
if ($Profile -notmatch '^[a-zA-Z0-9_-]+$') { throw 'Invalid profile name.' }
$packageRoot = (Resolve-Path -LiteralPath $Source).Path
$manifest = Get-Content -LiteralPath (Join-Path $packageRoot 'package.json') -Raw | ConvertFrom-Json
if ($manifest.name -ne 'dsh-web-workbench') { throw 'Source is not a dsh-web-workbench package.' }
if (-not $DshCommand) {
    $DshCommand = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
}
if (-not (Test-Path -LiteralPath $DshCommand -PathType Leaf)) {
    $found = Get-Command dsh -ErrorAction SilentlyContinue
    if ($found) { $DshCommand = $found.Source }
    else { throw 'DeepSeek Harness CLI was not found. Install/open DSH Desktop first or provide -DshCommand.' }
}
$dshRoot = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$profileRoot = Join-Path $dshRoot ('profiles\' + $Profile)
$profileManifest = Join-Path $profileRoot 'package.json'
if (-not (Test-Path -LiteralPath $profileManifest -PathType Leaf)) {
    throw "Profile does not exist: $profileRoot. Open DSH Desktop once before installing."
}
$runtimeVersion = (& $DshCommand --version | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Could not read the DSH version.' }
if ($runtimeVersion -notmatch [regex]::Escape($manifest.engines.dsh)) {
    throw "This package is validated for DSH $($manifest.engines.dsh); installed: $runtimeVersion. No version exemption has been added."
}
$before = Get-Content -LiteralPath $profileManifest -Raw | ConvertFrom-Json
$report = [ordered]@{
    package = $manifest.name; version = $manifest.version; profile = $Profile
    source = $packageRoot; dsh_command = $DshCommand; dsh_version = $runtimeVersion
    check_only = [bool]$CheckOnly; installed = $false; selected = $false
    activation = 'not-checked'; backup = $null
}
if ($CheckOnly) {
    $report | ConvertTo-Json -Depth 8
    exit 0
}
if (-not $ReportDirectory) { $ReportDirectory = Join-Path $packageRoot '.install-results' }
New-Item -ItemType Directory -Path $ReportDirectory -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$backupDirectory = Join-Path $ReportDirectory ('backup-' + $stamp)
New-Item -ItemType Directory -Path $backupDirectory | Out-Null
foreach ($name in @('package.json','pnpm-lock.yaml','cordis.patch.yml','pnpm-workspace.yaml')) {
    $existing = Join-Path $profileRoot $name
    if (Test-Path -LiteralPath $existing) { Copy-Item -LiteralPath $existing -Destination $backupDirectory }
}
$report.backup = $backupDirectory
try {
    $installTarget = $packageRoot
    if (-not $DeveloperLink) {
        # Install a tarball so pnpm also installs this package's dependencies.
        # A link: directory alone does not provision a fresh clone's dependencies.
        $resources = [IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $DshCommand) '..\..\..'))
        $electron = Join-Path $resources '..\DeepSeek Harness.exe'
        $pnpm = Join-Path $resources 'runtime\primary-runtime\dependencies\pnpm\bin\pnpm.mjs'
        if (-not (Test-Path -LiteralPath $electron) -or -not (Test-Path -LiteralPath $pnpm)) {
            throw 'Bundled DSH package runtime was not found. Provide the installed Desktop dsh.cmd path.'
        }
        $archiveDirectory = Join-Path $packageRoot '.install-results'
        New-Item -ItemType Directory -Path $archiveDirectory -Force | Out-Null
        $installTarget = Join-Path $archiveDirectory ("dsh-web-workbench-$($manifest.version)-$stamp.tgz")
        $priorElectronMode = $env:ELECTRON_RUN_AS_NODE
        try {
            $env:ELECTRON_RUN_AS_NODE = '1'
            & $electron $pnpm --dir $packageRoot pack --out $installTarget
            if ($LASTEXITCODE -ne 0) { throw 'Could not package the plugin.' }
        } finally { $env:ELECTRON_RUN_AS_NODE = $priorElectronMode }
        $report.archive = $installTarget
    }
    $oldDependency = $before.dependencies.PSObject.Properties[$manifest.name]
    $moduleEntry = Get-Item -LiteralPath (Join-Path $profileRoot ('node_modules\' + $manifest.name)) -ErrorAction SilentlyContinue
    $oldSourceLink = $false
    if ($moduleEntry -and $moduleEntry.LinkType) {
        foreach ($linkTarget in @($moduleEntry.Target)) {
            if ([IO.Path]::GetFullPath($linkTarget).TrimEnd('\') -eq $packageRoot.TrimEnd('\')) { $oldSourceLink = $true }
        }
    }
    if (-not $DeveloperLink -and (($oldDependency -and $oldDependency.Value -like 'link:*') -or $oldSourceLink)) {
        # Remove only the verified reparse point first. pnpm's pruning must
        # never follow an old Windows junction into the developer's source.
        if ($moduleEntry -and $moduleEntry.LinkType -in @('Junction','SymbolicLink')) {
            $entryPath = [IO.Path]::GetFullPath($moduleEntry.FullName)
            $expectedPath = [IO.Path]::GetFullPath((Join-Path $profileRoot ('node_modules\' + $manifest.name)))
            if ($entryPath -ne $expectedPath) { throw 'Unexpected plugin link path; no link removed.' }
            [IO.Directory]::Delete($entryPath)
        }
        & $DshCommand plugin --profile $Profile remove $manifest.name --config.ignore-scripts=true
        if ($LASTEXITCODE -ne 0) { throw 'Could not remove the old development link.' }
    }
    # DSH's supported CLI owns package installation, locking, compatibility
    # admission and selection of newly added bundles. Do not rewrite its manifest.
    & $DshCommand plugin --profile $Profile add $installTarget --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw "DSH plugin installation returned exit code $LASTEXITCODE. Backups: $backupDirectory" }
    $after = Get-Content -LiteralPath $profileManifest -Raw | ConvertFrom-Json
    $dependency = $after.dependencies.PSObject.Properties[$manifest.name]
    $report.installed = ($null -ne $dependency)
    $report.selected = (@($after.dsh.profile.bundles) -contains $manifest.name)
    if (-not $report.installed -or -not $report.selected) {
        throw 'The DSH CLI did not save both the package dependency and bundle selection. Use the Plugins page to inspect it.'
    }
    $report.activation = 'verify-in-running-host'
    Write-Host 'Installed and selected. DSH may activate through HMR; check the running Host before claiming it is active.'
    Write-Host 'Standard mode does not expose plugin_manager. Creator mode or the sidebar Plugins page can inspect activation.'
    Write-Host 'Ask DSH to call web_workbench_status. Restart only if DSH reports it is required.'
    Write-Host 'No global full-access setting or administrator account is required for this external installer.'
} catch {
    $report.error = $_.Exception.Message
    throw
} finally {
    $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $ReportDirectory 'install-result.json') -Encoding UTF8
}
$report | ConvertTo-Json -Depth 8
