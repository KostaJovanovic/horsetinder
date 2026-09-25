package com.horsetinder.app;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.os.Build;
import android.widget.Toast;
import androidx.core.content.IntentCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Updates for the APK, from the public KostaJovanovic/horsetinder-release
 * (.github/workflows/release.yml). A port of mbrd's MbrdUpdate.
 *
 * Only a build with an update feed checks: BuildConfig.UPDATE_FEED, set with
 * -PhorseUpdateFeed by the release workflow and by save.bat's signed build. A
 * debug build has none, never checks and never touches the network.
 *
 * The feed is GitHub's API answer for the latest release: the tag (v0.12) and,
 * for the asset named horsetinder-android-<version>.apk, its download URL and
 * the SHA-256 digest GitHub computed for it. No digest, no install.
 *
 * At start-up (at most every 30 minutes) the plugin asks the feed. A newer
 * version downloads in the background unless Data Saver restricts a metered
 * network, and the page shows the Update button next to the logo (the
 * "update" event). A press installs it through a PackageInstaller session.
 * Android refuses an APK signed with another key, so the signature check is
 * the platform's; this checks the hash, the package name and that the
 * versionCode grows.
 *
 * Event states: available (found, not downloaded), downloading (with
 * permille), ready (downloaded and checked), failed, said (a passing answer
 * for the toast), none (take the button away).
 */
@CapacitorPlugin(name = "HorseUpdate")
public class UpdatePlugin extends Plugin {

    private static final String PREFS = "horse-update";
    private static final long EVERY_MS = 30L * 60 * 1000;
    private static final int FEED_MAX = 512 * 1024;
    /** The updater finds its APK by the part before the version. The workflow names it. */
    private static final Pattern APK_NAME = Pattern.compile("^horsetinder-android(-\\d+(\\.\\d+)*)?\\.apk$");
    private static final Pattern DIGEST = Pattern.compile("^sha256:([0-9a-f]{64})$");
    private static final ExecutorService NET = Executors.newSingleThreadExecutor();
    private static final AtomicBoolean BUSY = new AtomicBoolean(false);

    private interface Progress {
        void at(int permille);
    }

    private volatile File readyFile = null;
    private volatile String readyVersion = "";
    private volatile JSONObject waiting = null;
    private volatile String waitingVersion = "";
    /** The last thing announced, for a page that asks after the event went by. */
    private volatile JSObject last = offer("none", "", 0, "");

    @Override
    public void load() {
        check(false);
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject l = last;
        JSObject r = offer(l.getString("state", "none"), l.getString("version", ""), l.getInteger("permille", 0), l.getString("note", ""));
        r.put("enabled", enabled());
        r.put("current", installedName(getContext()));
        call.resolve(r);
    }

    /** Settings' "Check for updates": no wait, and it always answers. */
    @PluginMethod
    public void check(PluginCall call) {
        check(true);
        call.resolve();
    }

    /** The Update button. A downloaded update installs; one not downloaded yet downloads first. */
    @PluginMethod
    public void install(PluginCall call) {
        Context app = getContext().getApplicationContext();
        File file = readyFile;
        if (file != null && file.isFile()) {
            NET.execute(() -> {
                try {
                    install(app, file);
                } catch (Exception e) {
                    deleteQuietly(file);
                    readyFile = null;
                    announce("none", "", 0, "");
                    say("Android didn't take the update. Horse Tinder tries again next time it starts.");
                }
            });
        } else if (waiting != null) {
            download(app, waiting, waitingVersion);
        }
        call.resolve();
    }

    private static JSObject offer(String state, String version, int permille, String note) {
        JSObject o = new JSObject();
        o.put("state", state);
        o.put("version", version);
        o.put("permille", permille);
        o.put("note", note);
        return o;
    }

    private void announce(String state, String version, int permille, String note) {
        JSObject o = offer(state, version, permille, note);
        if (!"said".equals(state)) last = o;
        notifyListeners("update", o, true);
    }

    private void say(String note) {
        announce("said", "", 0, note);
    }

    private static boolean enabled() {
        return BuildConfig.UPDATE_FEED != null && !BuildConfig.UPDATE_FEED.isEmpty();
    }

    private void offerLater(String version, JSONObject apk) {
        waiting = apk;
        waitingVersion = version;
        announce("available", version, 0, "Horse Tinder " + version + " is out. Tap Update to download and install it.");
    }

    private void offerReady(File file, String version) {
        readyFile = file;
        readyVersion = version;
        announce("ready", version, 0, "Horse Tinder " + version + " is downloaded. Tap Update to install it.");
    }

    private static boolean restricted(Context app) {
        ConnectivityManager cm = (ConnectivityManager) app.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        return cm.isActiveNetworkMetered()
            && cm.getRestrictBackgroundStatus() == ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED;
    }

