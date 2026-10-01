$exe = "C:\Users\Jhoan\Downloads\Dof test\DofusTouch\TouchEmu-Cuervok\TouchEmu.Server.Game\bin\Debug\net8.0\TouchEmu.Server.Game.exe"
$cwd = "C:\Users\Jhoan\Downloads\Dof test\DofusTouch\TouchEmu-Cuervok"
Start-Process -FilePath $exe -WorkingDirectory $cwd
Write-Output ("started: " + $exe)
