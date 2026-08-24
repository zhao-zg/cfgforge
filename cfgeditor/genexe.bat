@echo off
REM ============================================================
REM  cfgeditor 构建脚本：生成含内置后端的单 EXE
REM
REM  前置条件：
REM    - Java 25+（用于 jlink 和 gradle）
REM    - Rust toolchain（cargo / rustc）
REM    - Node.js + pnpm
REM
REM  产物：cfgeditor.exe（含内置 JRE + cfggen.jar）
REM ============================================================

setlocal enabledelayedexpansion

REM --- 1. 构建 cfggen.jar ---
echo [1/4] Building cfggen.jar...
set "JAVA_HOME=%JAVA_HOME%"
if not defined JAVA_HOME (
    echo ERROR: JAVA_HOME not set. Please set JAVA_HOME to JDK 25+.
    exit /b 1
)

pushd ..\app
call gradlew.bat fatJar --no-daemon
if errorlevel 1 (
    echo ERROR: fatJar build failed.
    popd
    exit /b 1
)
popd

REM --- 2. 拷贝 jar 到 resources ---
echo [2/4] Copying cfggen.jar to resources...
if not exist src-tauri\resources mkdir src-tauri\resources
copy /B /Y ..\app\build\libs\cfggen.jar src-tauri\resources\cfggen.jar
if errorlevel 1 (
    echo ERROR: Failed to copy cfggen.jar.
    exit /b 1
)

REM --- 3. 用 jlink 生成精简 JRE ---
echo [3/4] Generating minimal JRE with jlink...
if exist src-tauri\resources\jre rmdir /S /Q src-tauri\resources\jre

jlink ^
    --add-modules java.base,java.logging,java.xml,jdk.httpserver,jdk.unsupported,java.compiler ^
    --bind-services ^
    --strip-debug ^
    --no-header-files ^
    --no-man-pages ^
    --output src-tauri\resources\jre

if errorlevel 1 (
    echo ERROR: jlink failed. Make sure JAVA_HOME points to JDK 25+.
    exit /b 1
)

echo JRE size:
dir /s src-tauri\resources\jre | findstr "File(s)"

REM --- 4. 构建 Tauri EXE ---
echo [4/4] Building Tauri desktop app...
call pnpm tauri build
if errorlevel 1 (
    echo ERROR: Tauri build failed. Make sure Rust is installed.
    exit /b 1
)

REM --- 拷贝最终 EXE ---
echo Copying final EXE...
copy /B /Y src-tauri\target\release\cfgeditor.exe cfgeditor.exe

echo.
echo Build complete! cfgeditor.exe is ready.
echo It includes a built-in Java backend - no Java installation required on target machines.
pause
