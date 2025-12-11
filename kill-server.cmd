@echo off
setlocal

@REM Skrypt na stary telefon

@REM Change working directory to script’s directory
cd /d "%~dp0"
call params.bat

ssh -p %PORT% "%USERNAME%@%HOSTNAME%" "cd %REMOTE_FOLDER% && bash --login kill-server.sh"