    /** Where a background download waits for the press. Not the cache, which Android may empty. */
    private static File readyApk(Context app) {
        return new File(new File(app.getFilesDir(), "update"), "horsetinder.apk");
    }

    private static File apkFile(Context app) {
        return new File(new File(app.getCacheDir(), "update"), "horsetinder.apk");
    }

    /** A download from an earlier run that is still newer is offered at once; any other is deleted. */
    private void resumeReady(Context app) {
        File kept = readyApk(app);
        if (!kept.isFile()) return;
        try {
            verify(app, kept);
            PackageInfo p = app.getPackageManager().getPackageArchiveInfo(kept.getPath(), 0);
            offerReady(kept, p != null && p.versionName != null ? p.versionName : "");
        } catch (Exception e) {
            deleteQuietly(kept);
        }
    }

    private void background(Context app, String version, JSONObject apk) {
        if (restricted(app)) {
            offerLater(version, apk);
            return;
        }
        String url = apk.optString("browser_download_url", "");
        Matcher digest = DIGEST.matcher(apk.optString("digest", ""));
        if (!url.startsWith("https://") || !digest.matches()) return;
        File file = readyApk(app);
        try {
            save(url, file, digest.group(1), permille -> {});
            verify(app, file);
            offerReady(file, version);
        } catch (Exception e) {
            // Offline, or a bad file: offer it anyway, and a press downloads it in the foreground
            deleteQuietly(file);
            offerLater(version, apk);
        }
    }

    private void check(boolean manual) {
        if (!enabled()) {
            if (manual) say("Updates are off in this build of Horse Tinder.");
            return;
        }
        if (!BUSY.compareAndSet(false, true)) {
            if (manual) say("Already checking for an update.");
            return;
        }
        Context app = getContext().getApplicationContext();
        SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        NET.execute(() -> {
            try {
                // The installer copied the last update when it ran, so the file is spare now
                deleteQuietly(apkFile(app));
                if (readyFile == null) resumeReady(app);
                if (readyFile != null) {
                    if (manual) offerReady(readyFile, readyVersion);
                    return;
                }
                if (waiting != null) {
                    if (manual) offerLater(waitingVersion, waiting);
                    return;
                }
                if (!manual && System.currentTimeMillis() - prefs.getLong("checked", 0) < EVERY_MS) return;
                HttpURLConnection c = open(BuildConfig.UPDATE_FEED, "application/vnd.github+json");
                JSONObject release;
                try {
                    release = new JSONObject(readAll(c.getInputStream(), FEED_MAX));
                } finally {
                    c.disconnect();
                }
                prefs.edit().putLong("checked", System.currentTimeMillis()).apply();
                String version = release.optString("tag_name", "").replaceFirst("^v", "");
                JSONObject apk = asset(release, APK_NAME);
                if (apk == null || !newer(version, installedName(app))) {
                    if (manual) say("Horse Tinder is up to date.");
                    return;
                }
                if (manual) offerLater(version, apk);
                else background(app, version, apk);
            } catch (Exception e) {
                if (manual) say("Couldn't reach GitHub. Check the connection and try again.");
            } finally {
                BUSY.set(false);
            }
        });
    }

    /** "0.12" is newer than "0.9", compared number by number. */
    static boolean newer(String a, String b) {
        String[] x = a.split("\\.");
        String[] y = b.split("\\.");
        for (int i = 0; i < Math.max(x.length, y.length); i++) {
            int p = i < x.length ? number(x[i]) : 0;
            int q = i < y.length ? number(y[i]) : 0;
            if (p != q) return p > q;
        }
        return false;
    }

    private static int number(String s) {
        try {
            return Integer.parseInt(s.trim());
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    private static JSONObject asset(JSONObject release, Pattern name) {
        JSONArray assets = release.optJSONArray("assets");
        if (assets == null) return null;
        for (int i = 0; i < assets.length(); i++) {
            JSONObject a = assets.optJSONObject(i);
            if (a != null && name.matcher(a.optString("name")).matches()) return a;
        }
        return null;
    }

    /** The press on an update that isn't downloaded yet: download with the button counting, then install. */
    private void download(Context app, JSONObject apk, String version) {
        final String url = apk.optString("browser_download_url", "");
        Matcher digest = DIGEST.matcher(apk.optString("digest", ""));
        if (!url.startsWith("https://") || !digest.matches() || !BUSY.compareAndSet(false, true)) return;
        final String sha = digest.group(1);
        announce("downloading", version, 0, "");
        NET.execute(() -> {
            File file = apkFile(app);
            int[] told = {0};
            try {
                save(url, file, sha, permille -> {
                    if (permille - told[0] < 10) return;
                    told[0] = permille;
                    announce("downloading", version, permille, "");
                });
                verify(app, file);
                install(app, file);
                // Back to an offer: if Android's confirm screen is turned down, a press tries again
                offerLater(version, apk);
            } catch (Exception e) {
                waiting = apk;
                waitingVersion = version;
                announce("failed", version, 0, "Horse Tinder " + version + " didn't download. Tap to try again.");
            } finally {
                deleteQuietly(file);
                BUSY.set(false);
            }
        });
    }

    private static void save(String url, File file, String sha, Progress progress) throws Exception {
        File dir = file.getParentFile();
        if (dir != null && !dir.isDirectory() && !dir.mkdirs()) throw new IOException("no folder");
        HttpURLConnection c = open(url, null);
        try {
            long total = c.getContentLength();
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(file)) {
                byte[] buf = new byte[1 << 16];
                long got = 0;
                int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    digest.update(buf, 0, n);
                    got += n;
                    progress.at(total > 0 ? (int) Math.min(1000, got * 1000 / total) : 0);
                }
            }
            if (!hex(digest.digest()).equals(sha)) throw new IOException("checksum mismatch");
        } finally {
            c.disconnect();
        }
    }

