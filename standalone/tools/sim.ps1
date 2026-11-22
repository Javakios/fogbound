# Runs the firmware in the Wokwi simulator from the terminal and saves a screenshot of the TFT.
# Usage (from the standalone folder):
#   $env:WOKWI_CLI_TOKEN = "your token"     # from https://wokwi.com/dashboard/ci
#   python -m platformio run                 # build first
#   .\tools\sim.ps1                          # default: 25 s of simulation, screenshot at 12 s
#   .\tools\sim.ps1 -Seconds 60 -ShotAt 40
# The CLI is installed once with:  iwr https://wokwi.com/ci/install.ps1 -useb | iex
param([int]$Seconds = 25, [int]$ShotAt = 12)
if (-not $env:WOKWI_CLI_TOKEN) { Write-Error "Set WOKWI_CLI_TOKEN first."; exit 1 }
$out = Join-Path $PSScriptRoot "..\sim-out"
New-Item -ItemType Directory -Force $out | Out-Null
wokwi-cli --timeout ($Seconds * 1000) --timeout-exit-code 0 `
  --serial-log-file "$out\serial.txt" `
  --screenshot-part tft --screenshot-time ($ShotAt * 1000) --screenshot-file "$out\tft.png" `
  (Join-Path $PSScriptRoot "..")
Write-Host "Serial log:  $out\serial.txt"
Write-Host "Screenshot:  $out\tft.png   (raw panel orientation: rotated 90 degrees)"
Start-Process "$out\tft.png"
