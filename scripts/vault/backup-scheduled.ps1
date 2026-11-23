<#
Phase 6E: the weekly backup on this PC (Windows PowerShell 5.1 or later).

  One-time setup, from the repository folder:
    powershell -ExecutionPolicy Bypass -File scripts\vault\backup-scheduled.ps1 -Action Setup
    powershell -ExecutionPolicy Bypass -File scripts\vault\backup-scheduled.ps1 -Action Register

  Afterwards:
    ... -Action Run            run now (what the task runs; add -Drill to force a restore drill)
    ... -Action Status         freshness of backups and drills
    ... -Action Unregister     remove the scheduled task (backups and the sealed passphrase stay)

Setup asks for the backup passphrase once and seals it with Windows DPAPI for this Windows account
(ConvertFrom-SecureString), so only this account on this PC can unseal it; it is never written in
plain text, never passed on a command line and never logged. Run unseals it into an environment
variable for the two Node scripts only, and removes it afterwards.

Run: backup-live.mjs (read-only against production) -> keep the newest -Keep archives ->
restore-drill.mjs on the newest archive when the last passing drill is older than -DrillEveryDays
(Docker must be running; otherwise the drill is skipped and you are told) -> last-run.json and a log
in <folder>\logs. Any failure shows a Windows notification and gives the task a non-zero result.
#>
param(
  [ValidateSet('Run', 'Setup', 'Register', 'Unregister', 'Status')] [string]$Action = 'Run',
  [string]$Folder = 'S:\Road to Storm K7\codex test\idea-vault-preservation\live-backups',
  [string]$Ref = 'kpeyjktueihyxtsfnsyr',
  [string]$Cli = 'S:\Road to Storm K7\codex test\idea-vault-preservation\tools\node_modules\supabase\dist\supabase.js',
  [string]$Node = '',
  [int]$Keep = 8,
  [int]$DrillEveryDays = 28,
  [string]$TaskName = 'Idea Vault weekly backup',
  [switch]$Drill
)
$ErrorActionPreference = 'Stop'
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Sealed = Join-Path $Folder 'backup-passphrase.dpapi'
if (-not $Node) { $Node = (Get-Command node -ErrorAction Stop).Source }