    /** The file must be Horse Tinder, and newer than the installed copy. */
    private static void verify(Context app, File file) throws IOException {
        PackageInfo p = app.getPackageManager().getPackageArchiveInfo(file.getPath(), 0);
        if (p == null || !app.getPackageName().equals(p.packageName)) throw new IOException("not Horse Tinder");
        if (versionCode(p) <= installedCode(app)) throw new IOException("not newer");
    }

    /** Write the APK into a PackageInstaller session and commit it. InstallStatus hears the result. */
    private static void install(Context app, File file) throws IOException {
        PackageInstaller installer = app.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(app.getPackageName());
        params.setSize(file.length());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
        }
        int id = installer.createSession(params);
        try {
            try (PackageInstaller.Session session = installer.openSession(id)) {
                try (InputStream in = new FileInputStream(file); OutputStream out = session.openWrite("horsetinder.apk", 0, file.length())) {
                    byte[] buf = new byte[1 << 16];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                    session.fsync(out);
                }
                int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0);
                PendingIntent done = PendingIntent.getBroadcast(app, id, new Intent(app, InstallStatus.class), flags);
                session.commit(done.getIntentSender());
            }
        } catch (IOException | RuntimeException e) {
            installer.abandonSession(id);
            throw e;
        }
    }

    /**
     * Android reports on the install session here. PENDING_USER_ACTION (every
     * install on Android 7 to 11) carries its confirm screen, which is started.
     * On success Android stops the app to replace it.
     */
    public static final class InstallStatus extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
            if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                Intent confirm = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_INTENT, Intent.class);
                if (confirm == null) return;
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    context.startActivity(confirm);
                } catch (RuntimeException e) {
                    Toast.makeText(context, "Android couldn't open its installer.", Toast.LENGTH_LONG).show();
                }
            } else if (status != PackageInstaller.STATUS_SUCCESS && status != PackageInstaller.STATUS_FAILURE_ABORTED) {
                Toast.makeText(context, "Android didn't install the update. Try again later.", Toast.LENGTH_LONG).show();
            }
        }
    }

    private static HttpURLConnection open(String url, String accept) throws IOException {
        URL u = new URL(url);
        if (!"https".equals(u.getProtocol())) throw new IOException("not https");
        HttpURLConnection c = (HttpURLConnection) u.openConnection();
        c.setInstanceFollowRedirects(true);
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setRequestProperty("Cache-Control", "no-cache");
        c.setRequestProperty("User-Agent", "HorseTinder-Android");
        if (accept != null) c.setRequestProperty("Accept", accept);
        int status = c.getResponseCode();
        if (status != HttpURLConnection.HTTP_OK) {
            c.disconnect();
            throw new IOException("HTTP " + status);
        }
        return c;
    }

    private static String readAll(InputStream in, int max) throws IOException {
        try (InputStream src = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = src.read(buf)) > 0) {
                if (out.size() + n > max) throw new IOException("reply too large");
                out.write(buf, 0, n);
            }
            return out.toString("UTF-8");
        }
    }

    private static String installedName(Context app) {
        try {
            String v = app.getPackageManager().getPackageInfo(app.getPackageName(), 0).versionName;
            return v == null ? "" : v;
        } catch (PackageManager.NameNotFoundException e) {
            return "";
        }
    }

    private static long installedCode(Context app) {
        try {
            return versionCode(app.getPackageManager().getPackageInfo(app.getPackageName(), 0));
        } catch (PackageManager.NameNotFoundException e) {
            return Long.MAX_VALUE;
        }
    }

    @SuppressWarnings("deprecation")
    private static long versionCode(PackageInfo p) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? p.getLongVersionCode() : p.versionCode;
    }

    private static String hex(byte[] bytes) {
        StringBuilder s = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) s.append(String.format(Locale.ROOT, "%02x", b));
        return s.toString();
    }

    private static void deleteQuietly(File f) {
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }
}
