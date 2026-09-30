# FitnessApp

A cross-platform fitness and gamification app for coaches, trainers, and admins. Built with React Native / Expo and Supabase.

---

## Getting Started

### Prerequisites
- [Node.js v22.13+](https://nodejs.org/) (recommended via [nvm](https://github.com/nvm-sh/nvm) — run `nvm install` in this folder to pick up the version pinned in `.nvmrc`)
- [Expo Go](https://expo.dev/go) installed on your phone, **or** an Android/iOS emulator/simulator

### 1. Clone the repo
```bash
git clone https://github.com/rabij-git/health_fitness.git
cd health_fitness/FitnessApp
```

### 2. Install dependencies
```bash
npm install
```

### 3. Database
No setup required. The app connects to a shared Supabase instance — the credentials are already in `src/lib/supabase.ts`. Just install and run.

### 4. Start the app

**On your phone (easiest):**
```bash
npx expo start --tunnel --clear
```
Scan the QR code with the Expo Go app on your phone.

**On Android emulator:**
1. Start the emulator (see [Android Emulator: Start / Stop](#android-emulator-start--stop) below)
2. Run:
```bash
npx expo start --tunnel --clear
```
3. Press `a` in the Metro terminal to open on Android.

**On iOS Simulator (requires Xcode):**
```bash
npx expo start --tunnel --clear
```
Press `i` in the Metro terminal to open on iOS.

> **Note:** Use `--tunnel` mode — it routes traffic via ngrok and avoids local network issues with emulators.

### 5. Stopping the dev server

Don't just close the terminal tab — Metro and its ngrok tunnel can survive that and keep the port/tunnel locked. Kill them properly:

```bash
pkill -f "expo start"
lsof -ti:8081 | xargs kill -9 2>/dev/null
```

**Known gotcha:** `pkill -f "expo start"` sometimes leaves an orphaned `ngrok` process running in the background — the parent `expo start` process dies, but its ngrok child doesn't get cleaned up with it. That orphan keeps your tunnel endpoint "online" on ngrok's side, so the *next* `expo start --tunnel` fails with an error like:
```
CommandError: failed to start tunnel
failed to start tunnel: The endpoint 'https://xxxxx.ngrok-free.dev' is already online...
ERR_NGROK_334 / ERR_NGROK_3200
```
If you hit that, find and kill the leftover ngrok process specifically:
```bash
ps aux | grep -i ngrok | grep -v grep
kill -9 <PID>
```
Then retry `npx expo start --tunnel --clear`.

To confirm everything's actually stopped before restarting:
```bash
ps aux | grep -iE "expo start|ngrok" | grep -v grep
```
This should print nothing.

---

## Android Emulator: Start / Stop

The Android SDK for this project is installed at `/opt/homebrew/share/android-commandlinetools/`, with an emulator AVD named `Pixel_6_API_34`.

**Start:**
```bash
/opt/homebrew/share/android-commandlinetools/emulator/emulator -avd Pixel_6_API_34 -no-audio -no-snapshot
```
This opens the emulator window and boots the device. Wait for the home screen before running `npx expo start`.

**Stop:**
```bash
/opt/homebrew/share/android-commandlinetools/platform-tools/adb emu kill
```
Or just close the emulator window directly.

**List available AVDs** (if you need to confirm the name or create a different one):
```bash
/opt/homebrew/share/android-commandlinetools/emulator/emulator -list-avds
```

> **Tip:** If the emulator's network looks broken (bundling hangs forever, or Expo Go throws `Failed to download remote update`), don't just reload the app — do a full cold restart: `adb emu kill`, wait for it to fully exit, then start it again with the command above.

---

## Building a Standalone Android App (EAS Build)

For installing Athera as a real app on an Android phone — a proper app icon, no Expo Go, no tunnel/Metro needed to run it day-to-day. This builds in Expo's cloud and hands you back a downloadable `.apk`.

> **Note:** this is a snapshot, not live-reloading — it bundles whatever code is on disk at build time. Any later code change needs a new build + reinstall on the phone (there's no OTA update channel configured). Use Expo Go (`npx expo start --tunnel`) for day-to-day development; use this when you actually want the app installed standalone.

### First time only

```bash
cd FitnessApp
npm install -g eas-cli
eas login       # sign in with your Expo account — GitHub login works if that's how the account was created
eas init        # links this project to your Expo account (stamps a projectId into app.json — commit that change)
eas build --platform android --profile preview
```
- The first Android build will offer to generate a signing keystore for you — accept the default (let EAS manage it).
- The build itself runs in Expo's cloud (~10–20 min). When it finishes, the terminal (and the [expo.dev dashboard](https://expo.dev)) prints a download link + QR code.
- On the Android phone: open that link (or scan the QR code), download the `.apk`, and tap it to install. Android will prompt once to allow "install unknown apps" for whichever app you downloaded it through (Chrome, Files, etc.) — allow it, then install normally.

### Every time after that

Already logged in and linked — just rebuild:
```bash
cd FitnessApp
eas build --platform android --profile preview
```
Same download-link/QR-code flow as above once it finishes. Reinstalling over the existing app (same package name, `com.athera.app`) just updates it in place — no need to uninstall first.

**To find a previous build's download link again** (without rebuilding):
```bash
eas build:list --platform android --limit 5
```
Or check the project's [Builds page on expo.dev](https://expo.dev/accounts/rabij/projects/athera/builds).

---

## Building a Standalone iOS App (EAS Build)

Same idea as Android above, but Apple requires one extra step: installing a custom build on a **physical iPhone** needs an [Apple Developer Program](https://developer.apple.com/programs/) membership ($99/year) and that specific iPhone registered in advance — there's no plain APK-style sideload on iOS.

> **No Developer Program, or just want to try it on a Mac?** You can build for the **iOS Simulator** instead — free, no Apple account, no device registration, no code signing. Add `"ios": { "simulator": true }` to the `preview` profile in `eas.json`, then `eas build --platform ios --profile preview` and drag the resulting `.tar.gz`'s `.app` onto a running Simulator. This only runs in Xcode's Simulator, not on an actual iPhone.

### First time only

Assumes `eas login`/`eas init` were already done for the Android build above — that login/project link is shared across platforms, no need to repeat it.

```bash
cd FitnessApp
eas device:create
```
This prints a link — open it **on the iPhone itself**. It installs a small profile that registers that device with Apple/EAS (one-time per physical device).

```bash
eas build --platform ios --profile preview
```
First run prompts for your Apple ID login and Developer Program membership — EAS generates the certificate/provisioning profile from there. Builds in the cloud (~10–20 min), then prints a download link + QR code, same as Android.

- On the iPhone: open the link (or scan the QR code) and install.
- **The first time you open the app**, iOS blocks it until you trust the developer certificate: **Settings → General → VPN & Device Management** → tap the certificate → Trust.

### Every time after that

Already logged in, linked, and the device is registered — just rebuild:
```bash
cd FitnessApp
eas build --platform ios --profile preview
```
Same download-link/QR-code flow. Re-run `eas device:create` only if installing on a *different* iPhone that hasn't been registered yet.

**To find a previous build's download link again** (without rebuilding):
```bash
eas build:list --platform ios --limit 5
```
Or check the project's [Builds page on expo.dev](https://expo.dev/accounts/rabij/projects/athera/builds).

---

## Troubleshooting

**`command not found: npx` or Node not found**
Load nvm first:
```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use
npx expo start --tunnel --clear
```

**Emulator shows "Something went wrong"**
Metro bundler isn't reachable. Make sure you used `--tunnel` and try reloading:
- Shake the device → tap "Reload", or
- Press `r` in the Metro terminal

**iOS Simulator: Xcode required**
Install Xcode from the Mac App Store, open it once to accept the license, then run:
```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

---

## Tech Stack
- **Framework:** React Native / Expo SDK 57
- **Backend:** Supabase (PostgreSQL + Auth)
- **Language:** TypeScript

---

## User Roles
- **Admin** — manages third-party data syncs (Apple Health, Garmin, MyFitnessPal)
- **Coach** — creates programs, assigns workouts to trainees, manages gym
- **Trainee** — follows assigned workouts, logs progress, earns XP and medals

testing