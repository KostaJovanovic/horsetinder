@echo off
setlocal enabledelayedexpansion
title Horse Tinder save
cd /d "%~dp0"

rem Git helper, and the signed Android build. The shape is mbrd's save.bat.
rem
rem Every commit stamps a version into www\js\version.js: the About line in the
rem app shows it, and android\app\build.gradle reads it for versionCode and
rem versionName. Android refuses an update whose versionCode does not grow, so
rem the count only ever goes up.
rem
rem   save.bat            the menu
rem   save.bat save       add + commit + push
rem   save.bat commit     add + commit, no push
rem   save.bat release    build the signed APK here, commit, push, then GitHub
rem                       builds it again and publishes it for the app's updater
rem   save.bat apk        the signed APK here, into dist\, and onto any phone
rem                       connected over USB. No commit.
rem   save.bat keystore   make the signing key once, and give it to GitHub
rem   save.bat pull / push

set "REPO_URL=https://github.com/KostaJovanovic/horsetinder.git"
set "GH_REPO=KostaJovanovic/horsetinder"
set "UPDATE_FEED=https://api.github.com/repos/KostaJovanovic/horsetinder-release/releases/latest"
set "APK_OUT=android\app\build\outputs\apk\release\app-release.apk"

set FORCE_MODE=0
set COMMIT_ONLY=0
set RELEASE_MODE=0
set SAVE_ERROR=0
set ACTION=%~1

call :resolvebranch

rem set "VAR=value" and not set VAR=value: inside parentheses the unquoted form
rem keeps the space before "&", and "1 " never equals "1".
if /i "%ACTION%"=="--force"   (set "FORCE_MODE=1" & set "ACTION=save")
if /i "%ACTION%"=="commit"    (set "COMMIT_ONLY=1" & set "ACTION=save")
if /i "%ACTION%"=="--no-push" (set "COMMIT_ONLY=1" & set "ACTION=save")
if /i "%ACTION%"=="release"   (set "RELEASE_MODE=1" & set "ACTION=save")
if /i "%ACTION%"=="save"     goto checkrepo
if /i "%ACTION%"=="push"     goto push
if /i "%ACTION%"=="pull"     goto pull
if /i "%ACTION%"=="apk"      goto apkonly
if /i "%ACTION%"=="keystore" goto keystore

:menu
echo.
echo === Horse Tinder ===
echo.
echo   1  commit      add + commit, no push
echo   2  save        add + commit + push
echo   3  release     build signed APK here, commit + push, GitHub builds and publishes it
echo   4  apk         build signed APK here and install it on a USB phone, no commit
echo   5  pull        pull current branch
echo   6  push        push current branch
echo   7  keystore    make the signing key, and give it to GitHub
echo   8  quit
echo.
set "CHOICE="
set /p CHOICE=select [1-8]:
if "%CHOICE%"=="1" (set "COMMIT_ONLY=1" & goto checkrepo)
if "%CHOICE%"=="2" goto checkrepo
if "%CHOICE%"=="3" (set "RELEASE_MODE=1" & goto checkrepo)
if "%CHOICE%"=="4" goto apkonly
if "%CHOICE%"=="5" goto pull
if "%CHOICE%"=="6" goto push
if "%CHOICE%"=="7" goto keystore
if "%CHOICE%"=="8" exit /b 0
echo [err]  invalid choice
goto menu


rem The folder starts life without git, so the first save makes the repo and
rem points it at GitHub instead of failing with a wall of errors.
:checkrepo
if exist ".git" goto save
echo.
echo [warn] no git repository here yet
set /p DOINIT=run "git init" and use %REPO_URL%? (y/n):
if /i not "%DOINIT%"=="y" (
  echo [git]  skipped - nothing to commit into
  set SAVE_ERROR=1
  goto end
)
git init -b main
if errorlevel 1 (
  echo [err]  git init failed
  set SAVE_ERROR=1
  goto end
)
git remote add origin %REPO_URL%
call :resolvebranch
echo [git]  initialised, remote origin is %REPO_URL%
goto save


:save
echo.
echo === git: save ===
echo.

rem An unfinished merge must never reach "git add ." - it would stage the
rem conflict markers and record the conflict as settled.
set UNMERGED=
for /f "delims=" %%u in ('git diff --name-only --diff-filter=U 2^>nul') do set UNMERGED=1
if defined UNMERGED (
  echo [err]  unresolved merge conflicts - resolve these first:
  git diff --name-only --diff-filter=U
  set SAVE_ERROR=1
  goto end
)

