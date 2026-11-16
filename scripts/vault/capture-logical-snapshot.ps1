[CmdletBinding()]
param([switch]$DevicesPaused)

$ErrorActionPreference = 'Stop'
if (-not $DevicesPaused) { throw 'Confirm unsaved work preservation and pause all writers before capture' }
$privateRoot = 'S:\Road to Storm K7\codex test\idea-vault-preservation'
$directory = Get-Item -LiteralPath $privateRoot -Force
for ($ancestor = $directory; $null -ne $ancestor; $ancestor = $ancestor.Parent) {
    if (($ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Reparse ancestor refused' }
}
$acl = Get-Acl -LiteralPath $privateRoot
$allowed = @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value, 'S-1-5-18', 'S-1-5-32-544')
if (-not $acl.AreAccessRulesProtected -or @($acl.Access | Where-Object {
    $_.AccessControlType -eq 'Allow' -and $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $allowed
}).Count -gt 0) { throw 'Private ACL required' }
if (([IO.DriveInfo]::new([IO.Path]::GetPathRoot($privateRoot))).AvailableFreeSpace -lt 10GB) { throw 'Insufficient reviewed disk reserve' }

Add-Type -AssemblyName System.Security
$runName = 'run-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$runPath = Join-Path $privateRoot $runName
$keyPath = Join-Path $privateRoot ($runName + '.key.dpapi')
if (Test-Path -LiteralPath $runPath) { throw 'Fresh run required' }
$keyBytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $rng.GetBytes($keyBytes)
    $wrapped = [Security.Cryptography.ProtectedData]::Protect($keyBytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    $keyFile = [IO.File]::Open($keyPath, [IO.FileMode]::CreateNew)
    try { $keyFile.Write($wrapped, 0, $wrapped.Length) } finally { $keyFile.Dispose() }
    $env:VAULT_SNAPSHOT_KEY = [Convert]::ToBase64String($keyBytes)
    $captureArgs = @((Join-Path $PSScriptRoot 'logical-snapshot.mjs'), $runPath)
    & node @captureArgs
    $captureCode = $LASTEXITCODE
    Write-Output "Snapshot process exit: $captureCode"
    Write-Output "Private run: $runName"
} finally {
    Remove-Item Env:VAULT_SNAPSHOT_KEY -ErrorAction SilentlyContinue
    [Array]::Clear($keyBytes, 0, $keyBytes.Length)
    $rng.Dispose()
}
exit $captureCode
