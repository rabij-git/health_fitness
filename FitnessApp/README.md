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