rem A release is signed here first, so a missing key stops it before anything
rem is stamped.
if "%RELEASE_MODE%"=="1" if not exist "android\keystore.properties" (
  echo [err]  no signing key here yet - run "save.bat keystore" first
  set SAVE_ERROR=1
  goto end
)

rem The count is read from the committed version.js, and the history can only
rem push it up: a plain `git commit` stamps nothing, and a squash or a fresh
rem clone shrinks rev-list. The larger wins, so the count never falls.
set COMMIT_COUNT=
for /f %%i in ('powershell -NoProfile -Command "$m=[regex]::Match((Get-Content 'www/js/version.js' -Raw -Encoding UTF8),'count:\s*(\d+),'); if($m.Success){$m.Groups[1].Value}"') do set COMMIT_COUNT=%%i
if not defined COMMIT_COUNT goto countfail
set /a NEXT_COUNT=%COMMIT_COUNT%+1
set GIT_COUNT=0
for /f %%i in ('git rev-list --count HEAD 2^>nul') do set GIT_COUNT=%%i
set /a GIT_NEXT=%GIT_COUNT%+1
if %GIT_NEXT% GTR %NEXT_COUNT% set NEXT_COUNT=%GIT_NEXT%
for /f %%v in ('powershell -NoProfile -Command "'0.{0:D2}' -f %NEXT_COUNT%"') do set VERLABEL=%%v
echo bump: v%VERLABEL% (commit %NEXT_COUNT%)

rem Keep version.js as it was, so every error exit before the commit puts it
rem back (:unstamp) and the next save uses the same number again.
set "STAMP_VERSION=%TEMP%\horsetinder-save-version.js"
copy /y "www\js\version.js" "%STAMP_VERSION%" >nul
if errorlevel 1 (
  echo [err]  could not keep a copy of www\js\version.js - not saving
  set SAVE_ERROR=1
  goto end
)
rem [char]34 and \x22 stand for the double quote, which cannot sit inside cmd's own quotes.
powershell -NoProfile -Command "$q=[char]34; $p='www/js/version.js'; $t=[IO.File]::ReadAllText($p); $t=[regex]::Replace($t,'count:\s*\d*,\s*label:\s*\x22[^\x22]*\x22','count: %NEXT_COUNT%, label: '+$q+'%VERLABEL%'+$q); [IO.File]::WriteAllText($p,$t)"
if errorlevel 1 (
  echo [err]  could not stamp www\js\version.js
  call :unstamp
  set SAVE_ERROR=1
  goto end
)

rem A release builds the signed APK before the commit: a build that fails
rem stops the release with nothing committed, and the APK in dist\ is the
rem version being committed.
if "%RELEASE_MODE%"=="1" (
  call :buildapk
  if errorlevel 1 (
    call :unstamp
    set SAVE_ERROR=1
    goto end
  )
)

echo [git]  stage
git add .
git status --short

echo.
rem The message never goes through a command line: with delayed expansion on,
rem `git commit -m` would eat every "!" in it. PowerShell writes it as UTF-8.
set "MSG="
set /p "MSG=commit message [v%VERLABEL%]: "
if not defined MSG set "MSG=v%VERLABEL%"
set "MSGFILE=%TEMP%\horsetinder-save-message.txt"
powershell -NoProfile -Command "[IO.File]::WriteAllText($env:MSGFILE, $env:MSG)"
git commit -F "%MSGFILE%"
if errorlevel 1 (
  echo.
  echo [err]  git commit failed
  call :unstamp
  set SAVE_ERROR=1
  goto end
)
del "%STAMP_VERSION%" "%MSGFILE%" >nul 2>nul
call :resolvebranch

if "%COMMIT_ONLY%"=="1" goto committed

if "%REMOTE%"=="" (
  echo.
  echo [git]  committed v%VERLABEL% - no remote configured, nothing pushed
  echo        add one with: git remote add origin %REPO_URL%
  if "%RELEASE_MODE%"=="1" echo [warn] nothing was pushed, so GitHub built nothing
  goto end
)

if "%FORCE_MODE%"=="1" goto forcepush
if "%BRANCH%"=="" goto nobranch
echo.
set /p DOPUSH=push to %REMOTE%/%BRANCH%? (y/n):
if /i not "%DOPUSH%"=="y" goto skipped

