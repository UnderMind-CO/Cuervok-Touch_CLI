$ErrorActionPreference = 'SilentlyContinue'
$roots = @(
  "C:\Program Files",
  "C:\Program Files (x86)",
  "$env:LOCALAPPDATA\Programs",
  "$env:ProgramFiles"
)
foreach ($r in $roots) {
  Get-ChildItem -Path $r -Directory -Filter "*uervok*" | ForEach-Object { $_.FullName }
}
Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' |
  Where-Object { $_.DisplayName -match '(?i)cuervok' } |
  Select-Object DisplayName, InstallLocation, UninstallString | Format-List | Out-String
Get-Process | Where-Object { $_.Name -match '(?i)cuervok' } | Select-Object Name, Id, Path | Format-List | Out-String
