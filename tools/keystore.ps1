# The release signing key, made once and kept forever. Called by save.bat
# (menu: keystore); it can also run on its own:
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\keystore.ps1 -Java <jdk>
#
# 1. Makes %USERPROFILE%\.keystores\horsetinder-release.jks - outside the repo,
#    so no "git add ." can ever pick it up. An existing keystore is never
#    replaced: a new key means Android refuses every update to phones that
#    already have the app, until it is uninstalled and its data lost.
# 2. Writes android\keystore.properties (gitignored), which build.gradle reads
#    for a local signed build.
# 3. Offers to put the same key into the GitHub secrets the release workflow
#    reads, so a build made on GitHub and one made here are signed alike and
#    update each other.
#
# The password is read hidden and handed to keytool and gh through the
# environment or stdin, never on a command line.
param(
    [Parameter(Mandatory = $true)][string]$Java,
    [string]$Repo = "KostaJovanovic/horsetinder"
)
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $env:USERPROFILE ".keystores"
$store = Join-Path $dir "horsetinder-release.jks"
$props = Join-Path $root "android\keystore.properties"
$alias = "horsetinder"
$keytool = Join-Path $Java "bin\keytool.exe"

function Plain([Security.SecureString]$s) {
    $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

function Read-Props {
    $h = @{}
    foreach ($line in Get-Content $props) {
        if ($line -match '^\s*([^#=]+?)\s*=\s*(.*)$') { $h[$Matches[1]] = $Matches[2] }
    }
    $h
}

if (Test-Path $store) {
    Write-Host "[key]  the keystore is already there: $store" -ForegroundColor Green
    Write-Host "       it is never replaced - a new key would strand every installed copy."
    if (-not (Test-Path $props)) {
        $pw = Plain (Read-Host "its password (hidden)" -AsSecureString)
    } else {
        $pw = (Read-Props)["storePassword"]
    }
} else {
    if (-not (Test-Path $keytool)) { throw "keytool not found in $Java" }
    Write-Host ""
    Write-Host "[key]  making the release keystore: $store"
    Write-Host "       pick a password of 6+ characters. Write it down somewhere safe."
    while ($true) {
        $a = Plain (Read-Host "password (hidden)" -AsSecureString)
        $b = Plain (Read-Host "again (hidden)" -AsSecureString)
        if ($a -ne $b) { Write-Host "       they don't match, try again" -ForegroundColor Yellow; continue }
        if ($a.Length -lt 6) { Write-Host "       6 characters at least" -ForegroundColor Yellow; continue }
        $pw = $a; break
    }
    New-Item -ItemType Directory -Force $dir | Out-Null
    $env:HT_KEY_PW = $pw
    try {
        & $keytool -genkeypair -v -keystore $store -storetype PKCS12 -alias $alias -keyalg RSA -keysize 2048 -validity 10000 `
            -dname "CN=Horse Tinder, O=KostaJovanovic" -storepass:env HT_KEY_PW -keypass:env HT_KEY_PW | Out-Host
        if ($LASTEXITCODE -ne 0) { throw "keytool failed" }
    } finally {
        Remove-Item Env:HT_KEY_PW -ErrorAction SilentlyContinue
    }
    Write-Host ""
    Write-Host "[key]  made. BACK THIS FILE UP, with its password:" -ForegroundColor Green
    Write-Host "       $store"
    Write-Host "       lose it and no installed copy can ever be updated again."
}

# Forward slashes: a backslash is an escape in a .properties file.
$storeFwd = $store.Replace('\', '/')
@(
    "# Made by tools\keystore.ps1. Gitignored: never commit this file.",
    "storeFile=$storeFwd",
    "storePassword=$pw",
    "keyAlias=$alias",
    "keyPassword=$pw"
) | Set-Content -Path $props -Encoding ascii
Write-Host "[key]  wrote android\keystore.properties (gitignored)"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Host "[warn] gh is not installed - set the secrets by hand (see README.md)" -ForegroundColor Yellow
    exit 0
}
Write-Host ""
$yes = Read-Host "upload the key to the GitHub secrets of $Repo, for release builds there? (y/n)"
if ($yes -ne "y") { Write-Host "[key]  secrets skipped"; exit 0 }

$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($store))
$secrets = [ordered]@{
    ANDROID_KEYSTORE_BASE64   = $b64
    ANDROID_KEYSTORE_PASSWORD = $pw
    ANDROID_KEY_ALIAS         = $alias
}
foreach ($name in $secrets.Keys) {
    # Through stdin: gh reads the value from it when --body is not given.
    $secrets[$name] | gh secret set $name -R $Repo
    if ($LASTEXITCODE -ne 0) { Write-Host "[err]  could not set $name - is gh logged in with access to $Repo?" -ForegroundColor Red; exit 1 }
    Write-Host "[gh]   set $name"
}
Write-Host "[key]  GitHub builds will be signed with the same key."