git push -u %REMOTE% %BRANCH%
if not errorlevel 1 goto pushed

rem Only a non-fast-forward is worth offering a pull or a force for. If the
rem remote cannot even be reached, say that instead.
git ls-remote %REMOTE% >nul 2>nul
if errorlevel 1 (
  echo.
  echo [err]  push failed - cannot reach or authenticate to %REMOTE%
  echo        check access to the remote, then rerun. The commit is saved locally.
  set SAVE_ERROR=1
  goto end
)
echo.
echo [warn] push rejected - remote is ahead of local
set /p FETCH=pull + merge remote first? (y/n):
if /i "%FETCH%"=="y" goto fetch
echo.
echo [warn] a force push discards whatever is on %REMOTE%/%BRANCH% that you do not have.
set /p FORCE=force push instead? (y/n):
if /i "%FORCE%"=="y" goto forcepush
echo [git]  skipped - nothing pushed
set SAVE_ERROR=1
goto end

:fetch
git pull %REMOTE% %BRANCH%
if errorlevel 1 set SAVE_ERROR=1
echo.
echo [git]  pulled - resolve any conflicts, then re-run
goto end

:forcepush
if "%BRANCH%"=="" goto nobranch
git push %REMOTE% %BRANCH% --force-with-lease
if errorlevel 1 (
  echo.
  echo [err]  force push refused - %REMOTE%/%BRANCH% moved since the last fetch, or the push failed
  echo        nothing on the remote was overwritten. The commit is saved locally.
  set SAVE_ERROR=1
  goto end
)
echo.
echo [git]  force pushed %REMOTE%/%BRANCH%
if "%RELEASE_MODE%"=="1" call :runrelease
goto end

:pushed
echo.
echo [git]  pushed %REMOTE%/%BRANCH%
if "%RELEASE_MODE%"=="1" (
  call :runrelease
  call :installphones
)
goto end

:skipped
echo.
echo [git]  push skipped
if "%RELEASE_MODE%"=="1" echo [warn] nothing was pushed, so GitHub built nothing
goto end

:committed
echo.
echo [git]  committed v%VERLABEL% (local, not pushed)
goto end


rem Release: GitHub builds the same commit, signs it with the same key, and
rem publishes it to horsetinder-release, where installed apps look for
rem updates. Non-fatal: the commit and push already happened, and the Actions
rem tab can start it by hand.
:runrelease
where gh >nul 2>nul
if errorlevel 1 (
  echo [warn] gh, the GitHub CLI, is not installed - start "Release app" from the Actions tab
  exit /b 0
)
echo.
echo [gh]   start Release app for v%VERLABEL%
gh workflow run release.yml -R %GH_REPO% --ref %BRANCH% -f publish=true
if errorlevel 1 (
  echo [warn] gh could not start Release app - is it logged in? Start it from the Actions tab
  exit /b 0
)
echo [gh]   started - installed apps see the update when it finishes:
echo        https://github.com/%GH_REPO%/actions/workflows/release.yml
exit /b 0


:push
echo.
echo === git: push ===
echo.
if "%BRANCH%"=="" goto nobranch
if "%REMOTE%"=="" goto noremote
git push %REMOTE% %BRANCH%
if errorlevel 1 (
  echo.
  echo [warn] a force push discards whatever is on %REMOTE%/%BRANCH% that you do not have.
  set /p FORCE=push failed. force push? (y/n):
  if /i "!FORCE!"=="y" (
    git push %REMOTE% %BRANCH% --force-with-lease
    if errorlevel 1 set SAVE_ERROR=1
  ) else (
    set SAVE_ERROR=1
  )
)
goto end


:pull
echo.
echo === git: pull ===
echo.
if "%BRANCH%"=="" goto nobranch
if "%REMOTE%"=="" goto noremote
git pull %REMOTE% %BRANCH%
if errorlevel 1 set SAVE_ERROR=1
goto end


