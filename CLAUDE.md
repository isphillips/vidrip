# Vidrip — Working Notes (branch: `chase`)

> Handoff doc for the Android + Shorts-reaction work. Last updated end of day 2026-06-03.

## What this app is
React Native 0.76.5 app (package `com.reaxn`, app display name "Vidrip"). Users watch
**YouTube Shorts** and record a front-camera **reaction** while the Short plays. Recipients
watch the reaction with the Short replayed alongside it. Backend: Supabase. Reactions are
stored **locally** by default (`STORAGE_MODE = 'local'`).

---

## Dev environment (Windows PC)
Tools are NOT all on PATH. Use these exact paths:

- **Node:** `C:\Program Files\nodejs` (node 24, npm 11)
- **JDK:** `C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot` (JDK 21)
- **Android SDK:** `C:\Users\User\AppData\Local\Android\Sdk` (adb at `...\platform-tools\adb.exe`)
- **Yarn:** bundled at `.yarn/releases/yarn-3.6.4.cjs` → run as `node .yarn/releases/yarn-3.6.4.cjs <cmd>`

Env vars are set at the User level (ANDROID_HOME, JAVA_HOME, PATH additions). On a fresh PC,
replicate those or prepend them per-command.

### Build + install (release, runs standalone — no Metro)
From PowerShell:
```
$env:ANDROID_HOME = "C:\Users\User\AppData\Local\Android\Sdk"
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot"
$env:PATH = "C:\Program Files\nodejs;$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"
cd C:\Users\User\Documents\GitHub\vidrip\android
.\gradlew.bat app:assembleRelease
adb install -r app\build\outputs\apk\release\app-release.apk
```
Release build bundles JS, so the app runs without Metro. Build ~1 min. Test devices:
OnePlus 10 Pro and Pixel 8 Pro (one USB-C port — swap cables).

> NOTE: `react-native run-android` fails from Git Bash here (`gradlew.bat not recognized`).
> Use the PowerShell gradlew flow above.

---

## Android port — DONE (committed earlier on this branch / main)
- `pushService.ts`: lazy-load `PushNotificationIOS`, guard all calls with `Platform.OS === 'ios'`.
- `AndroidManifest.xml`: CAMERA, RECORD_AUDIO, FOREGROUND_SERVICE(+MEDIA_PROJECTION) perms;
  `reaxn://` deep-link intent filter (magic-link sign-in).
- `package.json`: downgraded `@react-native-async-storage/async-storage` v3→v2 (v3 needs
  Kotlin 2.1.0 which conflicts with RN's Gradle plugin).
- **patch-package**: `patches/react-native-gesture-handler+2.31.1.patch` fixes a RN 0.76
  `getPointerEvents` incompatibility. Applied via `postinstall`. IMPORTANT: a fresh
  `yarn install` needs this patch or the Android build fails. (node_modules isn't committed.)
- Screen-record native module (`ScreenRecordService.kt`, `ReaxnScreenRecorderModule.kt`,
  `ReaxnScreenRecorderPackage.kt`) was built for the OLD screen-capture approach. **It is now
  effectively dead** — see the hard constraint below. Left in the tree for now.

---

## Shorts reaction feature — design + state

### Shorts-only enforcement (DONE)
`src/infrastructure/youtube/api.ts`: the Data API has no "Shorts only" filter
(`videoDuration=short` just means < 4 min). We now filter by real duration **<= 60s** via
`contentDetails`. Trending uses search of the `#shorts` tag by viewCount (NOT
`chart=mostPopular`, which ignores duration filters and returned an empty feed). Paste flow
only accepts `youtube.com/shorts/...` URLs and verifies <= 60s.

### Record screen (`features/record/screens/RecordReactionScreen.tsx`) — WORKING
Full-screen YouTube Short + front-camera PiP overlay (bottom-left). User taps to start →
Short plays + VisionCamera records the camera → saved as a local mp4. Note: on Android,
`video.path` from VisionCamera must have `file://` stripped before `RNFS.moveFile`.

### Watch screen (`features/threads/screens/WatchReactionScreen.tsx`) — **OPEN PROBLEM**
Goal: reaction plays BIG (full screen) with the Short in a small PiP corner, both in sync.
Reaction audio 100%; **muted Short is acceptable** (user confirmed). Some sync drift is fine
(Shorts are 10–30s).

**THE BLOCKER:** the YouTube Short will not autoplay in the PiP. On Android WebViews,
*programmatic* play (`play={true}` via the iframe postMessage) is silently ignored — verified
via logcat: zero `onChangeState` events, even with `mute=true`,
`webViewProps={{ mediaPlaybackRequiresUserGesture: false }}`, `forceAndroidAutoplay`, and
`pointerEvents` removed from the PiP container. The ONLY thing that starts it is a **real
finger tap landing on the WebView** — and even then it took multiple taps (YouTube's own
controls eat the first tap(s)).

Current code state (committed to `chase`): attempts **muted autoplay** on the iframe `onReady`
+ a 2s fallback that plays the reaction anyway. As of tonight, the Short still does NOT
autoplay — only the reaction plays. So this is unsolved.

---

## HARD CONSTRAINTS (do not violate)
1. **Never screen-record or download the YouTube Short.** It violates YouTube ToS. So we
   CANNOT composite the reaction + Short into one MP4 (that would need the Short's pixels).
   The Short must always stream live via the official `react-native-youtube-iframe`.
   → This kills the "bake into one video" idea and makes the old ScreenRecordService dead.
2. **No reliable unmuted programmatic autoplay on Android.** Mobile WebViews block it. Only a
   genuine in-WebView tap, or muted autoplay (which currently still isn't firing for us),
   are options.

## react-native-youtube-iframe 2.4.1 gotchas (learned the hard way)
- `setVolume` is **NOT** a ref method (only get*/seekTo are). Calling
  `ytRef.current.setVolume(25)` throws `TypeError: undefined is not a function` and breaks the
  player. Set volume via the **`volume` prop** (0–100). Also `mute` and `play` are props.
- `play` prop toggling does not start playback on the watch-screen PiP (see blocker above),
  though it DOES work on the full-screen record-screen player.

---

## NEXT STEPS (resume here)
The watch-screen PiP autoplay is the open question. Options, roughly in order to try:
1. **Confirm whether muted autoplay can EVER fire** in this PiP: add temporary
   `onReady`/`onChangeState`/`onError` `console.log`s, capture `adb logcat -s ReactNativeJS:*`,
   open a reaction, and see if any state change occurs. (Tonight's build had logs removed.)
   - If muted autoplay produces a `playing` state → the feature works; just wire it up.
   - If it produces nothing → programmatic play is fully blocked; go to option 2 or 3.
2. **Single clean tap to start:** make the Short the obvious tap target (briefly enlarge/pulse
   the PiP, or a full-screen "tap to start" that forwards one synthetic-feeling tap to the
   WebView). Then start the reaction on the Short's `playing` event. Solve the
   "needs multiple taps" issue (likely YouTube controls eating taps — try `controls: false`
   and tapping the body, which worked once).
3. **Reconsider the watch UX** if autoplay is truly impossible: e.g. reaction autoplays
   (it's local, works fine) and the Short is a tap-to-reveal PiP, or shown as a thumbnail the
   viewer can tap to play.

Useful debug recipe:
```
adb logcat -c
adb logcat -s ReactNativeJS:*   # then reproduce on device
```

## Git
- Working branch: **`chase`** (push here). Main branch: `main`.
- All today's work is committed to `chase`. Co-author trailer used on commits.
