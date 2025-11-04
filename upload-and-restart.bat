@echo off
setlocal

@REM Skrypt na stary telefon

@REM Change working directory to script’s directory
cd /d "%~dp0"
@REM === Load SSH/rsync connection parameters ===
if exist params.bat (
	call params.bat
) else if exist params-example.bat (
	echo WARNING: params.bat not found, using params-example.bat instead.
	call params-example.bat
	echo Copying params-example.bat to params.bat
	copy params-example.bat params.bat
) else (
	echo ERROR: Neither params.bat nor params-example.bat found.
	exit /b
)
if %errorlevel% neq 0 exit /b %errorlevel%

cd /d "%SSH_COPY_FOLDER%"

echo === Syncing files ===
set args=
set args=%args% --username %USERNAME%
set args=%args% --hostname %HOSTNAME%
set args=%args% --port %PORT%
set args=%args% --local-folder "G:/Biblioteki Windows/Dokumenty/1. Mój Folder/Informatyka/Skrypty na telefon/node-js-server"
set args=%args% --remote-folder "%REMOTE_FOLDER%"
set args=%args% --create-dest-folder
set args=%args% --recursive
set args=%args% --mode copy
set args=%args% --exclude-files  server.pid  server.log  *.bat
set args=%args% --exclude-folders  node_modules  .git

python SSH_SYNC.py %args%
if %errorlevel% neq 0 exit /b %errorlevel%

echo:
echo === Restarting Node.js server ===
@REM -l = --login
ssh -p %PORT% "%USERNAME%@%HOSTNAME%" "cd %REMOTE_FOLDER% && bash -l start-server.sh"
if %errorlevel% neq 0 exit /b %errorlevel%