rem Option 4: the signed APK from the files on disk, then onto every phone
rem connected over USB. No stamp, no commit: it carries the version of the last
rem save, so it is for trying a signed build, not for shipping one.
:apkonly
echo.
echo === signed APK ===
echo.
if not exist "android\keystore.properties" (
  echo [err]  no signing key here yet - run "save.bat keystore" first
  set SAVE_ERROR=1
  goto end
)
for /f %%v in ('powershell -NoProfile -Command "$m=[regex]::Match((Get-Content 'www/js/version.js' -Raw -Encoding UTF8),'label:\s*\x22([^\x22]*)\x22'); if($m.Success){$m.Groups[1].Value}"') do set VERLABEL=%%v
call :buildapk
if errorlevel 1 (
  set SAVE_ERROR=1
  goto end
)
call :installphones
goto end


rem Option 7: the signing key. tools\keystore.ps1 makes it once, outside the
rem repo, writes android\keystore.properties, and offers to set the GitHub
rem secrets so both builds sign alike.
:keystore
echo.
echo === keystore ===
call :findjdk
if not defined HT_JDK (
  echo [err]  keytool needs a JDK 21, and none was found - unzip one into %USERPROFILE%\.jdks\
  set SAVE_ERROR=1
  goto end
)
powershell -NoProfile -ExecutionPolicy Bypass -File tools\keystore.ps1 -Java "%HT_JDK%"
if errorlevel 1 set SAVE_ERROR=1
goto end


rem The signed release APK, into dist\horsetinder-android-<version>.apk. It
rem carries the update feed, like the GitHub build, so a phone it goes on keeps
rem itself up to date. Returns 1 on any failure.
:buildapk
call :findjdk
if not defined HT_JDK (
  echo [err]  Gradle needs JDK 21 or newer, and none was found - unzip one into %USERPROFILE%\.jdks\
  exit /b 1
)
set "JAVA_HOME=%HT_JDK%"
if not exist "node_modules\@capacitor\cli" (
  echo [npm]  first run - installing dependencies
  call npm install --no-audit --no-fund
  if errorlevel 1 exit /b 1
)
echo [bld]  sync www into the Android project
call npx cap sync android
if errorlevel 1 (
  echo [err]  cap sync failed
  exit /b 1
)
echo [bld]  signed APK v%VERLABEL% with %JAVA_HOME%
pushd android
call .\gradlew.bat assembleRelease "-PhorseUpdateFeed=%UPDATE_FEED%"
set "HT_ERR=!errorlevel!"
popd
if not "%HT_ERR%"=="0" (
  echo [err]  the APK did not build - see above
  exit /b 1
)
if not exist "dist" mkdir dist
copy /y "%APK_OUT%" "dist\horsetinder-android-%VERLABEL%.apk" >nul
if errorlevel 1 (
  echo [err]  could not copy the APK into dist\
  exit /b 1
)
set "HT_APK=dist\horsetinder-android-%VERLABEL%.apk"
echo [bld]  built %HT_APK%
exit /b 0


rem Onto every phone connected over USB. Never fatal.
:installphones
if not defined HT_APK exit /b 0
set "HT_ADB=adb"
where adb >nul 2>nul
if errorlevel 1 set "HT_ADB=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
if not "%HT_ADB%"=="adb" if not exist "%HT_ADB%" (
  echo [adb]  adb not found - install %HT_APK% by hand
  exit /b 0
)
set "HT_PHONES=0"
for /f "skip=1 tokens=1,2" %%a in ('"%HT_ADB%" devices') do if "%%b"=="device" call :phone %%a
if "%HT_PHONES%"=="0" echo [adb]  no phone connected - %HT_APK% is ready to install by hand
exit /b 0

