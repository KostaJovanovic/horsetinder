@echo off
title Horse Tinder server
cd /d "%~dp0"

rem 46773 is "horse" on a phone keypad. Off the well-worn ports (3000, 5173,
rem 8000, 8080) so this never fights another project for one.
set PORT=46773

rem Free the port so every launch is a fresh instance - but only from a process
rem that is recognisably a previous run of this script: a python process whose
rem command line mentions this repo's serve.py. Anything else is reported and
rem left alone, and the server below then fails to bind and says so.
powershell -NoProfile -Command ^
  "$mine = '%~dp0tools\serve.py'.Replace('\\','\');" ^
  "Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue |" ^
  "  Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -ne 0 } | ForEach-Object {" ^
  "    $p = Get-CimInstance Win32_Process -Filter \"ProcessId = $_\" -ErrorAction SilentlyContinue;" ^
  "    if ($p -and $p.CommandLine -and $p.CommandLine.Replace('/','\') -like ('*' + $mine + '*')) {" ^
  "      Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue" ^
  "    } elseif ($p) {" ^
  "      Write-Host ('Port %PORT% is held by PID ' + $p.ProcessId + ': ' + $p.Name) -ForegroundColor Yellow;" ^
  "      Write-Host ('  ' + $p.CommandLine) -ForegroundColor DarkGray;" ^
  "      Write-Host '  Not this project''s server - leaving it alone.' -ForegroundColor Yellow" ^
  "    }" ^
  "  }"

echo.
echo   Local: http://localhost:%PORT%
echo   Phone: scan the QR below (same Wi-Fi)
echo.

start "" "http://localhost:%PORT%"
rem tools\serve.py serves www\ - the same files the APK carries - and prints a
rem QR for the LAN address. It finds that address from the network route, which
rem beats the first "IPv4" line of ipconfig (often a WSL or Hyper-V adapter).
python tools\serve.py %PORT% %LOCAL_IP%
pause
