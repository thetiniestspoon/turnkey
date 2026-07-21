@echo off
REM Turnkey nightly agent harness — registered via schtasks at 02:30 daily.
REM Kill switch: set TURNKEY_AUTONOMY_OFF=1 in .env to disable without unregistering.
REM Register:
REM   schtasks /Create /TN "TurnkeyNightly" /TR "\"%~dp0run-nightly.bat\"" /SC DAILY /ST 02:30 /F
REM Delete:
REM   schtasks /Delete /TN "TurnkeyNightly" /F
cd /d "%~dp0..\.."
call npx tsx scripts/agents/run-nightly.ts >> "scripts\agents\nightly.log" 2>&1