rem One phone: %1 is its serial.
:phone
echo.
echo [adb]  installing on %1
set /a HT_PHONES+=1
set "HT_LOG=%TEMP%\horsetinder-install.txt"
"%HT_ADB%" -s %1 install -r "%HT_APK%" > "%HT_LOG%" 2>&1
type "%HT_LOG%"
findstr /c:"Success" "%HT_LOG%" >nul
if not errorlevel 1 goto phonestart
rem A copy signed with another key - the debug builds - blocks the update.
rem Replacing it means uninstalling, which deletes its profile, matches and
rem chats, so that is asked, never assumed.
findstr /c:"INSTALL_FAILED_UPDATE_INCOMPATIBLE" /c:"signatures do not match" "%HT_LOG%" >nul
if errorlevel 1 (
  echo [adb]  could not install on %1 - see above
  exit /b 0
)
echo.
echo [warn] %1 has a copy signed with a different key, likely a debug build.
echo        Replacing it uninstalls it first, which DELETES its profile, matches
echo        and chats on that phone.
set "HT_UNINST="
set /p HT_UNINST=uninstall it and install the signed one? (y/n):
if /i not "%HT_UNINST%"=="y" (
  echo [adb]  left %1 as it was
  exit /b 0
)
"%HT_ADB%" -s %1 uninstall com.horsetinder.app
"%HT_ADB%" -s %1 install "%HT_APK%"
if errorlevel 1 (
  echo [adb]  could not install on %1 - see above
  exit /b 0
)
:phonestart
"%HT_ADB%" -s %1 shell monkey -p com.horsetinder.app -c android.intent.category.LAUNCHER 1 >nul 2>nul
rem Sunmi's installer service closes a freshly installed app a few seconds
rem after it starts, so on a Sunmi it is started again once that has passed.
set "HT_MAKER="
for /f "delims=" %%m in ('"%HT_ADB%" -s %1 shell getprop ro.product.manufacturer') do set "HT_MAKER=%%m"
if /i "%HT_MAKER%"=="SUNMI" (
  timeout /t 9 /nobreak >nul
  "%HT_ADB%" -s %1 shell am force-stop com.horsetinder.app
  "%HT_ADB%" -s %1 shell monkey -p com.horsetinder.app -c android.intent.category.LAUNCHER 1 >nul 2>nul
)
echo [adb]  started on %1
exit /b 0


rem A JDK 21 or newer into HT_JDK. The first hit wins. As mbrd's mobile.bat.
:findjdk
set "HT_JDK="
if defined JAVA_HOME call :tryjdk "%JAVA_HOME%"
for /d %%d in ("%USERPROFILE%\.jdks\*") do call :tryjdk "%%~d"
call :tryjdk "%ProgramFiles%\Android\Android Studio\jbr"
call :tryjdk "%LOCALAPPDATA%\Programs\Android Studio\jbr"
for /d %%d in ("%ProgramFiles%\Eclipse Adoptium\jdk-2*" "%ProgramFiles%\Microsoft\jdk-2*" "%ProgramFiles%\Java\jdk-2*") do call :tryjdk "%%~d"
exit /b 0

rem `java -version` prints `version "21.0.12"`. The dot stands for the quote.
:tryjdk
if defined HT_JDK exit /b 0
if not exist "%~1\bin\java.exe" exit /b 0
"%~1\bin\java.exe" -version 2>&1 | findstr /r /c:"version .2[1-9]" /c:"version .[3-9][0-9]" >nul && set "HT_JDK=%~1"
exit /b 0


rem The checked-out branch into BRANCH (empty with no repo, or a detached
rem HEAD), and the remote to use into REMOTE: the branch's upstream, then
rem origin, then the first remote there is.
:resolvebranch
set BRANCH=
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set BRANCH=%%b
if /i "%BRANCH%"=="HEAD" set BRANCH=
set REMOTE=
if not "%BRANCH%"=="" for /f "delims=" %%r in ('git config branch.%BRANCH%.remote 2^>nul') do set REMOTE=%%r
if not "%REMOTE%"=="" exit /b 0
git remote get-url origin >nul 2>nul
if not errorlevel 1 (set "REMOTE=origin" & exit /b 0)
for /f "delims=" %%r in ('git remote 2^>nul') do if "!REMOTE!"=="" set REMOTE=%%r
exit /b 0

:nobranch
echo.
echo [err]  no branch checked out (detached HEAD?) - not pushing
set SAVE_ERROR=1
goto end

:noremote
echo.
echo [err]  no remote configured - add one with: git remote add origin %REPO_URL%
set SAVE_ERROR=1
goto end

:countfail
echo.
echo [err]  could not read the count from www\js\version.js - not saving
echo        expected a line like:  window.HORSE_VERSION = { count: 12, label: "0.12" };
echo        a wrong count could send versionCode backwards, and Android then
echo        refuses the update on every installed copy.
set SAVE_ERROR=1
goto end

rem Put version.js back from the copy made before the stamp.
:unstamp
copy /y "%STAMP_VERSION%" "www\js\version.js" >nul
if errorlevel 1 (
  echo [warn] could not put www\js\version.js back - restore it from %STAMP_VERSION%
  exit /b 0
)
del "%STAMP_VERSION%" >nul 2>nul
echo        the version stamp is put back - the next save is v%VERLABEL% again.
exit /b 0


:end
echo.
pause
exit /b %SAVE_ERROR%
