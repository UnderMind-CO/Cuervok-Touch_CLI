$ErrorActionPreference = 'Stop'
$exe = Join-Path $PSScriptRoot '..\release\win-unpacked\Cuervok.exe'
$wd = Split-Path $exe
$p = Start-Process -FilePath $exe -WorkingDirectory $wd -PassThru
Start-Sleep -Seconds 10
if ($p.HasExited) {
  Write-Output ("EXITED code=" + $p.ExitCode)
  exit 1
} else {
  Write-Output ("ALIVE pid=" + $p.Id)
  Stop-Process -Id $p.Id -Force
  exit 0
}
