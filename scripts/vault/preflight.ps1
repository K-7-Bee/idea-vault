[CmdletBinding()]
param(
    [string]$BackupRoot = 'S:\Road to Storm K7\codex test',
    [long]$MinimumFreeBytes = 10GB
)

# Read-only inspection. Never creates files, connects to a database or prints secrets.
$ErrorActionPreference = 'Stop'
$checks = New-Object System.Collections.Generic.List[object]
function Add-Check([string]$Name, [bool]$Passed, [string]$Detail) {
    $checks.Add([pscustomobject]@{ name = $Name; passed = $Passed; detail = $Detail })
}
function Assert-PlainDirectory([string]$Directory) {
    $item = Get-Item -LiteralPath $Directory -Force
    if (-not $item.PSIsContainer) { throw 'Directory required' }
    while ($null -ne $item) {
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw 'Reparse-point ancestor refused'
        }
        $item = $item.Parent
    }
}

try {
    if ($MinimumFreeBytes -lt 0) { throw 'Invalid capacity threshold' }
    $root = [IO.Path]::GetFullPath($BackupRoot)
    if ($root.StartsWith('\\')) { throw 'Network root refused' }
    Assert-PlainDirectory $root
    $repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..')).TrimEnd('\')
    if ($root.TrimEnd('\') -eq $repository -or $root.StartsWith($repository + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Repository destination refused'
    }
    Add-Check 'destination' $true 'Existing local directory outside repository; no reparse ancestors'
} catch {
    Add-Check 'destination' $false 'Unsafe, missing or inaccessible backup directory'
    [pscustomobject]@{ ready = $false; checks = @($checks.ToArray()) } | ConvertTo-Json -Depth 5
    exit 2
}

$workspace = Join-Path $root 'idea-vault-preservation'
try {
    Assert-PlainDirectory $workspace
    $acl = Get-Acl -LiteralPath $workspace
    $allowedSids = @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value, 'S-1-5-18', 'S-1-5-32-544')
    $unexpected = @($acl.Access | Where-Object {
        $_.AccessControlType -eq 'Allow' -and
        $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $allowedSids
    })
    $private = $acl.AreAccessRulesProtected -and $unexpected.Count -eq 0
    Add-Check 'workspace-acl' $private 'Requires protected ACL allowing only current user, SYSTEM and Administrators'
} catch { Add-Check 'workspace-acl' $false 'Private workspace unavailable or permissions unverified' }

try {
    $drive = New-Object IO.DriveInfo([IO.Path]::GetPathRoot($root))
    $free = $drive.AvailableFreeSpace
    Add-Check 'capacity' ($free -ge $MinimumFreeBytes) ('Available bytes: ' + $free + '; minimum: ' + $MinimumFreeBytes)
} catch { Add-Check 'capacity' $false 'Free space could not be verified' }

$cli = Join-Path $workspace 'tools/node_modules/.bin/supabase.cmd'
try {
    if (-not (Test-Path -LiteralPath $cli -PathType Leaf)) { throw 'CLI missing' }
    # Validate the pinned install before executing the local tool.
    Assert-PlainDirectory (Split-Path -Parent $cli)
    $package = Get-Content -LiteralPath (Join-Path $workspace 'tools/node_modules/supabase/package.json') -Raw | ConvertFrom-Json
    if ($package.version -ne '3.1.0') { throw 'Unreviewed CLI version' }
    $version = @(& $cli --version 2>$null)
    $ok = $LASTEXITCODE -eq 0 -and ($version -join '').Trim() -eq '3.1.0'
    Add-Check 'supabase-cli' $ok 'Pinned CLI 3.1.0 version check'
} catch { Add-Check 'supabase-cli' $false 'Pinned CLI missing or version check failed' }

$dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerCommand) {
    $dockerPath = Join-Path $env:ProgramFiles 'Docker/Docker/resources/bin/docker.exe'
    if (Test-Path -LiteralPath $dockerPath -PathType Leaf) { $dockerCommand = Get-Item -LiteralPath $dockerPath }
}
if ($env:DOCKER_HOST -or $env:DOCKER_CONTEXT) {
    Add-Check 'local-container-runtime' $false 'Docker environment override refused; inspect local context separately'
} elseif ($dockerCommand) {
    try {
        $dockerExe = if ($dockerCommand.Source) { $dockerCommand.Source } else { $dockerCommand.FullName }
        # A remote Docker context must not receive real backup data.
        $context = @(& $dockerExe context inspect --format '{{.Endpoints.docker.Host}}' 2>$null)
        if ($LASTEXITCODE -ne 0 -or ($context -join '').Trim() -notmatch '^npipe://') { throw 'Non-local Docker context' }
        $null = & $dockerExe info --format '{{.ServerVersion}}' 2>$null
        Add-Check 'local-container-runtime' ($LASTEXITCODE -eq 0) 'Local Windows named-pipe Docker engine response'
    } catch { Add-Check 'local-container-runtime' $false 'Local container engine unavailable or context refused' }
} else { Add-Check 'local-container-runtime' $false 'Docker not found; local restore cannot start' }

# These are deliberate gates. A machine/tool check cannot attest operator actions.
Add-Check 'device-preservation' $false 'Requires per-profile offline exports and unsaved-work confirmation'
Add-Check 'production-export-access' $false 'Requires separate secure read-only export-session preflight'
Add-Check 'restore-target' $false 'Requires dedicated local instance, compatible dependencies and identity sentinel'
$ready = @($checks | Where-Object { -not $_.passed }).Count -eq 0
[pscustomobject]@{ ready = $ready; checks = @($checks.ToArray()) } | ConvertTo-Json -Depth 5
if (-not $ready) { exit 2 }
