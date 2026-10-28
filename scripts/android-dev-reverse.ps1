# Testing local de la APK Cuervok contra el Auth de la PC.
# Mapea el puerto 3000 de la PC al puerto 3000 del dispositivo Android,
# de forma que la app pueda seguir usando su DEFAULT_EMU_URL
# (http://localhost:3000) con el teléfono conectado por USB (o WiFi-Adb).
#
# Uso:  powershell -File scripts\android-dev-reverse.ps1
# Deshacer:  adb reverse --remove tcp:3000

$ErrorActionPreference = "Stop"

$raw = adb devices 2>$null
$connected = ($raw | Where-Object { $_ -match "device\s*$" }).Count
if ($connected -eq 0) {
    Write-Output "Sin dispositivo Android por adb (necesita USB o adb-wifi)."
    Write-Output "Permitir dep USB en el movil y reintentar."
    exit 1
}

adb reverse tcp:3000 tcp:3000
# (Si algún día el login pide también el Game server por HTTP desde la
# WebView, añadir: adb reverse tcp:<puerto-del-game> tcp:<puerto>)

Write-Output "adb reverse listo:"
Write-Output "  movil -> localhost:3000 = AUTH de la PC"
Write-Output "En Settings de la app deja la URL en la por defecto (http://localhost:3000)."
