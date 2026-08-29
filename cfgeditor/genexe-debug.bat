@echo off
set "PATH=C:\Users\zzg\.local\share\TeleAgent\runtimes\node;%PATH%"
call pnpm tauri build --debug
copy /B /Y src-tauri\target\debug\cfgeditor.exe cfgeditor-d.exe
