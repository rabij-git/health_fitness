# FitnessApp

A cross-platform fitness and gamification app for coaches, trainers, and admins. Built with React Native / Expo and Supabase.

---

## Getting Started

### Prerequisites
- [Node.js v20+](https://nodejs.org/) (recommended via [nvm](https://github.com/nvm-sh/nvm))
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
1. Start your emulator first
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

---

## Troubleshooting

**`command not found: npx` or Node not found**
Load nvm first:
```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 20
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
- **Framework:** React Native / Expo SDK 56
- **Backend:** Supabase (PostgreSQL + Auth)
- **Language:** TypeScript

---

## User Roles
- **Admin** — manages third-party data syncs (Apple Health, Garmin, MyFitnessPal)
- **Coach** — creates programs, assigns workouts to trainees, manages gym
- **Trainee** — follows assigned workouts, logs progress, earns XP and medals

testing