@echo off
REM ============================================================
REM  release.bat - tag & push to trigger GitHub Actions release build
REM
REM  Workflow:
REM   1. Check git working tree is clean
REM   2. Check current branch is master
REM   3. Check local master is in sync with origin/master
REM   4. Input version (auto prefix 'v', validate x.y.z format)
REM   5. Verify CHANGELOG has an entry for this version
REM   6. Verify the tag does not exist locally or remotely
REM   7. Create annotated tag and push to origin
REM   8. GitHub Actions release.yml builds all artifacts and publishes
REM
REM  NOTE: Keep this file pure ASCII to avoid cmd codepage issues.
REM ============================================================

setlocal enabledelayedexpansion

set "REMOTE=origin"
set "VERSION="

echo.
echo ============================================
echo   cfggen release - tag and push
echo ============================================
echo.

REM --- 1. Check git working tree is clean ---
echo [1/5] Checking git working tree...
set "DIRTY="
for /f "delims=" %%i in ('git status --porcelain') do set DIRTY=1
if defined DIRTY (
    echo   [ERROR] Working tree is not clean. Commit or stash first.
    echo   ------------------------------------------------------------
    git status --short
    echo   ------------------------------------------------------------
    pause
    exit /b 1
)
echo   [OK] Working tree is clean.
echo.

REM --- 2. Check current branch ---
set "BRANCH="
for /f "delims=" %%i in ('git branch --show-current') do set BRANCH=%%i
echo   [INFO] Current branch: %BRANCH%
if not "%BRANCH%"=="master" (
    echo   [WARN] Suggested branch is master (current: %BRANCH%).
    echo         Press Ctrl+C to abort, or continue.
)
echo.

REM --- 3. Check local master is in sync with origin/master ---
echo [2/5] Checking sync with origin/master...
for /f "usebackq delims=" %%a in (`git rev-list --left-right --count origin/master...master 2^>nul`) do set "SYNC=%%a"
if "%SYNC%"=="" (
    echo   [WARN] Cannot get origin/master status, skipping sync check.
) else (
    for /f "tokens=1,2" %%a in ("%SYNC%") do (
        set "AHEAD=%%a"
        set "BEHIND=%%b"
    )
    REM Note: rev-list --left-right outputs "behind ahead"
    if not "%AHEAD%"=="0" (
        echo   [ERROR] Local master is %AHEAD% commits AHEAD of origin/master.
        echo           Please push first: git push %REMOTE% master
        pause
        exit /b 1
    )
    if not "%BEHIND%"=="0" (
        echo   [ERROR] Local master is %BEHIND% commits BEHIND origin/master.
        echo           Please pull first: git pull %REMOTE% master
        pause
        exit /b 1
    )
    echo   [OK] Local master is in sync with origin/master.
)
echo.

REM --- 4. Input version ---
echo [3/5] Enter version (e.g. 1.4.0 or v1.4.0)
set /p VERSION=  Version: 
if "%VERSION%"=="" (
    echo   [ERROR] Version cannot be empty.
    pause
    exit /b 1
)

REM Auto prefix 'v'
if not "%VERSION:~0,1%"=="v" set "VERSION=v%VERSION%"

REM Validate format: vN.N.N
echo %VERSION%| findstr /R "^v[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*$" >nul
if errorlevel 1 (
    echo   [ERROR] Invalid version format: %VERSION%
    echo          Expected: vMajor.Minor.Patch  (e.g. v1.4.0)
    pause
    exit /b 1
)
echo   [OK] Using tag: %VERSION%
echo.

REM --- 5. Verify CHANGELOG entry (CI uses it for release notes) ---
if exist CHANGELOG.md (
    findstr /C:"### [%VERSION%]" CHANGELOG.md >nul 2>&1
    if errorlevel 1 (
        echo   [WARN] CHANGELOG.md has no "### [%VERSION%]" entry.
        echo         CI will use default release notes, consider adding one.
    ) else (
        echo   [OK] CHANGELOG already has an entry for %VERSION%.
    )
) else (
    echo   [WARN] CHANGELOG.md not found.
)
echo.

REM --- 6. Check tag does not exist locally or remotely ---
echo [4/5] Checking if tag already exists...
git rev-parse -q --verify "refs/tags/%VERSION%" >nul 2>&1
if not errorlevel 1 (
    echo   [ERROR] Tag %VERSION% already exists locally. Use another version.
    pause
    exit /b 1
)
git ls-remote --tags %REMOTE% "%VERSION%" 2>nul | findstr /C:"%VERSION%" >nul
if not errorlevel 1 (
    echo   [ERROR] Tag %VERSION% already exists on %REMOTE%. Use another version.
    pause
    exit /b 1
)
echo   [OK] Tag %VERSION% does not exist locally or on %REMOTE%.
echo.

REM --- 7. Create annotated tag and push ---
echo [5/5] Creating annotated tag %VERSION% ...
git tag -a %VERSION% -m "Release %VERSION%"
if errorlevel 1 (
    echo   [ERROR] Failed to create tag.
    pause
    exit /b 1
)

echo.
echo   [CONFIRM] Push annotated tag %VERSION% to %REMOTE%? This triggers GitHub Actions.
echo          Artifacts: cfggen.jar + cfgeditor (win/linux/mac) + source zip
echo.
set /p CONFIRM=  Push now? (y/N): 
if /i not "%CONFIRM%"=="y" (
    echo   Cancelled. Local tag was created but NOT pushed. To remove:
    echo       git tag -d %VERSION%
    pause
    exit /b 0
)

git push %REMOTE% %VERSION%
if errorlevel 1 (
    echo   [ERROR] Failed to push tag. Check network and permissions.
    echo         Local tag still exists, retry: git push %REMOTE% %VERSION%
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Tag %VERSION% pushed to %REMOTE%!
echo   GitHub Actions triggered.
echo   Progress: https://github.com/zhao-zg/cfggen/actions
echo   Release:  https://github.com/zhao-zg/cfggen/releases
echo ============================================
echo.
pause
endlocal