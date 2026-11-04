# Horse Tinder

Tinder for horses. A website first: a static site in `www/` (vanilla HTML, CSS and
JS, no build step), live at **https://horsetinder.valjdakosta.com** on Cloudflare Pages.
Everything a player makes stays in their browser's storage; Settings, Data saves
it to a file and loads it back, on the same device or another one. The same
`www/` is also wrapped for Android with Capacitor 8. The JS is written for
Chrome 62, so it runs in the Sunmi V2's WebView.

## Website

Cloudflare Pages publishes `www/` from this repo. There is no build step; set the
build command to `npm test` so a broken chat never goes live.

In a browser, "Add date to calendar" downloads a `.ics` file. The Android app
writes into the phone's calendar instead, and updates itself (below).

## Scripts

| | |
|---|---|
| `server.bat` | Serves `www/` on port 46773 and prints a QR code for opening it on a phone on the same Wi-Fi |
| `editor.bat` | Opens the content editor at localhost:46774: everything horses say and understand, their questions, stories and personalities, the handmade horses, prompts, names and breeds. It edits `www/js/content.js`, keeps a backup of each save in `tools/.backups/` and runs `npm test` after saving. Localhost only |
| `npm test` | Chat checks: every quick reply answers its question, past dates end, the content holds together, and the chat features work (`tools/test-chat.js`) |
| `save.bat` | Git menu: commit, save (commit + push), release, signed APK, pull, push, keystore |
| `python resources/make_icons.py` | Redraws the Android launcher icons and the website's icons from one design |

## Android app

Every commit through `save.bat` stamps `www/js/version.js`. The app's About line
shows the version, and `android/app/build.gradle` reads it: versionCode is the
commit count and versionName is the label (`0.12`). Android refuses an update
whose versionCode doesn't grow, so commit through `save.bat`.

### Builds

- **Debug:** `npm run sync`, then `gradlew assembleDebug` in `android/`. No update
  feed, so it never goes online. Gradle needs JDK 21: point `JAVA_HOME` at it
  (`%USERPROFILE%\.jdks\jdk-21...`). `save.bat` finds one on its own.
- **Tests:** `npm test`, and `gradlew testDebugUnitTest` for the updater's version
  compare. Both run before every signed build, here and on GitHub.
- **Signed, local:** `save.bat apk`. Writes `dist/horsetinder-android-<version>.apk`
  and installs it on any phone connected over USB.
- **Signed, GitHub:** `save.bat release` builds the signed APK locally first (a
  failed build stops the release with nothing committed). It then commits,
  pushes and starts `.github/workflows/release.yml`. That workflow builds the APK
  again, signs it with the same key and publishes it to
  [horsetinder-release](https://github.com/KostaJovanovic/horsetinder-release).

A phone with a debug build can't update to a signed one, because the signing
keys differ. `save.bat` asks before uninstalling it, since uninstalling deletes
the app's data on that phone.

### Updates

Signed builds check the latest release in `KostaJovanovic/horsetinder-release`
at startup, at most every 30 minutes (`UpdatePlugin.java`). That repo is public
because the code repo is private, and phones can't read a private repo's
releases. A newer version downloads in the background, and an **Update** button
appears next to the logo. The app checks the SHA-256 digest GitHub publishes, the
package name and the versionCode before installing. Android checks the
signature. Settings, Updates, **Check** asks right away.

That check is the only thing the app uses the internet for.

### One-time setup

1. **Signing key:** run `save.bat keystore`. It creates
   `%USERPROFILE%\.keystores\horsetinder-release.jks` (outside the repo) and
   `android/keystore.properties` (gitignored). It then offers to upload the key to
   this repo's secrets (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS`). **Back up the .jks and its password.** Without them, no
   installed copy can ever be updated again.
2. **Release repo:** create the public repo `KostaJovanovic/horsetinder-release`
   with a README, so it has a `main` branch. Releases need a commit to point at.
3. **Release token:** create a fine-grained personal access token with
   repository access limited to `horsetinder-release` and the
   **Contents: Read and write** permission. Then run:
   `gh secret set RELEASES_TOKEN -R KostaJovanovic/horsetinder` and paste the
   token when asked.