function Assert-OutsideRepo {
  $full = [System.IO.Path]::GetFullPath($Folder).TrimEnd('\') + '\'
  if ($full.StartsWith($Repo.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Choose a backup folder outside the repository.' }
}

function Invoke-Node([string[]]$Arguments) {
  # Native stderr must not become a terminating error in Windows PowerShell; collect it as text.
  $previous = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { $lines = & $Node @Arguments 2>&1 | ForEach-Object { "$_" } } finally { $ErrorActionPreference = $previous }
  return @{ Code = $LASTEXITCODE; Lines = @($lines) }
}

function Show-Notice([string]$Text) {
  try {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    $icon = New-Object System.Windows.Forms.NotifyIcon
    $icon.Icon = [System.Drawing.SystemIcons]::Warning; $icon.Visible = $true
    $icon.ShowBalloonTip(20000, 'Idea Vault backup', $Text, [System.Windows.Forms.ToolTipIcon]::Warning)
    Start-Sleep -Seconds 20; $icon.Dispose()
  } catch { }
}

switch ($Action) {
  'Setup' {
    Assert-OutsideRepo
    New-Item -ItemType Directory -Force -Path $Folder | Out-Null
    $first = Read-Host 'Backup passphrase (16+ characters, from your password manager)' -AsSecureString
    $again = Read-Host 'Type it again' -AsSecureString
    $a = [System.Net.NetworkCredential]::new('', $first).Password
    $b = [System.Net.NetworkCredential]::new('', $again).Password
    try {
      if ($a -ne $b) { throw "The two entries don't match. Nothing was saved." }
      if ($a.Length -lt 16) { throw 'Use at least 16 characters. Nothing was saved.' }
      $first | ConvertFrom-SecureString | Set-Content -Path $Sealed -Encoding ascii
      $check = [System.Net.NetworkCredential]::new('', (Get-Content $Sealed | ConvertTo-SecureString)).Password
      if ($check -ne $a) { throw 'Sealing check failed; remove the .dpapi file and try again.' }
    } finally { $a = $null; $b = $null; $check = $null }
    Write-Output "Sealed for $env:USERDOMAIN\$env:USERNAME in $Sealed. Keep the passphrase in your password manager too: backups can't be opened without it."
  }
  'Register' {
    Assert-OutsideRepo
    if (-not (Test-Path $Sealed)) { throw 'Run -Action Setup first.' }
    $arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`" -Action Run -Folder `"$Folder`" -Ref $Ref -Cli `"$Cli`" -Node `"$Node`" -Keep $Keep -DrillEveryDays $DrillEveryDays"
    $taskAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments -WorkingDirectory $Repo
    $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At '11:00'
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew
    # Interactive logon: runs while you're signed in, so DPAPI can unseal without storing a Windows password.
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $TaskName -Action $taskAction -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
    Write-Output "Registered '$TaskName': Sundays 11:00, or at your next sign-in if the PC was off. Test it now with: Start-ScheduledTask -TaskName '$TaskName'"
  }
  'Unregister' {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Output "Removed '$TaskName'. Backups and the sealed passphrase are unchanged."
  }
  'Status' {
    $r = Invoke-Node @((Join-Path $Repo 'scripts\vault\backup-status.mjs'), '--folder', $Folder)
    $r.Lines; exit $r.Code
  }
  'Run' {
    Assert-OutsideRepo
    $logs = Join-Path $Folder 'logs'; New-Item -ItemType Directory -Force -Path $logs | Out-Null
    $started = (Get-Date).ToUniversalTime()
    $log = Join-Path $logs ('run-' + $started.ToString('yyyyMMddTHHmmssZ') + '.log')
    function Write-Log([string]$Line) { Add-Content -Path $log -Value ((Get-Date).ToString('s') + '  ' + $Line) -Encoding utf8 }
    $result = [ordered]@{ startedAt = $started.ToString('o'); finishedAt = $null; backup = 'not run'; drill = 'not due'; message = $null }
    $problems = @()
    try {
      if (-not (Test-Path $Sealed)) { throw 'No sealed passphrase; run -Action Setup.' }
      $env:VAULT_BACKUP_PASSPHRASE = [System.Net.NetworkCredential]::new('', (Get-Content $Sealed | ConvertTo-SecureString)).Password

      Write-Log "Backup of $Ref into $Folder"
      $b = Invoke-Node @((Join-Path $Repo 'scripts\vault\backup-live.mjs'), '--cli', $Cli, '--ref', $Ref, '--out', $Folder)
      $b.Lines | ForEach-Object { Write-Log $_ }
      if ($b.Code -ne 0) { $result.backup = 'failed'; $problems += ($b.Lines | Select-Object -Last 1) } else { $result.backup = 'ok' }

      $p = Invoke-Node @((Join-Path $Repo 'scripts\vault\backup-status.mjs'), '--folder', $Folder, '--prune', "$Keep")
      $p.Lines | Where-Object { $_ -like 'Removed *' } | ForEach-Object { Write-Log $_ }

      $drills = Join-Path $Folder 'drills'
      $lastGood = Get-ChildItem -Path $drills -Filter 'drill-*.json' -ErrorAction SilentlyContinue | Where-Object {
        try { $s = (Get-Content $_.FullName -Raw | ConvertFrom-Json).summary; $s.identicalTables -eq $s.tables -and $s.filesOk } catch { $false }
      } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
      $due = $Drill -or -not $lastGood -or $lastGood.LastWriteTime -lt (Get-Date).AddDays(-$DrillEveryDays)
      $newest = Get-ChildItem -Path $Folder -Filter 'vault-live-*.vaultlive' | Sort-Object Name -Descending | Select-Object -First 1
      if ($due -and $newest) {
        $previous = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
        & docker info --format '{{.ServerVersion}}' *> $null; $dockerUp = ($LASTEXITCODE -eq 0)
        $ErrorActionPreference = $previous
        if (-not $dockerUp) {
          $result.drill = 'skipped'; $problems += 'restore drill due but Docker Desktop is not running'
          Write-Log 'Restore drill due, skipped: Docker is not running.'
        } else {
          New-Item -ItemType Directory -Force -Path $drills | Out-Null
          Write-Log "Restore drill on $($newest.Name)"
          $d = Invoke-Node @((Join-Path $Repo 'scripts\vault\restore-drill.mjs'), $newest.FullName, $drills)
          $d.Lines | ForEach-Object { Write-Log $_ }
          if ($d.Code -ne 0) { $result.drill = 'failed'; $problems += ($d.Lines | Select-Object -Last 1) } else { $result.drill = 'ok' }
        }
      }
    } catch {
      $problems += $_.Exception.Message
      if ($result.backup -eq 'not run') { $result.backup = 'failed' }
      Write-Log "Error: $($_.Exception.Message)"
    } finally {
      Remove-Item Env:VAULT_BACKUP_PASSPHRASE -ErrorAction SilentlyContinue
      $result.finishedAt = (Get-Date).ToUniversalTime().ToString('o')
      if ($problems.Count) { $result.message = ($problems -join '; ') }
      $result | ConvertTo-Json | Set-Content -Path (Join-Path $Folder 'last-run.json') -Encoding utf8
      Get-ChildItem -Path $logs -Filter 'run-*.log' | Sort-Object Name -Descending | Select-Object -Skip 30 | Remove-Item -Force
      Write-Log "Done: backup $($result.backup), drill $($result.drill)."
    }
    Write-Output "Backup $($result.backup), restore drill $($result.drill). Log: $log"
    if ($problems.Count) {
      Show-Notice ("Weekly backup needs attention: " + ($problems -join '; '))
      exit 1
    }
  }
}
