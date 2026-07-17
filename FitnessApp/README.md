# FitnessApp — Developer Setup & Emulator Guide

## Running the App on Android Emulator

### Prerequisites
- Android emulator AVD named `Pixel_6_API_34` (via Android Studio or command-line tools)
- Node.js v20 (via nvm)
- Expo CLI (`npx expo`)

### Step 1 — Start the Emulator
Open a terminal and run:
```bash
/opt/homebrew/share/android-commandlinetools/emulator/emulator -avd Pixel_6_API_34 -no-audio -no-snapshot
```
Wait for the emulator to fully boot to the home screen before proceeding.

### Step 2 — Start Metro Bundler (tunnel mode)
Open a **second terminal**, navigate to the project folder, and run:
```bash
cd /Users/yardenarabi/PycharmProjects/PythonProject/FitnessApp
npx expo start --tunnel --clear
```

> **Why `--tunnel`?** Direct LAN/port-forwarding (`adb reverse`) is unreliable in this setup. Tunnel mode uses ngrok to route traffic, bypassing local network issues entirely.

Once Metro starts, press `a` to open the app on the Android emulator.

### Troubleshooting

**`zsh: command not found: expo` or `npx` issues**
Load nvm first:
```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 20
npx expo start --tunnel --clear
```

**`adb: command not found`**
Use the full path:
```bash
/opt/homebrew/share/android-commandlinetools/platform-tools/adb <command>
```

**Emulator shows "Something went wrong" / `UpdateFailedToLoad`**
This means Expo Go can't reach the Metro bundler. Solutions:
1. Make sure Metro is running (`npx expo start --tunnel --clear`)
2. In the emulator, shake device → tap "Reload"
3. Re-run `adb reverse tcp:8084 tcp:8084` if not using tunnel mode

**`permission denied` on `cd` via `!` commands in Claude Code**
Run Metro directly in a regular terminal tab — do not use the `!` prefix for multi-step commands involving `cd`.
