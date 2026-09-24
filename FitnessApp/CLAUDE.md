@AGENTS.md

# Session Notes & Decisions

## Dev Environment Setup
- **Framework:** React Native / Expo SDK 54 (downgraded from 56 to match the SDK version installed in Expo Go on the test phone)
- **Node version:** v20.20.2 via nvm (minimum >=20.19.4 required)
- **Watchman:** installed via `brew install watchman` — Metro falls back to Node's slower built-in file watcher without it, and the gap widens as the project grows. Required for reasonable bundle/reload times on macOS.
- **Android SDK:** Installed at `/opt/homebrew/share/android-commandlinetools/`
- **Emulator:** Pixel 6, API 34 (Android 14), AVD name `Pixel_6_API_34`
- **adb path:** `/opt/homebrew/share/android-commandlinetools/platform-tools/adb`

### Android Emulator

**Step 1 — Start the emulator:**
```bash
/opt/homebrew/share/android-commandlinetools/emulator/emulator -avd Pixel_6_API_34 -no-audio -no-snapshot
```

**Step 2 — Launch the app (must be run in an interactive terminal / TTY):**
```bash
npx expo start --tunnel --clear
```
- **Use `--tunnel` mode** — `adb reverse` + direct LAN is unreliable on this machine. Tunnel (ngrok) bypasses local network issues.
- `--clear` clears Metro bundler cache — use when changes aren't reflecting.
- **Expo CLI requires an interactive terminal (TTY)** — run directly in a terminal tab, not via `!` in Claude Code.
- If `npx` not found, load nvm first: `export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 20`

**Troubleshooting — `npx expo start --tunnel` fails to start at all:**
ngrok's backend now requires an authenticated account + a modern (v3+) agent even for anonymous tunnels, which the version Expo bundles (`@expo/ngrok`, agent v2.3.41) can't satisfy, and Expo's own CLI forces a globally-shared authtoken + custom `exp.direct` hostname that collides across every Expo dev on the internet. Fixed durably via `node_modules` patches reapplied by `postinstall` (`scripts/patch-ngrok.js`, wired into `package.json`) — **do not hand-edit `node_modules` again, edit `scripts/patch-ngrok.js` instead** and the patches will reapply on the next `npm install`:
1. Swaps the bundled ngrok binary for a modern v3 one kept in `tools/ngrok-v3-darwin-arm64`.
2. Patches `@expo/ngrok/index.js`'s `connectRetry` to strip `authtoken`/`configPath`/`port` before calling `startTunnel()` (v3's strict schema rejects those extra fields) and to regenerate the tunnel's auto-name on each retry (a race where the agent's tunnel-creation API is hit before its cloud session finishes handshaking can leave a "ghost" name registered, which then fails a same-named retry with `error_code 102 "already exists"` — not covered by ngrok's own retriable-error list).
3. Patches `AsyncNgrok.js` (in `node_modules/expo/...`) to stop forcing Expo's shared authtoken/`exp.direct` hostname, so it falls back to the user's own already-authenticated `~/.ngrok2/ngrok.yml` account and a plain random `*.ngrok-free.dev` URL instead.
- The user's personal ngrok account must be authenticated once (`ngrok authtoken YOUR_TOKEN`, v2-syntax CLI even though the config format is v3) — already done for this machine.
- Verify success by checking for `Tunnel connected.` / `Tunnel ready.` in the CLI output (or query `curl http://127.0.0.1:4040/api/tunnels` for the live `public_url` while it's running).

**Troubleshooting — emulator stuck bundling / "Failed to download remote update":**
The emulator's virtual network can get corrupted after the Mac sleeps while it's running (symptoms: bundling hangs, or Expo Go throws `java.io.IOException: Failed to download remote update`; `adb shell ping 8.8.8.8` returns garbage/negative round-trip times when this happens). Fix is a cold restart, not a reload:
```bash
adb emu kill
# wait for the qemu-system process to fully exit, then:
/opt/homebrew/share/android-commandlinetools/emulator/emulator -avd Pixel_6_API_34 -no-audio -no-snapshot
```
Verify with `adb shell ping -c 3 -w 5 8.8.8.8` before assuming the app itself is broken.

---

### iOS Simulator

**Prerequisite — Full Xcode must be installed** (currently only Command Line Tools are present):
1. Download Xcode from the Mac App Store (it's free, ~10 GB)
2. Open Xcode once to accept the license and finish component installation
3. Run: `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`

**Step 1 — Open the Simulator:**
```bash
open -a Simulator
```

**Step 2 — Launch the app:**
```bash
npx expo start --ios --port 8084 --clear
```

> Note: Android emulator is the fully tested path. iOS Simulator setup has not been validated end-to-end yet.

---

## Supabase / Database

- **Project URL:** `https://bdyfqhykhpsgkgrklkdg.supabase.co`
- **Pooler host:** `aws-0-eu-west-1.pooler.supabase.com:6543`
- **DB user:** `postgres.bdyfqhykhpsgkgrklkdg`
- **Anon key:** `sb_publishable_8AcNwNrXlQxI9M_c5AyYJQ_J_kwInQh`
- **psql path:** `/opt/homebrew/opt/libpq/bin/psql`
- Password has special characters — always use a pgpass file:
```bash
echo "aws-0-eu-west-1.pooler.supabase.com:6543:postgres:postgres.bdyfqhykhpsgkgrklkdg:<DB_PASSWORD>" > /tmp/pgpass_sb && chmod 600 /tmp/pgpass_sb
PGPASSFILE=/tmp/pgpass_sb /opt/homebrew/opt/libpq/bin/psql "host=aws-0-eu-west-1.pooler.supabase.com port=6543 dbname=postgres user=postgres.bdyfqhykhpsgkgrklkdg sslmode=require"
```
- `/tmp` is cleared on reboot — recreate the pgpass file each session.
- Direct port 5432 is blocked by Supabase firewall — always use pooler port 6543.
- Management API requires a PAT (personal access token), NOT the service_role key.
- **No DB credentials are available in the Claude Code environment itself** — schema changes (new tables/columns) require handing the user a `.sql` file to run in the Supabase SQL Editor; only data reads/writes (via the anon key + PostgREST, since RLS is allow-all everywhere) can be done directly.

### Database Tables

| Table | Purpose |
|---|---|
| `public.users` | All users (admin, coach, trainee). Has `coach_id`, `gym_id`, `xp`, `streak`, `level`, `status` |
| `public.programs` | Coach-created program **templates** — reusable, own exercise list via `program_exercises` |
| `public.program_exercises` | Exercise template (name/sets/reps/weight) attached to a `programs` row |
| `public.exercise_library` | Shared, global exercise picker list (name/category/default sets/reps/weight). Any coach can add/edit/delete — not admin-gated |
| `public.coach_requests` | Coach↔trainee connection requests (`initiated_by`, `status`: pending/accepted/declined) — replaces the old direct-assign flow |
| `public.workouts` | A specific trainee's active workout instance (created when a program is assigned to them) |
| `public.exercises` | Exercises belonging to a `workouts` row (copied from the program template at assignment time, then editable per-trainee) |
| `public.workout_sessions` | Completed workout logs (completion_pct, xp_awarded) |
| `public.exercise_weight_logs` | Per-exercise weight/reps logs |
| `public.nutrition_plans` | Coach-uploaded PDF nutrition plans per trainee (metadata; file lives in Storage) |
| `public.user_medals` | Real earned-medal records per trainee (`medal_id`, `earned_at`) — medals were 100% mock/static before this was added |
| `public.messages` | Coach ↔ trainee direct messages; also used for the auto "workout completed" notification to the coach |
| `public.gyms` | Coach-created gyms (one gym per coach) |
| `public.friendships` | Trainee friend connections (pending/accepted) |

All tables have RLS enabled with allow-all policies.

**Storage:** public bucket `nutrition-plans` holds the uploaded PDF files (path `${traineeId}/${timestamp}-${filename}`); `nutrition_plans.file_url` is the public URL.

---

## Navigation

- **Coach tabs** (`CoachTabs.tsx`): Dashboard, Programs, **Nutrition**, Trainees, Rankings, Settings.
  - `Trainees` is its own tab — trainee search/requests/roster live there, not mixed into Programs.
  - `Programs` is template-only: program list + a full-width "Add Program" CTA at the top.
  - `Nutrition` (`CoachNutritionTemplates.tsx`) is the nutrition-plan equivalent: template-only list + "Add Nutrition Plan" CTA — see Nutrition Plans & Food Log below.
- **Trainee tabs** (`TrainerTabs.tsx`, note: "Trainer" here is the trainee-facing role name, confusingly): Home, Workout, Nutrition, Medals, Social, Profile.
  - `Workout` and `Nutrition` are each a segmented control internally (Workout/History, and Nutrition/History respectively), not four separate tabs — see Nutrition Plans & Food Log below.

---

## UI / UX Decisions Made

### Login Screen
- Role selection highlight color: **green** (`colors.xpBar` = `#00D4AA`), NOT red (`colors.primary`)
- Selected state uses: `borderColor: colors.xpBar`, `backgroundColor: '#0a1f1a'`, icon/label also in `colors.xpBar`
- Sign-in password field has no placeholder dots — starts genuinely blank

### Add (+) Button
- **AdminUsers:** small orange (`#FF8C00`) icon button, `marginRight: 12` to keep it tappable on Android — unchanged/unverified this session.
- **CoachPrograms:** now a full-width orange **"Add Program"** button pinned above the list (not gated behind the list's loading state — see Robustness Pitfalls below), so it's always reachable even if the program list is slow or fails to load.

### Header Avatar Button (Logout)
Both `TrainerDashboard.tsx` (trainee Home) and `CoachDashboard.tsx` show a `log-out-outline` icon in the top-right header button instead of the user's initials — the button still calls `onLogout` directly (no confirm step), but the icon makes the action self-evident instead of looking like a profile shortcut.

### Workout Screen (Trainee)
- **Per-set table layout** with columns: `SET | REPS | WEIGHT | EFFORT`
- Each exercise shows one row per set (not a single combined row)
- Coach reps shown as **single numbers** (e.g. `8`, not `8-10`)
- **Reps field:** display-only for the trainee, same as weight — trainees follow the coach-assigned rep count and can't edit it (previously an editable number-pad input clamped to `coachReps + 8`; changed so a trainee can't modify the prescribed reps for their own workout).
- **Weight field:** Display only for the trainee — no keyboard, no editing
- **Effort rating:** per-set buttons 0–4 (RIR — Reps In Reserve), colors `#4CAF50 → #8BC34A → #FF9800 → #FF5722 → #E94560`. **Deselectable** — tapping an already-selected rating clears it back to `null` instead of being stuck once picked.
- **Exercises must be done in order, and so must their sets.** `activeExerciseIndex` (`WorkoutScreen.tsx`) is the index of the first not-yet-`completed` exercise (or `exercises.length` once every exercise is done) — only that one exercise is interactive; everything before it (already completed) and after it (not reached yet) is locked: effort buttons disabled, and the per-exercise checkbox is either non-interactive (past — can't un-complete and jump back) or replaced with a lock icon (future — can't skip ahead), with a "Complete the previous exercise to unlock" hint and a dimmed card. **Within the active exercise, sets are gated the same way** — `activeSetIndex` is the first set with no logged effort (or `sets.length` once all are logged); only that one set's effort buttons are enabled, so a trainee can't jump to set 3 before logging set 1 and 2. **The checkbox auto-ticks** — a `useEffect` marks an exercise `completed` the instant every one of its sets has a logged effort, so the trainee doesn't have to tap it manually to advance to the next exercise (the checkbox itself is still manually tappable too, as an early-finish override).
- **Rest timer between sets:** each exercise has an optional coach-set `rest_seconds` (both `exercises` and `program_exercises`, migration `/private/tmp/scratch/exercises_rest_seconds.sql`, already run) — surfaced as a "REST (SEC)" field, right next to "TIME (S/M)", clamped 0–600 via `sanitizeCount`. Set on **both** ends of the template→instance pattern: `CoachPrograms.tsx`'s Add/Edit Program exercise builders (program templates) and `CoachTrainees.tsx`'s assign/edit-workout exercise builders (per-trainee workouts) — a program's rest values carry over into a workout on assignment, same as sets/reps/weight/time. On the trainee side, logging an effort rating (not clearing one) for a set starts a countdown if that exercise has `restSeconds > 0` — a floating banner (`WorkoutScreen.tsx`) shows the exercise name and a live `M:SS` countdown, and for the final 5 seconds a short synthesized tick plays once per second (`assets/sounds/tick.wav`, played via `expo-audio`'s `useAudioPlayer`/`seekTo(0)`+`play()`) so the trainee knows to start the next set without watching the screen. While the countdown is running, every effort button across the entire workout (not just the resting exercise) is disabled and dimmed — the trainee can't log another set or jump to a different exercise mid-rest. This requires a full dev-server restart (not just a reload) the first time, since `expo-audio` is a newly-installed dependency.
- **Finish gating:** the Finish button is disabled (with a hint text) until at least one set has a logged effort rating — previously a workout could be "finished" with zero progress logged, which still counted toward medal eligibility and sent a misleading "0% done, +0 XP" notification to the coach.
- **History integration:** finishing a workout still writes an `exercise_weight_logs` entry (via `logExerciseWeight`) for every exercise that had at least one set's effort logged, using that day's coach-assigned sets/reps/weight — this write is kept for potential future reporting, but nothing currently reads it (see below). `ExerciseLogScreen.tsx` (the Workout tab's "History" segment — see Navigation) is **read-only**, sourced from `workout_sessions` (`getTraineeHistory(userId, 200)`), not `exercise_weight_logs` — no manual entry ever existed here for the trainee to type into. It was originally a per-exercise weight-progression view (mini bar chart + history table of weight/sets/reps per exercise); per feedback that weight tracking wasn't useful here, it was replaced with two things: a "Days Exercised" bar chart with a Week/Month toggle (`buildWeekBuckets`/`buildMonthBuckets` — each bar counts **distinct calendar days** with a completed session in that week/Sunday-start or calendar month, not raw session count, so two workouts on the same day still count as one active day), and a "Completed Workouts" table listing every session's date, time, and workout name, newest first.
- **Medal XP is real:** earning a medal on finish now actually adds its `xpReward` to the trainee's XP total (on top of the workout's own XP), instead of just being a number the medal-toast displayed that nothing added up to.
- **Workout locking mid-session:** once at least one set has a logged effort and the workout hasn't been finished yet (`sessionActive = loggedSets > 0 && !submitted`, `WorkoutScreen.tsx`), the trainee can't switch to or start a different workout. The "‹ All Workouts" back row is replaced with a disabled "Workout in progress — finish to switch" indicator, and the Home screen's `openWorkoutId` deep-link effect (see "Workout Today" card below) is guarded to no-op — clearing the route param without changing `selectedWorkoutId` — if it would jump to a *different* workout while a session is active. Re-tapping the *same* in-progress workout is still fine. Unlocks automatically once `submitted` flips true on Finish.
- **Rest timer survives backgrounding:** the countdown used to be a plain decrement-every-second `setTimeout`, which just stops advancing while the app is backgrounded (RN fully suspends JS timers) — the display would sit frozen at whatever it showed when backgrounded, understating how much rest time had actually passed. Reworked to compute remaining time from a fixed `endAt` epoch timestamp (`Date.now() + restSeconds * 1000`) rather than decrementing a counter, recomputed every second via `setInterval` and additionally recomputed immediately on an `AppState` `'change'` → `'active'` event so it snaps to the correct value the instant the app comes back to the foreground instead of waiting up to a second for the next tick.
  - **The in-app tick sound is guarded against a real crash:** `tickPlayer.play()` (for the final-5-seconds tick) is only attempted when `AppState.currentState === 'active'`, and wrapped in `try/catch` regardless — iOS throws `UnexpectedException: Session activation failed` **synchronously** (uncaught, crashes the whole app) if audio session activation is attempted while backgrounded or mid-transition (repro: background the app during rest, foreground briefly, background again right before the timer's final 5 seconds). See Robustness Pitfalls #9 for the general lesson.
- **Rest-end local notification (`src/lib/restNotifications.ts`):** so the trainee is alerted even after leaving the app during rest (checking email, social media, etc.) — `expo-audio` alone can't play sound in the background, since that needs the iOS "audio" background mode + Android foreground-service audio, neither of which Expo Go can declare. Instead, `scheduleRestEndNotification(exerciseName, totalSeconds)` schedules a **local** notification (`expo-notifications`, `SchedulableTriggerInputTypes.TIME_INTERVAL`) for the moment the rest timer starts, and `cancelRestEndNotification(id)` cancels it in the effect's cleanup (new rest timer started, or the effect torn down) — wired into the same `useEffect` in `WorkoutScreen.tsx` that runs the countdown, keyed on `restTimer?.endAt`, notification id tracked in a `ref` (not state — pure bookkeeping, no re-render needed).
  - **Suppressing the double-alert:** `Notifications.setNotificationHandler` (registered once, at app start via a side-effect-only `import './src/lib/restNotifications'` in `App.tsx`) checks `AppState.currentState` — while foregrounded, the in-app banner/tick sound already covers it, so the system notification's banner/sound is suppressed (`shouldShowBanner`/`shouldShowList`/`shouldPlaySound` all `false`); while backgrounded, it shows and plays normally.
  - **Permission handling:** `ensurePermission()` requests once via `Notifications.requestPermissionsAsync()` if not already granted, and — if denied — doesn't re-prompt on every subsequent rest period that session (`permissionDeniedThisSession` flag); denial just means no background alert, not a broken feature (in-app sound/banner still work while foregrounded).
  - **The module is loaded lazily, not via a static top-level `import`** — a real crash (`[runtime not ready]: expo-notifications: Android Push notifications... removed from Expo Go...`) happens the instant `expo-notifications` is *imported* on Android inside Expo Go, regardless of only using local notifications here. `restNotifications.ts` uses `import type * as NotificationsType from 'expo-notifications'` (types only, erased at compile time) plus a `getNotifications()` helper that `require()`s the real module only when NOT `Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient` (`expo-constants`, added as a direct dependency for this) — every exported function no-ops when it's unavailable rather than crashing. See Robustness Pitfalls #10 for the general lesson.
  - **Android custom sound lives on the notification *channel*, not the notification content** — `ensureAndroidChannel()` creates a `'rest-timer'` channel once with `sound: 'tick.wav'` (referencing the file by name, as bundled via the plugin config below); iOS instead sets `sound` directly on the notification content.
  - **Requires a native rebuild, not just a JS reload — and only fully works in a dev-client/EAS build, not Expo Go.** `app.json`'s `expo-notifications` plugin entry (`{ "sounds": ["./assets/sounds/tick.wav"] }`) bundles the tick sound into the native project so it can be referenced by filename — this is a native/config-plugin change, so `expo start` alone won't pick it up; needs `npx expo run:ios`/`run:android` (or an EAS dev-client build) to take effect. **The notification itself still fires in Expo Go** (permission prompt, banner, default system sound) — only the *custom* tick sound specifically needs the native build, since Expo Go can't register a custom notification sound reliably.

### Exercise Input Rules (coach-facing: program templates, workout assignment, exercise library)
Shared sanitizers in `src/lib/exerciseInput.ts`, used by `CoachPrograms.tsx`, `CoachTrainees.tsx`, and `ExerciseLibraryManager.tsx`:
- `sanitizeCount(v, min, max)` — digits only, clamps in range. Sets: 1–6. Reps: 1–30.
- `sanitizeWeightInput(v)` — digits + single decimal point, blocks a bare `"0"`. The field only takes the number; **`kg` is appended automatically** on save (`withKg`), stripped back off when re-editing (`stripKg`) — the coach never types "kg".
- Trainee's own body weight (`TrainerDashboard.tsx`) has separate rules: numeric only, max 200kg, rejects 0, Save button disabled while invalid.

### Workout Name Lock
Workout name is **not editable** at assignment or edit time in `CoachTrainees.tsx` — shown read-only, always equal to the source program's name. It can only be changed by editing the Program itself in the Programs tab (`updateProgram`).

### Exercise Reordering
Up/down chevron controls exist on exercise rows in `CoachTrainees.tsx`'s assign-workout (step 2) and edit-workout modals. **Not yet implemented** in the Program template builder itself (`CoachPrograms.tsx`) — reordering a template's exercise list isn't possible yet, only a per-trainee workout's.

### Coach Settings Screen (CoachSettings.tsx)
Previously entirely non-functional — hardcoded "Coach Taylor" profile card and 5 menu rows with no `onPress` at all. Now takes `coachId` + `navigation` props (wired in `CoachTabs.tsx`):
- Profile card and "Profile" menu item load the real coach via `getProfile(coachId)` and open a modal showing actual name/email.
- "Notifications" navigates to the Dashboard tab (where the real notification bell/reply flow lives).
- "Privacy" / "Help & Support" / "About FitPro" open small honest info modals (app name/version from `app.json`, plain descriptions of actual app behavior) — deliberately not fabricated legal/policy text.

### Trainee Profile Screen — Coach Card
Header renamed "Your Trainer" → "Your Coach"; removed the redundant "Your coach" caption that repeated directly under the coach's name once the card title already said it.

### Trainee Profile Screen — Weekly Weight Trend
Added a second weight chart (`WeeklyWeightChart` in `ProfileScreen.tsx`), rendered directly below the existing `WeightChart` (which still shows the last 7 raw entries, unchanged). `buildWeeklyWeightBuckets(logs, weeksBack)` groups `weight_logs` into Sunday-start weekly buckets (`startOfWeek`, same convention as `buildWeekBuckets` in `ExerciseLogScreen.tsx`) and averages multiple entries within the same week; renders as a bar chart (last 8 weeks with data) with a total-change figure (green if down/flat, red if up, same color convention as the existing chart). Returns `null` (renders nothing) if fewer than 2 weeks have data yet — the raw-entries chart above already covers the sparse case.

### Trainee Profile Screen — Settings Redesign
The Settings modal (year of birth / sex / height / activity level — the same biometric profile the coach's Calorie & Macro Calculator reads) was previously a flat list of labeled inputs directly in the sheet. Per feedback it read as "raw text," so it's now grouped into bordered field cards (`settingsField`, one per field) each with an icon + label header row (`settingsFieldLabelRow`) instead of a plain caps label, and the "used for calorie targets" hint at the bottom got an info icon. Purely visual — no change to the underlying state, validation, or `updateProfile` save flow.

---

## Coach ↔ Trainee Connection

Replaces the old "coach unilaterally assigns" flow entirely.

- `coach_requests` table: either side can initiate (`initiated_by: 'coach' | 'trainee'`), the other side accepts/declines.
  - Trainee side: `ProfileScreen.tsx` → "Find a Coach" search modal (only shown when no coach assigned) → send request. Incoming coach-initiated requests show as an accept/decline card at the top of the Coach card.
  - Coach side: `CoachTrainees.tsx` → "Find Trainees" search modal → send request. Incoming trainee-initiated requests show in a "Requests" section with accept/decline.
- **Sending a trainee-initiated request notifies the coach** — `sendCoachRequest` (db.ts) sends an in-app message (`👋 {name} wants to connect with you as their coach`) through the same mechanism as the workout-completion notification, so it lights up the coach's notification bell instead of sitting silently until they happen to check the Requests section. Only that direction — a coach-initiated request doesn't yet notify the trainee (wasn't asked for; the trainee still only sees it passively as a card).
- **A trainee can cancel their own outgoing request** — once sent, `ProfileScreen.tsx`'s Coach card shows a "Cancel Request" button beneath the "Request sent — waiting for approval" row (`handleCancelRequest`, only rendered/relevant while `outgoingRequest` is set). Reuses `declineCoachRequest(requestId)` — the same function a coach uses to reject an incoming request — since `getOutgoingCoachRequestForTrainee` only ever returns `status: 'pending'` rows, marking it `'declined'` is functionally identical to deleting it from this screen's perspective, and it also frees the trainee to immediately search and request a different (or the same) coach again (`getCoachRequestStatus` treats `'declined'` as `'none'`).
- Accepting calls `acceptCoachRequest(requestId, coachId, traineeId)` → sets `coach_id` + `status: 'assigned'` (same effect the old direct-assign had).
- Once connected, the coach can then assign a Program (which creates the trainee's `workouts` row from a template) via `CoachTrainees.tsx`'s trainee-detail modal.
- `CoachDashboard.tsx` shows real quick stats (trainee count, program count, 7-day compliance %) and a trainee preview list with a "Find Trainees" shortcut when empty.

---

## Programs as Reusable Templates

- A Program is no longer just metadata — it owns its own exercise list (`program_exercises`: name/sets/reps/weight/sort_order).
- `CoachPrograms.tsx`: Add/Edit Program modals include the full exercise builder (category chips + suggested picker + manual rows), sourced from the shared Exercise Library (see below).
- Tapping a program card opens Edit Program (name/description/duration/difficulty + exercises, all editable).
- When a coach assigns a program to a trainee (`CoachTrainees.tsx`, step 1 → `selectProgram`), the workout builder (step 2) is **pre-filled from the program's template exercises** instead of starting empty — still fully editable per-trainee before finalizing.

---

## Multiple Workouts Per Trainee

Previously a trainee could only ever have one workout — `getWorkoutWithExercises(traineeId)` always fetched the single latest `workouts` row, and assigning a new program silently superseded whatever came before. This is now a genuine multi-workout model:

- **Schema:** `workouts.active` (boolean, default `true`) and `workouts.end_date` (date, nullable) — a coach retires a workout by toggling it inactive rather than deleting it, so it stays visible as history; `end_date` auto-stamps to today when deactivated (and clears if reactivated), so a coach can see how long it actually ran. Migrations: `/private/tmp/scratch/workouts_add_active_flag.sql`, `/private/tmp/scratch/nutrition_templates_and_workout_enddate.sql` (both already run).
- **Schema:** `workouts.scheduled_days` (`smallint[]`, nullable) — weekday numbers (0=Sunday..6=Saturday, matching JS `Date.getDay()`) a coach restricts a workout to; null/empty = no restriction, any day. Migration: `/private/tmp/scratch/workout_scheduled_days.sql` (already run).
- **`db.ts`:** `getWorkoutWithExercises` now takes a **`workoutId`**, not a `traineeId` — it fetches one specific workout, since "the latest one" is no longer a meaningful concept. `getWorkoutsForTrainee(traineeId)` returns *all* of a trainee's workouts (active + inactive), newest first. `setWorkoutActive(workoutId, active)` toggles the flag and stamps/clears `end_date`. `updateWorkoutScheduledDays(workoutId, days)` — empty array is stored as `null`. `createWorkout` always inserts with `active: true`; `scheduled_days` is optional (defaults `null`). `deleteWorkout(workoutId)` — refuses (friendly error) if any `workout_sessions` row references it, since that would orphan completion history; otherwise deletes its `exercises` rows then itself. `getWorkoutIdsCompletedToday(traineeId)` returns workout ids with a session logged since the device's local midnight — **scoped to today only**, not all-time (an earlier version, `getCompletedWorkoutIds`, locked a workout forever after one completion; corrected per feedback — "once a day" meant a daily reset, not a permanent one-time lock).
- **A workout locks for the rest of today once completed, then reopens tomorrow** — enforced by `getWorkoutIdsCompletedToday`, not a permanent flag. Separately, **a coach can restrict a workout to specific weekdays** (`scheduled_days`) — e.g. a "Leg Day" workout set to Mon/Thu only won't show as doable on other days, independent of the daily completion lock.
- **`CoachTrainees.tsx` (coach side):** the trainee-detail modal's "Program" tab is a list of every workout ever assigned, each an expandable row (tap to load its exercises on demand) with an **Edit** button, an **Active/Inactive `Switch`** (toggling off shows "Ended {date}" in the row), and a **delete** (trash) button guarded by `deleteWorkout`'s history check. The row's meta line always shows `scheduledDaysLabel(w.scheduled_days)` ("Any day" or e.g. "Mon, Wed, Fri"). Both the assign flow (step 2 "Build Workout") and the edit-workout modal have a 7-chip weekday picker ("SCHEDULED DAYS (OPTIONAL)") — `DAY_ABBR`/`toggleDay`/`scheduledDaysLabel` helpers, `dayChip`/`dayChipActive` styles. "Assign New Workout" in the status row is always available and always *adds*. The roster card shows each trainee's active-workout count (`traineeActiveCounts`, batch-fetched in `loadData`) instead of a single program name.
- **`WorkoutScreen.tsx` (trainee side):** the tab's landing view is a workout picker with **four** sections — "To Do" (active, scheduled for today or unrestricted, not completed today — tappable, starts logging), "Completed Today" (active, completed today — tappable, read-only, checkmark icon, reopens tomorrow), "Not Today" (active, `scheduled_days` set but today isn't in it — tappable, read-only, calendar icon, shows which days it *is* scheduled for), and "Past" (inactive — tappable, read-only, archive icon). `readOnlyReason` (`'inactive' | 'completed' | 'notToday' | null`) drives which banner/label text shows; `isScheduledForToday()` and `scheduledDaysLabel()` are local helpers mirroring the coach-side ones. Selecting a workout shows a "‹ All Workouts" back row to return to the picker. `submitted`/exercise-log state resets per selected workout via a `useEffect` keyed on `selectedWorkoutId`; finishing also immediately adds the id to local `completedTodayIds` so the picker reflects the lock without waiting for a refetch (it'll drop out of that set again on the next day's fetch).
- **`TrainerDashboard.tsx` (Home) had a workout preview card** (fetched via `getWorkoutsForTrainee`/`getWorkoutWithExercises`, previewing the most recent active workout's top 3 exercises) that was **deliberately non-interactive** — an earlier version made the whole card tappable to jump to the Workout tab, but that read as misleading since tapping it silently launched the workout-picker flow, so it was reverted to a plain preview. Per later feedback that a non-tappable card reads as broken/dead UI rather than "intentionally informational," **it — along with the Weekly Performance bar chart card and the bottom Workouts/Day Streak/Total XP row — was removed from Home entirely**, not just made passive.
- **A "Workout Today" card was later added back to Home**, positioned above Calories Today — unlike the old preview card, this one *is* genuinely actionable: it lists every active workout scheduled for today (via `isScheduledForToday`) that hasn't already been completed today (`getWorkoutIdsCompletedToday`), and each row is tappable. Tapping deep-links into the Workout tab and opens that specific workout directly (`navigation.navigate('Workout', { openWorkoutId })`, read by `WorkoutScreen.tsx` via a `useRoute`/`useNavigation` effect that sets `selectedWorkoutId` then clears the param — same pattern `CoachDashboard` uses for `openTraineeId` → `CoachTrainees`). The card only renders when there's at least one such workout; it's absent otherwise rather than showing an empty state. Home's cards, top to bottom: header, Gamification Hero (level/XP bar/streak), Workout Today (conditional), Calories Today, Today's Activity (steps/weight/water).
- **Heart rate was removed from Today's Activity per feedback** — "not in use yet." The stat tile, the "LOG HEART RATE" input row, and the underlying `hrInput`/`savingHr`/`handleSaveHeartRate` state in `TrainerDashboard.tsx` are all gone. `setTodayHeartRate` (`db.ts`) and `heart_rate` on the `TodayVitals`/`vitals` shape are left in place, untouched, since this may come back later — don't reintroduce the UI without checking whether it's wanted again first.
- **`TrainerDashboard.tsx`'s "Calories Today" card was previously 100% hardcoded** — `—`/"not synced"/"Synced by your coach"/a permanent 0%-width bar, regardless of any real plan or logging — a leftover from before nutrition tracking existed for trainees. Now wired to the same source as `FoodLogScreen.tsx`'s Nutrition tab (see below): today's calories (manual `food_log_entries` + `sumTodayAsPlannedNutrition(...).calories`) against the active plan's `target_calories`, a live-filled progress bar, and the plan's target macros. Honest empty state — "No active nutrition plan" — when there isn't one, instead of the old fake "not synced". **Color-coded per macro, mirrored identically on both `TrainerDashboard.tsx` (Home) and `FoodLogScreen.tsx` (Nutrition tab → "Nutrition" segment):**
  - **Every bar (calories + all three macros) is an `{consumed} / {target}` reading over a `DualBar`** — a two-segment progress bar (local helper, duplicated per-file same as the rest of this card) that fills `colors.success` (green) up to the target on **all four bars**, then — only if over — keeps going in `colors.primary` (red) for the overage amount. All four bars share the same green base deliberately (not each macro's own color) — an earlier version gave protein a red base to match its label, which made a red overflow segment invisible against an already-red bar; green-always-under, red-always-over is the one scheme that reads unambiguously on every bar. `DualBar`'s track width is `max(consumed, target)`, so the base segment shrinks proportionally as the red overage grows, and the two always sum to a full bar.
  - **The `{consumed}/{target}` number text is always plain grey (`colors.textSecondary`)**, on all four rows including calories — it never recolors on over/under; only the bar itself carries that signal. The **macro label word** ("Protein"/"Carbs"/"Fat", not the number, and not the bar) is colored instead — protein `colors.primary` red, carbs `#4A9EFF` blue, fat `colors.gold` yellow — purely to tell the three macro rows apart at a glance, independent of the (always-green/red) bar beneath it.
  - **Protein/Carbs/Fat:** three more bars below the calorie bar, only rendered for whichever targets are actually set. "Consumed" comes from `sumTodayAsPlannedNutrition` (`src/lib/nutritionCalc.ts`), which sums `actual_protein/carbs/fat` off today's "As Planned" meal completions — manual `food_log_entries` only ever carry a calorie figure, no macro breakdown, so these three bars reflect planned-meal tracking only, not ad-hoc manual entries.

---

## Shared Exercise Library

- `exercise_library` table, global — seeded with the original 22 default exercises (Push/Pull/Legs/Core). Since renamed/extended: `Leg Curl` → `Knee Extension`, plus a new `Knee Curl` added.
- **Any coach** can add/edit/delete library entries — deliberately *not* admin-gated (Admin's role per the top-level spec is scoped to third-party sync only, not templates; the whole DB already follows an "any coach manages their own stuff" model with no role-based restrictions).
- `ExerciseLibraryManager.tsx` — full-screen modal: list grouped by category, add/edit/delete. Reachable via "Manage Library" next to "Suggested Exercises" in the Add/Edit Program modals.
- Categories are **dynamic** — derived from whatever categories exist in the library (defaulting to Push/Pull/Legs/Core), not a hardcoded list. A coach can type a brand-new category name directly in the add/edit form.
- Both `CoachPrograms.tsx` and `CoachTrainees.tsx` pull their "suggested exercises" picker from this shared library — there is no more per-file hardcoded exercise list.

---

## Nutrition Plans & Food Log

A "Diet Plan" feature was briefly built as a separate table/tab from the existing PDF-based "Nutrition Plan" feature, then **merged into one concept** per explicit feedback — a diet plan and a nutrition plan are the same thing, and "nutrition" is the preferred term throughout the UI. Not third-party synced data, so it doesn't fall under the root `CLAUDE.md`'s "Admin-only third-party sync" restriction; it follows the same coach-assigns/trainee-logs pattern already established for workouts.

- **Schema:** `nutrition_plans` (per-trainee instances) carries both the original PDF fields (`file_name`/`file_url`/`storage_path`, all nullable — not every plan has a document) and structured fields (`title` not null, `notes`, optional `target_calories`/`target_protein`/`target_carbs`/`target_fat`/`target_water_ml`, `active` boolean default true, `template_id` nullable FK). **A trainee can have several nutrition plans** — some active, some inactive — mirroring `workouts.active` exactly. Migrations: `/private/tmp/scratch/merge_nutrition_diet_plans.sql`, `/private/tmp/scratch/nutrition_templates_and_workout_enddate.sql` (both already run). `target_water_ml` mirrors the other targets exactly (same column on both `nutrition_plans` and `nutrition_plan_templates`) — it's a coach-set daily *goal*, distinct from the `vitals` table's `water` metric (what the trainee actually logged that day).
- **Reusable templates (`nutrition_plan_templates`) — mirrors Programs → Workouts exactly.** A coach sets up a plan once (title, target macros, notes) as a template, then *assigns* it to any number of trainees; assigning copies the template's current values into a new `nutrition_plans` row (`template_id` kept only for provenance) — same snapshot pattern as assigning a Program copies its exercises into a `workouts` row, so later template edits don't retroactively change plans already handed out. This replaced an earlier per-trainee "New Plan" custom-build flow, which didn't match how the rest of the app's coach-authored content works (see Programs).
- **`db.ts`:** `getNutritionTemplates`/`createNutritionTemplate`/`updateNutritionTemplate`/`deleteNutritionTemplate` (template CRUD), `assignNutritionTemplate(traineeId, coachId, template)` (the copy-on-assign function), `getNutritionPlans` (all of a trainee's assigned plans, unchanged), `uploadNutritionPlan` (PDF-only quick add, sets `title` to the filename, no template), `updateNutritionPlan` (edits an assigned plan's copied values), `setNutritionPlanActive`, `deleteNutritionPlan`.
- **New top-level coach tab: "Nutrition"** (`CoachNutritionTemplates.tsx`, in `CoachTabs.tsx` between Programs and Trainees) — list/add/edit/delete templates, mirrors `CoachPrograms.tsx`'s structure (no exercises to manage, just title/notes/targets, so no library/name-picker complexity). Deleting a template does **not** touch trainees already assigned a copy of it (`ON DELETE SET NULL` on `template_id`).
- **Trainee-detail modal tab order (`CoachTrainees.tsx`):** Program, **Nutrition**, Weight, Steps, Chat (`detailTab` array) — Nutrition sits right after Program per feedback; don't reorder back to the old Program/Weight/Steps/Nutrition/Chat sequence.
- **Per-trainee assignment (`CoachTrainees.tsx`):** the trainee-detail modal's "Nutrition" tab is split into a **Plans / History** segmented toggle (`nutritionSubTab`, hidden while the inline plan editor is open). "Plans" is an expandable list (same pattern as the Program tab's workout list) with Edit/Active-toggle/Delete per plan, and two actions up top: "Assign Plan" (opens a picker of the coach's templates — tap one to assign) and "Build Calorie Plan" (opens the calculator — see below). **The old "Upload PDF" quick-add entry point was removed per feedback** — `uploadNutritionPlan` (db.ts) still exists and PDF display (`plan.file_url`/`file_name`, tappable to open) is untouched, but there's no button that calls it anymore; a coach now always goes through a template or the calculator. The old ad-hoc "New Plan" (build from scratch, no template) button was already gone before this. The manual per-plan editor (opened via Edit) has DAILY TARGETS fields for calories/protein/carbs/fat plus a WATER (ML) field (`planWater` state, saved/loaded alongside the others) — all optional. The expanded plan detail view shows a target chip per set field, including water (`{target_water_ml}ml`), and — when the trainee has an active plan with a water target set — a "{today's actual} / {target}ml water today" summary chip above the existing per-day water-intake log, computed from that day's `vitals` row (`selectedTraineeWater[0]`, only counted if its `created_date` is today).
  - **"History"** (new) mirrors the trainee's own Nutrition tab History segment (`FoodLogScreen.tsx`) for the coach: `buildTraineeFoodHistory` pools every plan's meal-tracking (As Planned/Substituted/Skipped) via `planCompletions` — now **eagerly fetched for every plan with meals** as soon as a trainee is selected (`Promise.all` over `getMealCompletions` per plan, right after the main detail-load `Promise.all`), not just the one plan the coach happens to expand — plus the trainee's manual `food_log_entries` (`selectedTraineeFoodLog`, fetched alongside the rest of the detail data via `getFoodLogEntries`), merged into one by-date timeline (today's meal-tracking excluded, same convention as the trainee side; food log entries aren't, since there's no separate "today" view for those on the coach side either). This sits alongside — doesn't replace — each individual plan card's own "ADHERENCE HISTORY" (still there, still per-plan-only), giving the coach a combined view without needing to open every plan.
  - **Water Intake also lives under "History", not "Plans"** — per feedback, it's a record of what the trainee actually drank (real logged history), not plan-management content, so the water target chip + per-day log (previously always shown above both segments) moved to sit above "FOOD LOG HISTORY" inside the History branch instead.
- **A trainee can have one active plan of each *kind* at once, and plan names must be unique per trainee.** A plan's kind is derived purely from `template_id`: non-null (`assignNutritionTemplate`) = a **Nutrition Plan**, null (`uploadNutritionPlan`, `createCalculatedNutritionPlan`) = a **Calorie & Macro Plan**. Originally a trainee could only ever have *one* active plan total, of either kind — changed per feedback, since a coach-assigned Nutrition Plan and a calculator-built Calorie & Macro Plan are conceptually independent and a trainee reasonably has both going at once. Both rules live in `db.ts`, applied uniformly across all three creation paths plus renaming (`updateNutritionPlan`) and the active toggle (`setNutritionPlanActive`) — not just one entry point:
  - `assertUniquePlanTitle(traineeId, title, excludePlanId?)` throws a friendly `Error` (surfaced via `Alert.alert(e.message)` at each call site) if the trainee already has any plan — active or past, either kind — with the same title (trimmed, case-insensitive). Scoped per-trainee, not per-coach, so different trainees reusing a common name like "Cutting Phase" is fine. **Unchanged by the kind split** — a Nutrition Plan and a Calorie & Macro Plan still can't share a name.
  - `deactivateOtherPlans(traineeId, exceptPlanId, isCalculated)` runs after every successful create, and inside `setNutritionPlanActive` when reactivating a past plan — sets every other currently-active plan **of the same kind** (`template_id` null vs. non-null, filtered via `.is()`/`.not()`) for that trainee to `active: false` and stamps `end_date` to today (new `nutrition_plans.end_date` column, migration `/private/tmp/scratch/nutrition_plans_end_date.sql`, mirrors `workouts.end_date`/`setWorkoutActive` exactly, including "reactivating clears it"). So assigning a new Nutrition Plan only retires the previous *Nutrition Plan*, and building/reactivating a Calorie & Macro Plan only retires the previous *Calorie & Macro Plan* — the other kind's active plan is untouched. Retired plans become visible as history (`!plan.active`, `end_date` set) in both the coach's plan list (`CoachTrainees.tsx`, shows "· Ended {date}" next to Created) and the trainee's own Nutrition tab ("· Ended {date}" line, `FoodLogScreen.tsx`).
  - `deactivateOtherPlansLocally(plans, exceptId, keepKind)` + `planKind(plan)` (`CoachTrainees.tsx`) mirror the same same-kind-only logic client-side so the coach's plan list reflects the "other plans of that kind just got retired" outcome immediately, without waiting on a refetch — used everywhere a plan is created/assigned/reactivated locally.
  - **Target display when both kinds are active:** `TrainerDashboard.tsx`'s Home calorie card, `FoodLogScreen.tsx`'s Nutrition segment, and `CoachTrainees.tsx`'s Nutrition → History water chip all used to just `.find()` the (only ever one) active plan with a target set. Now that two can be active, all three were changed to prefer the **Calorie & Macro Plan's** target/water-target over the Nutrition Plan's when both have one set (`activePlans.find(p => p.template_id == null) ?? activePlans[0]`, duplicated per-file same as the rest of that card) — per explicit feedback, since it's the meal-broken-down plan the macro rows already come from.
- **Calorie & Macro Calculator (`CalorieCalculatorModal.tsx`):** a 5-step wizard (Biometrics → Calories → Macros → Meals → Review) launched from "Build Calorie Plan". Computes BMR (Mifflin-St Jeor) and TDEE from the trainee's saved biometrics (birth year/sex/height/activity level, refetched fresh each open) and latest logged weight, lets the coach override the total and set macro percentages (auto-balancing the third when two are edited), generates a meal-by-meal breakdown (`src/data/mealLibrary.ts` + `src/lib/nutritionCalc.ts`) for 3–5 meals/day by diet preference, and includes an optional "DAILY WATER TARGET (ML)" field on the Calories step, carried through to `createCalculatedNutritionPlan` as `target_water_ml` and shown on the Review step's summary. Finalizing locks the resulting plan (`nutrition_plans.locked`); editing it afterward via the plan editor unlocks it again.
  - **Year of birth / sex / height are locked to whichever side set them first.** `lockedFields` state (`{ birthYear, sex, height }`) is derived from the freshly-fetched profile every time the modal opens — if a field is already non-null (whether the trainee set it in their own Profile, or a coach set it in a previous session), the corresponding input is `editable={false}`/disabled with a "Set by the trainee — only they can change it, in their Profile" note and a small lock icon next to the label. A field the trainee never filled in stays coach-editable exactly once — `saveBiometricsAndNext` locks it immediately after a successful save (so going back to this step later in the same session shows it locked too), and it stays locked on every future open since the DB now has a value. **Activity level is deliberately excluded** from this locking — the request was specifically about birth year/sex/height, and activity level isn't really a fixed biological fact the way those are.
  - **Meal picker ("Choose"):** each meal card in the Meals step has a "Choose" button opening a scrollable list (`pickerOptions`, via `templatesForMealType`) of every template eligible for that slot's meal type *and* the trainee's diet — tapping one calls `scaleTemplateToTarget` (extracted out of `generateMealForSlot` so both the auto-generator and the manual picker scale identically) and replaces just that slot. The picker is a second `<Modal>`, so per the app's established two-Modal rule, the outer wizard modal's own `visible` prop is gated on `pickerIndex === null` (same close-outer-before-inner pattern as `CoachPrograms.tsx`'s exercise-name picker) rather than stacking two visible modals. **"Regenerate" (random-swap to the next closest macro-ratio match) was removed** — per feedback it only ever toggled between two options in practice, which read as broken; "Choose" already supersedes it since a coach can just pick from the full list directly.
  - **Diet nesting** (`Diet`/`DIET_RANK`/`satisfiesDiet` in `mealLibrary.ts`, unchanged logic, already correct before this): each template is tagged with the single most-restrictive diet it satisfies, and a trainee on a less-restrictive diet sees every template at-or-below their own rank — vegan(0) ⊂ vegetarian(1) ⊂ pescatarian(2) ⊂ omnivore(3). So a vegetarian trainee's pool also includes vegan-tagged templates, a pescatarian's also includes vegetarian+vegan, and an omnivore's includes all four tiers. This applies identically to both the auto-generator and the "Choose" picker.
  - **Meal library size:** `mealTemplates` has exactly **10 templates per (meal type × diet) cell** — 160 total across Breakfast/Lunch/Dinner/Snack × vegan/vegetarian/pescatarian/omnivore. Combined with diet nesting, an omnivore trainee sees 40 eligible options per meal slot (10 from each tier), a pescatarian 30, a vegetarian 20, a vegan 10.
  - **Kosher-only animal proteins.** Per feedback, every template containing pork/bacon/ham/prosciutto/salami or shellfish (shrimp, crab, mussels, scallops) was removed and replaced with an equivalent using chicken, turkey, beef, lamb, bison, or a fin-and-scale fish (salmon, tuna, cod, halibut, tilapia, mahi mahi, snapper, herring, etc.) — same (meal type × diet) cell, same slot in the count, so the 10-per-cell / 40-for-omnivore figures above still hold exactly. This governs the app's own curated meal content, not a trainee-facing dietary-restriction filter — there's no separate "kosher" toggle; the animal proteins available are just kosher species by construction now. Not a full kosher audit (meat/dairy separation within a single template isn't enforced) — scoped to what was actually asked: excluding non-kosher animals.
- **Trainee side:** 6 bottom tabs — Home, Workout, Nutrition, Medals, Social, Profile. The old standalone "Log" tab is gone; its two segments were split into the two tabs that actually own that content, each now a two-segment screen in its own right:
  - **Workout tab** (`WorkoutTabScreen.tsx`, new) — segmented "Workout" / "History". "Workout" renders `WorkoutScreen.tsx` unchanged (the picker/do-workout flow — see below). "History" renders `ExerciseLogScreen.tsx` (moved here from the old Log tab's "Exercises" segment — read-only workout activity chart + table, see Workout Completion Flow). `WorkoutTabScreen.tsx` owns the single `SafeAreaView` for the tab; both children use a plain `View` so insets aren't applied twice — this meant changing `WorkoutScreen.tsx` itself (previously used standalone, so it owned its own `SafeAreaView`) to also use a plain `View`, across all of its return paths (pending/loading/main), not just the happy path. `WorkoutTabScreen.tsx` also watches `route.params?.openWorkoutId` (the Home "Workout Today" deep link) and forces the segment back to "Workout" if the trainee was sitting on "History" when the link fires — `WorkoutScreen.tsx` itself still owns actually reading/clearing that param.
  - **Nutrition tab** (`FoodLogScreen.tsx`) — segmented "Nutrition" / "History", the toggle now built directly into `FoodLogScreen.tsx` itself (owns its own `SafeAreaView`) rather than a separate wrapper, since both segments share the same already-fetched state (`plans`, `entries`, `completionsByPlan`) and a second wrapper would mean a redundant fetch. **"Nutrition" now shows only the active plan(s)** — per feedback ("show ONLY the current active plan with the consumed macros below it"), reconciled with the fact a trainee can have up to two simultaneously-active plans (one Nutrition Plan, one Calorie & Macro Plan — see below): every plan in `activePlans` gets its own `NutritionPlanCard`, and **each card carries its own "TODAY" progress block directly beneath its target chips** (calorie bar, then macro bars if that plan has a generated `meals` breakdown, then a water bar if it has `target_water_ml`) — no more single shared progress card above the list computed from one "winning" plan. Per-card consumed calories = shared manual `food_log_entries` total (not tied to any one plan) **plus** that specific plan's own `sumTodayAsPlannedNutrition` for "As Planned" meals today, since manual entries realistically count toward every active plan's own budget. Empty states: "Your coach hasn't set up a nutrition plan yet" (no plans at all) vs. "No active plan right now — see History for past plans" (only inactive ones exist).
  - **Past/inactive plans moved to the History tab** — previously shown inline on the Nutrition segment itself under a "PAST PLANS" heading (which didn't match a request to move "old plans" into History), now rendered at the top of "History" (above "FOOD LOG HISTORY") using the same `NutritionPlanCard` with `inactive` set (no "TODAY" block for those, by design — a retired plan has no live target to track against).
  - **"History" pools two sources by date, newest first** — this was initially built as just the day-grouped `food_log_entries` list, but since the manual "Add Food" entry point was removed, that table is basically always empty in practice (nothing writes to it anymore for a normally-used account) and the screen looked like it had "no history" even for trainees who'd been actively tracking. The data that's actually populated is `meal_completions` (As Planned/Substituted/Skipped, one row per plan/meal-slot/day) — previously only visible one plan at a time via each `NutritionPlanCard`'s own collapsible history toggle (`MealHistory`, still there, unchanged). "History" now merges both: `mealHistoryByDate` pools every plan's completions (not just one) keyed by date, `historyDates` unions that with the food-log's own date keys, and each day group renders meal-status badges (icon + `{plan title} • {meal label}` when the trainee has more than one plan with tracked history, else just the meal label) above any food-log entries for that day. Today is excluded from both sources (shown live on the "Nutrition" segment instead), matching `MealHistory`'s own convention.
- **Meal tracking (per-meal, per-day):** when a plan has generated `meals`, each meal row (`MealRow` in `FoodLogScreen.tsx`) lets the trainee mark today's status as As Planned / Substituted / Skipped (`meal_completions` table, one row per trainee/plan/meal-slot/day via `upsertMealCompletion`, migration `/private/tmp/scratch/meal_completions.sql`, already run). Substituted opens a small **modal** ("What did you have instead?", Cancel/Save) rather than an inline row in the scrollable list — see Robustness Pitfalls #6 for why. Cancel and a blank Save both close it without writing anything, so it reverts to whatever it showed before (existing status badge, or the plain track buttons if nothing was logged yet); reopening an existing substitution (tap its status badge) prefills the modal with the note already on file.
- **"As Planned" meals count toward today's calorie total** — `sumTodayAsPlannedNutrition`/`sumTodayAsPlannedCalories` (`src/lib/nutritionCalc.ts`) sum a plan's `meal.actual_calories`/macros for every `meal_completions` row logged today with `status: 'as_planned'` (only active plans; `'substituted'` has no known calorie figure since its note is free text, and `'skipped'` means nothing was eaten). `TrainerDashboard.tsx`'s (Home) calorie card still calls this once across *all* plans for a single combined figure (see the calculator-plan-wins precedence noted above). `FoodLogScreen.tsx` calls it once **per plan** (`[plan]` as the only element) inside `NutritionPlanCard` now, so each plan's own "TODAY" block reflects only its own tracked meals, not every plan's pooled together. `FoodLogScreen.tsx` lifts `meal_completions` fetching up from `NutritionPlanCard` into the parent (`completionsByPlan`, keyed by plan id) specifically so this total updates live the moment a meal is marked, not just on next screen focus.
- **`ProfileScreen.tsx`:** its old "Nutrition Plan" PDF list is now titled "Nutrition Documents", only renders when at least one plan has a `file_url`, and is a quick-access shortcut — full plan management (targets, notes, active state) lives on the Nutrition tab's "Nutrition" segment instead.

---

## Workout Completion Flow

Fully reworked — no more partial-save/resume semantics.

- **Single "Finish" button** (not "Finish Early" / "Complete Workout!"). Visible until the trainee taps it, then permanently hidden — no re-appearing, no "Reset Workout" (each day gets a fresh assigned workout, so resuming doesn't apply).
- Tapping Finish is **terminal**: it saves the session with whatever progress was logged (`progress = setsWithEffort / totalSets`), regardless of whether every exercise was checked off.
- On finish, `WorkoutScreen.handleSubmit`:
  1. `saveWorkoutSession(...)` — `xp_awarded` is the base completion XP + duration bonus (see "XP & Leveling System" below).
  2. **Updates `users.xp` / `users.level`** in one combined write (streak is persisted separately by `recalculateStreak`, called just before this — see below), folding in the workout XP, the daily-streak bonus, and any newly-earned medal XP — a single source of truth for the profile update rather than multiple writes racing each other.
     - Level: `computeLevelFromXp(xp)` (`mockData.ts`) — see "XP & Leveling System" below for the actual curve.
  3. `evaluateAndAwardMedals(userId, newStreak)` — see "XP & Leveling System" below.
  4. Auto-sends a message to the trainee's coach (see Coach Notifications below) — no XP/points mentioned at all, per feedback that coaches don't need score detail, just that the client did the work.
- Workout count on dashboards is derived live from `workout_sessions` rows — no separate counter needed.

## XP & Leveling System

Reworked twice this session, converging on the "Fitness App Gamification & Leveling System" + "Fitness App Achievements & XP Values" specs. Superseded prior sessions' models: a flat 250×progress-per-workout system, then briefly a weekly-gated system (`evaluateWeeklyCompletion`, `users.weekly_streak`/`last_completed_week_start`) — **fully removed**, code and columns both (the columns were dropped in a later cleanup pass, migration `/private/tmp/scratch/drop_unused_weight_logs_and_streak_cols.sql`, already run) — don't reintroduce code that reads/writes them.

### Earning XP (immediate — nothing is gated on weekly completion anymore)

All in `WorkoutScreen.handleSubmit` unless noted:

- **`WORKOUT_COMPLETE_XP = 10`** — flat, every finish, regardless of completion %.
- **Duration bonus** — `+2 XP` (`DURATION_BONUS_XP_PER_10_MIN`) per full 10 minutes elapsed between opening the workout screen and tapping Finish (`sessionStartedAt` ref, set when `selectedWorkoutId` changes; floored, so under 10 minutes = no bonus). This is a proxy for actual exercise time (screen-open-to-Finish), not a dedicated stopwatch — there's no pause/resume UI, and time isn't currently persisted per-session (only used transiently to compute this bonus), so it can't yet support hypothetical "cumulative hours trained" achievements (100 Hours / 250 Hours in the achievement spec — see Deferred below).
- **Daily-streak bonus** — `+2 XP` (`DAILY_STREAK_XP`), but only the *first* completion of a given calendar day (checked against `priorHistory` — a second workout the same day doesn't re-trigger it).

### Streak (`users.streak`)

`recalculateStreak(traineeId)` (`db.ts`) recomputes the streak from scratch from full activity history every time, rather than incrementing a stored counter — a day counts as active if the trainee completed a workout (`workout_sessions`) **or** tracked any nutrition that day (`meal_completions`, or a `food_log_entries` row, if that entry point ever comes back — see 2.2 note on the manual "Add Food" removal). It's called from two places: `WorkoutScreen.handleSubmit` (workout completion) and `FoodLogScreen.tsx`'s `MealRow.handleSetStatus` (any meal marked As Planned/Substituted/Skipped).

**A single active day is not shown as a streak.** Per feedback ("it's not a streak" for just one day), `computeStreakFromActiveDays` counts consecutive active days ending today and returns `0` unless that count is `>= 2` — so day 1 shows `0`, day 2 (consecutive) jumps straight to `2`, day 3 to `3`, etc. A gap resets to `0`, same as before. This replaced the old `computeNewStreak` (WorkoutScreen.tsx), which only looked at workout history and returned `1` for a single day.
- **Medal bonus** — whatever newly-earned medals' `xpReward` sum to (see Medals below), folded into the same combined write.
- **"Invite a Friend" (+2 XP, `INVITE_FRIEND_XP`)** — awarded to the *original sender* the moment their friend request is accepted (`acceptFriendRequest`, db.ts), not for merely sending it (avoids rewarding spam invites that never land). Not a medal/badge, just a direct XP grant — this item doesn't appear in the later, more detailed achievement spec, so it was left as-is from the earlier gamification spec.
- **"Coach Connected"** is technically a medal (id `10`, 10 XP) but awarded from `acceptCoachRequest` (db.ts), not `evaluateAndAwardMedals` — see Medals below for why.

Running/distance-based rewards (per-km, personal speed records, marathon) from the original gamification spec are **deliberately out of scope** — the app has no GPS/distance tracking at all.

### Leveling — 10 named levels, then a formula

`src/data/mockData.ts`: `LEVEL_TITLES` (10 names, Rookie Mover → Apex Legend), `LEVEL_TABLE_CUMULATIVE` (hardcoded cumulative XP per level, `[0, 20, 56, 124, 228, 376, 576, 836, 1166, 1576]`), and `cumulativeXpForLevel(level)` / `computeLevelFromXp(xp)` / `getXpForNextLevel(level)` / `getCurrentLevelXp(xp)` / `getLevelTitle(level)`.

- **The spec's own stated formula (`20 * (Level-1)^1.5`) does NOT reproduce its own 10-level table past Level 3** — e.g. it gives 540 for Level 10, not the table's 1,576. The table's own per-level increments *are* internally consistent (they sum to its own cumulative totals exactly), so **the table is the source of truth for Levels 1–10**, hardcoded rather than formula-derived. Don't try to "fix" this by re-deriving Levels 1–10 from the formula — that was checked and rejected; the table is intentional.
- **Levels 11+** (past the named table) use the spec's formula for each additional level's *increment*, **anchored onto Level 10's real total (1,576)** rather than restarting from the formula's own raw absolute value. This matters: the raw formula alone gives only ~632 for "Level 11" — using it unanchored would mean a trainee jumps from Level 10 to **~Level 19 in a single instant** the moment they cross 1,576 XP (verified by computing it out — this was caught and explicitly rejected, not a hypothetical). The anchored version telescopes to `1576 + 20*(level-1)^1.5 - 20*9^1.5` — monotonically increasing, no jump, just a gentler curve than Levels 1–10 (e.g. Level 10→11 needs 92 XP vs. Level 9→10's 410).
- **Level titles beyond 10** are generic `"Level N"` — the spec only names 10 levels.
- `ProfileScreen.tsx` and `GamificationScreen.tsx` both use `getLevelTitle(level)` for the displayed title band — `ProfileScreen.tsx` previously **hardcoded** "New Adventurer" regardless of actual level (a pre-existing bug, fixed alongside this); `GamificationScreen.tsx` previously had its own inline 4-band title logic (5/10/20 thresholds, different names) — replaced with the shared helper so there's one source of truth.

---

## Medals (Real, Not Mock)

- `user_medals` table tracks actually-earned medals (`medal_id`, `earned_at`) — previously **every medal was hardcoded `earned: false`**, nothing was ever awarded.
- **Catalog covers all 100 named achievements from the "100 Achievements" list, plus 3 pre-existing legacy entries** (`4` "100 Workouts", `5` Top Ranker, `7` New Adventure — from before that list existed; kept, not part of the 100). Every one of the 100 is visible in the Medal Collection per explicit request ("add in all these achievements... so they can be seen in the app"), even the ones nothing can auto-award yet — an honest "not yet earned" card, not fabricated progress. They split into three groups in `mockMedals` (`mockData.ts`), each with its own section comment:
  1. **Achievements with their own directly-computed trigger** — the original ~20 built the session before this (streaks at 3/7/14/21/30 days, workout-count milestones, steps, time-of-day, profile completeness, coach connection, first weight log, "Next Level" = 2nd workout ever assigned).
  2. **Achievements that are the SAME event as one of those, under this app's current model** — no coached/self-directed or strength/cardio workout-type distinction exists here, so e.g. *Welcome Aboard*, *Logged & Done*, *Plan Starter*, *First Rep*, and *Coach Approved* are all literally "first ever completed workout," same as *First Step*. `evaluateAndAwardMedals` awards **all** matching ids together the instant their shared condition is met (see the `firstWorkout`/`tenWorkouts`/`twentyFiveWorkouts`/`fiftyWorkouts`/`hundredWorkouts` booleans and the `checks` array, db.ts) — every one of the 100 names gets its own card and its own `user_medals` row, rather than collapsing to a single representative name like the first pass did.
  3. **Catalog-only, not yet auto-awarded** — needs a feature the app doesn't have (see the breakdown below). ~63 of the 100.
- **`evaluateAndAwardMedals(userId, streak)`** recomputes an accurate lifetime session count itself via `getWorkoutSessionCount(traineeId)` (a `count`-only Supabase query), fixing a real pre-existing bug: the old approach used `priorHistory.length + 1` where `priorHistory` came from `getTraineeHistory`'s **default limit of 20** — meaning the higher workout-count milestones could *never* have fired correctly for any trainee with more than ~20 sessions. New helper queries in `db.ts`, all doing their own full-history scan (not capped like `getTraineeHistory`): `getWorkoutSessionCount`, `getDistinctActiveDayCount` (distinct calendar days with a session — two workouts the same day count once), `hasCompletedInHourRange(traineeId, minHour, maxHour)` (morning/evening detection), `getMaxDailySteps` (highest single-day `vitals` steps entry ever).
- **`Coach Connected` (id `10`) is deliberately NOT checked in `evaluateAndAwardMedals`** — a trainee can't have completed any workout at all without a coach already assigned (workouts only exist once a coach assigns them), so checking it at workout-completion time would always co-fire with `First Step` and never mean anything as its own event. Instead it's awarded directly in `acceptCoachRequest` (db.ts) via a new `awardMedalIfNew(userId, medalId)` helper — looks up the medal's `xpReward` and folds it into its own `updateProfile` xp/level write, for the (small) set of medals earned outside the workout-completion flow that don't have an existing combined-write call site to piggyback on.
- **XP is genuinely duplicated across several ids sharing one trigger** — e.g. hitting 100 workouts awards `4` 100 Workouts (50 XP), `32` Century Club (50 XP), AND `97` 100 Workouts Strong (50 XP) all at once, since all three exist as separate named achievements in the spec. This is intentional per the "every one of the 100 should be earnable" request, not a bug — a trainee's XP total legitimately jumps by more than one card's worth when a shared milestone is crossed. A few duplicate-trigger pairs even have *different* XP per the spec itself (e.g. `16` 10 Workouts Strong is 20 XP but `81` Data Driven — same `sessionsCount >= 10` trigger — is 15 XP); both are awarded at their own specified value rather than normalized to match.
- `GamificationScreen.tsx` merges the static `mockMedals` definitions (name/icon/rarity/xpReward) with real earned state from `getUserMedals(userId)` — unchanged mechanism, just a much bigger catalog now (103 entries); its medals grid is a plain `flexWrap` layout, so it scales with no layout changes needed.

### Deferred achievements (~63 of the 100 — not silently dropped, just not buildable yet)

- **Weight-based PRs** (`Progressive`, `Personal Best`, `PR Hunter`, `PR Collector`, `Stronger Than Before`): `exercise_weight_logs` entries are written from the **coach-assigned weight** (`ex.coachWeight`), not anything the trainee enters — see "Workout Screen (Trainee)" above, weight is display-only for the trainee. Building this would reward a *coach's* decision to raise prescribed weight, not the trainee's own performance, so it was skipped rather than implemented with misleading semantics. Needs either trainee-editable performance logging or a dedicated coach-initiated weight-progression feature first.
- **Coach check-ins / feedback / challenges / coach-set targets as trackable events** (`First Check-In`, `Feedback Friend`, `Question Asked`, `Coach's Challenge`, `Team Player`, `Coach Check-In`, `Feedback Applied`, `Coach's Milestone`, `Stronger Together`, `Go The Distance`): the `messages` table exists but isn't structured as check-ins/feedback/challenges/targets — no distinct event types to key off of.
- **Fitness goals** (`Goal Setter`, `Level Up`): no "goal" concept anywhere in the schema.
- **Sleep tracking** (`Sleep Champion`, `Sleep Streak`): not tracked at all.
- **Progress photos** (`Photo Finish`): no photo upload feature.
- **Mobility / recovery / rest-day session types** (`Stretch Starter`, `Flexible Future`, `Recovery Pro`, `Cool Down`, `Rest Day Respect`, `Recovery Matters`, `Recovery Streak`, `Balance Builder`): workouts have no category (Strength/Cardio/Mobility/Recovery) — every workout is just "a workout."
- **Distance/running** (`First Mile`, `Cardio Starter`, `5K Finisher`, `10K Finisher`, `Endurance Builder`, `Cardio Regular`, `Distance Builder`, `Long Haul`, `Go The Distance`): no GPS/distance tracking, and no per-session duration is persisted to compute "longest workout" from either (see 100/250 Hours below).
- **Cumulative training hours** (`100 Hours`, `250 Hours`): would need per-session duration to be *persisted* (currently only computed transiently for the workout-XP duration bonus, then discarded) — needs a new `workout_sessions` column + migration.
- **Weekly/monthly schedule-adherence percentages** (`On Track`, `Perfect Week`, `Perfect Month`, `Week Warrior`, `Month Master`, `Never Miss Twice`, `7-Day Mover`, `Movement Month`): this is essentially the removed `evaluateWeeklyCompletion` engine's logic — buildable (the algorithm already existed once this session before being retired), just not rebuilt in this pass given everything else already in scope.
- **Ambiguous/undefined thresholds** (`Move More`, `Step Up`, `Active Day`, `Weekend Warrior`, `Active Hour`, `Walk It Out`, `Trend Setter`, `Proof of Progress`, `Progress Month`): no defined baseline/threshold in the spec to compute against (e.g. "daily activity goal" isn't a value that exists anywhere).
- **Long-horizon tenure / plan-completion states** (`Committed`, `Plan Complete`, `Transformation Journey`, `One Year Strong`, `Fitness Lifestyle`): "12 weeks of structured training" / "finish your first training plan" / "12 months of consistent training, tracking, and coaching" aren't states this app's data model can currently evaluate precisely.
- **Progress-review workflow** (`Progress Revealed`): no "review with your coach" feature — separate from the already-automated `Progress Logged`/`Progress Check` (a weight log entry).

---

## Coach Notifications

No push notifications — in-app only, built on the existing `messages` table:
- Trainee finishing a workout auto-sends a message to their coach: `🏋️ {name} completed "{workout}" — {pct}% done`. **No XP/points ever mentioned** — per explicit feedback, a coach needs to know a client did the work (or, in the future, finished an eating plan), not their score. Was previously `..., +{xp} XP`; removed entirely rather than just hidden when `0` (see the XP rework in "Workout Completion Flow" above for why `0` became the common case).
- **A trainee-initiated coach request also notifies the coach** — `sendCoachRequest(coachId, traineeId, initiatedBy)` (db.ts) sends `👋 {trainee's name} wants to connect with you as their coach` the moment a trainee sends one (`initiatedBy === 'trainee'` only). Previously the request just sat silently in the "Requests" section of `CoachTrainees.tsx` with nothing surfacing it — a coach had no way to know one had arrived short of manually checking that tab. Isolated in its own try/catch so a notification failure never blocks the request itself. **Coach-initiated requests don't get the equivalent notification on the trainee's side** — not built, since that wasn't what was reported; the trainee still only sees it passively as an accept/decline card at the top of their Coach card (`ProfileScreen.tsx`).
- `CoachDashboard.tsx` has a notification bell in the header with a red-dot badge; tapping opens a modal listing them.
- **Notifications persist** — `getMessagesForCoach(coachId)` fetches all messages to the coach (read + unread), not just unread (unlike the retired `getUnreadMessagesForCoach`, which made notifications vanish forever the moment they were marked read, since only the unread set was ever fetched). Opening the modal still marks unread ones read (`markMessageRead`), but they stay visible in the list — marked with a small dot — until explicitly deleted.
- Each notification row has a delete button (`deleteMessage(id)`) so the coach can clear old ones instead of being stuck with a growing list.
- Tapping a notification (not its delete button) opens a reply-chat modal scoped to that trainee (`openChatWithTrainee`) — see Messaging below.
- Trainee's own chat button (`TrainerDashboard.tsx`) — the unread dot now only renders when there's a genuine unread message from the coach (`dbMessages.some(m => m.from_id === coachId && !m.read)`). It used to always render whenever a coach was assigned, regardless of unread state.
- That same messages fetch used to run in a plain `useEffect` keyed on `[coachId, userId]` — since `coachId` only changes once (when first assigned), it never refetched again, so a new message arriving while the trainee was on another tab wouldn't flip the badge on until something else forced a remount. Converted to `useFocusEffect` so it re-checks every time Home regains focus, same pattern as `loadHome`.

---

## Program Assignment & Lifecycle

Program *templates* (as opposed to a trainee's assigned *workouts* — see Multiple Workouts Per Trainee above, which is the current model for assignment/switching/roster display).

- **Deleting a program:** `deleteProgram(programId)` in `db.ts` — refuses (throws a friendly error, caught by `CoachPrograms.tsx` and shown via `Alert`) if any `workouts` row still references the program, since that would silently orphan a trainee's program link. Deletes the program's own `program_exercises` rows first, then the `programs` row. UI: trash icon on each program card, confirm via `Alert.alert`.

---

## Data Model Notes

### Exercise (mockData.ts / DB)
- `reps` field is a single number string (e.g. `'8'`), never a range (e.g. `'8-10'`) — trainee-facing.
- Coach-facing exercise builders now clamp reps to 1–30 and sets to 1–6 (see Exercise Input Rules above); this also affects legacy library entries with non-numeric reps like the seeded `"60s"` for Plank — editing it will clamp it to a plain number, which is an accepted side-effect of the new numeric rule, not something specially handled.

### Key state in WorkoutScreen.tsx
```ts
interface SetLog { reps: string; weight: string; effort: number | null; }
interface ExerciseLog {
  id: string; name: string; coachSets: number; coachReps: string;
  coachWeight?: string; completed: boolean; sets: SetLog[];
}

const [submitted, setSubmitted] = useState(false);   // terminal once true — no resume
const [modalXp, setModalXp] = useState(0);
const [modalIsComplete, setModalIsComplete] = useState(false);   // cosmetic only now
const [newlyEarnedMedalIds, setNewlyEarnedMedalIds] = useState<string[]>([]);
```

---

## Messaging

### Trainee → Coach
- Message button in `TrainerDashboard.tsx` header is **only shown when `coachId` is not null**; unread dot only shown when there's an actual unread message (see Coach Notifications above).
- Modal header shows real coach name/avatar loaded from DB (`getProfile(coachId)`) — no hardcoded name.
- Opening the modal calls `markMessagesRead(userId, coachId)`.
- **Online status is real**, via `useIsUserOnline` (`src/lib/presence.ts`) — was previously a hardcoded "● Online" regardless of whether the coach was actually using the app (an instance of the same "don't fabricate data that looks real" issue as the old fake admin dashboard stats). Shows "Offline" (not just hidden) when false — an honest state, not an absence of one.

### Coach → Trainee
- Coaches can now reply/initiate: `CoachDashboard.tsx`'s notification-triggered reply modal, and a dedicated "Chat" tab in `CoachTrainees.tsx`'s trainee-detail modal for messaging any trainee proactively, not just in response to a notification.

### Online presence (`src/lib/presence.ts`)
- Real Supabase Realtime **Presence** (ephemeral, socket-based — not a DB table, no migration needed). `useTrackOwnPresence(userId)` is called once, in `RootNavigator.tsx`, for whichever role is logged in — marks that session online while the app is foregrounded (`AppState`-gated; backgrounding untracks immediately rather than waiting on a socket-drop timeout). `useIsUserOnline(targetUserId)` reports whether that specific user id is currently tracked.
- **Module-level singleton, not one channel per hook call.** Supabase's realtime client reuses the same channel *object* for a given topic name — a second independent `supabase.channel('online-users')` call (e.g. from `useIsUserOnline` mounted in some other screen) returns that same, already-subscribed channel, and calling `.on()` on it throws `cannot add presence callbacks for realtime:online-users after subscribe()`. Hit this for real once `useIsUserOnline` was used from a screen mounted alongside `useTrackOwnPresence`. Fixed by making `useTrackOwnPresence` the *sole* creator/subscriber of the channel (module-level `sharedChannel` var); `useIsUserOnline` never calls `supabase.channel(...)` itself, only reads `sharedChannel.presenceState()`, kept reactive via a plain `listeners` Set that `notify()`s on every presence sync/join/leave and on the tracked channel's own mount/unmount. Don't reintroduce a second `supabase.channel(ONLINE_CHANNEL)` call anywhere.
- Only wired up where it's actually shown: the trainee's "Message Coach" modal. Nothing else in the app currently surfaces an online indicator.
- **Caveat:** admin "Login as &lt;coach&gt;" impersonation (see root `CLAUDE.md`) tracks presence under the *admin's own* real `auth.uid()`, not the impersonated coach's id — so a trainee wouldn't see their coach as "online" while an admin is impersonating them. Not handled; edge case, admin-only.

### Chat keyboard-avoidance (all three chat UIs: `TrainerDashboard.tsx`'s "Message Coach" modal, `CoachDashboard.tsx`'s reply modal, `CoachTrainees.tsx`'s Chat tab)
`KeyboardAvoidingView`'s Android `'height'`/`'padding'` auto-behavior does not reliably compose with content rendered inside a `<Modal>`, and — this took several rounds of screenshot-driven debugging to pin down — a **`transparent` `<Modal>` on Android is fundamentally the wrong container for a keyboard-avoiding chat screen**: its native window appears to size itself off its direct child's own reported box, so *any* shrink of that box for the keyboard (a raw `marginBottom` on it, or an `onLayout`-driven explicit height further down that changes the tree's size) shrinks the whole native window, exposing the real screen behind it undimmed. Multiple margin/measurement variations were tried on the two small `transparent` sheet modals and each either left the message list collapsed or exposed the background.

**Fix that actually stuck: all three are now genuine full-screen (non-`transparent`) `<Modal>`s**, structured identically — `fullScreenContainer`/`fullScreenSheet` (`useSafeAreaInsets()` applied as manual `paddingTop`/`paddingBottom`, not `SafeAreaView`, per the existing "SafeAreaView unreliable inside a Modal" gotcha below) → a plain header row with a `closeBtn` → `KeyboardAvoidingView` (`behavior={Platform.OS === 'ios' ? 'padding' : undefined}`, `style={{flex:1}}`, `onLayout` capturing its real height into a `chatAreaHeight` state) → the message `ScrollView` given an **explicit computed height** (`chatAreaHeight - keyboardOffset - 64`, floored at 80) once the keyboard is open, `flex:1` otherwise → the input row. `useKeyboardOffset` (`src/lib/useKeyboardOffset.ts`) tracks real keyboard height via native events, Android-only. With no background screen left to expose, the whole "transparent Modal shrinks to content" failure mode is moot — don't reintroduce a `transparent` sheet-style modal for a chat screen; if a new one is ever needed, copy this full-screen shape from the start rather than re-deriving it.

Each of the three chats also needed its own `scrollToEnd` on the message `ScrollView` (via a ref, re-fires on new messages / keyboard open) — none of them auto-scrolled to the latest message before, it just never showed as a bug while the box was always tall enough to show everything unscrolled.

---

## Social & Rankings

### Trainee Social Screen (SocialScreen.tsx)
- All tabs use **real DB data** — no mock leaderboard.
- **Global tab:** only shows users with `xp > 0`. Empty state if no one has XP yet. "Your Rank" card only appears if you are on the leaderboard.
- **Friends tab:** empty state + "Find Friends" button → search modal (search by name/email, send friend request, shows pending/accepted status). Pending friend requests shown at top with Accept button.
- **My Gym tab:** empty state "your coach will add you to a gym" if `gym_id` is null. Shows gym leaderboard if assigned. **Bug fixed:** `getGymLeaderboard` used to filter `.gt('xp', 0)` — copy-pasted from the Global tab's deliberate "hide 0-XP nobodies" behavior — which silently dropped any gym member who hadn't logged XP yet (e.g. a just-assigned trainee) from a *trainee's own* view of their gym, even though the coach's own Rankings screen (`CoachRankings.tsx`, unfiltered `getMyTrainees`) showed them fine. A gym is a small, coach-curated roster — every member the coach added should show up regardless of XP — so that filter was removed from `getGymLeaderboard` specifically; `getLeaderboard`'s Global-tab filter is untouched and still intentional.

### Coach Rankings Screen (CoachRankings.tsx)
- **My Gym section:** coach can create a gym (one per coach), add trainees by name/email search, remove members.
- **My Trainees section:** real leaderboard of assigned trainees sorted by XP — empty state if no trainees yet.
- `coachId` prop passed from `CoachTabs.tsx`.

### DB functions (db.ts)
- `getLeaderboard()`, `getGymLeaderboard(gymId)`, `getFriends(userId)`, `searchUsers(query, excludeId)`, `sendFriendRequest`, `acceptFriendRequest`, `getPendingFriendRequests`, `getFriendshipStatus`, `createGym`, `getCoachGym`, `addToGym`, `removeFromGym` — all unchanged except `getGymLeaderboard`, which had its 0-XP filter removed (see "Bug fixed" note above).

---

## Robustness Pitfalls (learned the hard way this session — watch for these patterns)

1. **Never gate `setLoading(false)` behind a `try` with no `catch`.** `CoachPrograms.tsx` and `CoachTrainees.tsx` both originally had a load effect where any Supabase error (flaky network, RLS hiccup) left the screen stuck on a full-screen spinner forever — including hiding action buttons like "Add Program" that had nothing to do with the failing query. Fix pattern: always `try { ... } catch { setLoadError(true) } finally { setLoading(false) }`, and don't gate primary actions behind a data-load spinner if they don't actually depend on that data.
2. **Hooks must never sit after an early `return`.** `WorkoutScreen.tsx` had a `useMemo` positioned after two conditional early returns (`if (loadingWorkout) return...`, `if (isPending) return...`), so the hook only ran once loading finished — a different hook count between the first and second render, which crashes with "Rendered more hooks than during the previous render." Always put every hook call before any conditional return, no exceptions.
3. **Every `<Modal>` needs `onRequestClose`.** None of the ~18 `Modal`s in the app passed it — on Android, the hardware/gesture back button does nothing while a `Modal` is open unless `onRequestClose` is wired up, which reads as "stuck" (reported first via the coach↔trainee chat modal, but it was universal). Fix pattern: `onRequestClose` should call the exact same handler as the modal's own visible close/X button, so both paths behave identically.
4. **A `flex: 1` child needs a bounded ancestor, not just any ancestor.** `CoachTrainees.tsx`'s trainee-detail modal was a bottom sheet (`maxHeight: '90%'`, no `flex`) containing a `ScrollView` styled `flex: 1` — since the sheet itself only sizes to its content (bounded by `maxHeight`, not stretched to fill), the `ScrollView` had no resolved height to flex into and collapsed to ~0, so the tab content was there in the tree but invisible on screen. Reported as "menu comes up but you can't see the information." Fixed by making the modal genuinely full-screen (`SafeAreaView` + `flex: 1` sheet) instead of patching around it — a `flex: 1` descendant only works if every ancestor up the chain is itself flexed/bounded, not auto-sized.
5. **`KeyboardAvoidingView`'s `behavior` prop needs a real value on Android too — `undefined` disables it entirely.** `FoodLogScreen.tsx`'s inline meal-substitute `TextInput` (see Nutrition Plans & Food Log below) was covered by the keyboard on Android because its wrapper used `behavior={Platform.OS === 'ios' ? 'padding' : undefined}` — every other `KeyboardAvoidingView` in the app correctly uses `'height'` on Android, not `undefined`; this one didn't, and Android is the tested platform (see Dev Environment Setup). Fixed, but did not fully resolve the underlying "can't see what I'm typing" report on its own — see next point.
6. **Don't try to scroll a `TextInput` into view above the keyboard inside a plain `ScrollView` on Android by hand — there's no first-party solution, and two different measure-and-`scrollTo` attempts (`onFocus` + `measureLayout` against a `findNodeHandle`'d ancestor; then `Keyboard.addListener('keyboardDidShow', ...)` + `measureInWindow` against the keyboard's reported height) both failed on-device for `FoodLogScreen.tsx`'s meal-substitute note field.** Stopped hand-rolling it and moved the note entry into a small `Modal` instead (`overlay`/`sheet`/`KeyboardAvoidingView` pattern, shared with the trainee's coach-chat modals elsewhere in the app) — a modal sits above the keyboard by construction, no position math needed. **General lesson: when an inline `TextInput` inside a scrollable list needs to stay visible above the keyboard on Android, default to a modal/bottom-sheet for that input rather than computing a scroll offset** — it reuses an already-proven pattern instead of a fragile one.
7. **Never have two separate `<Modal>` components both `visible={true}` at once — iOS won't reliably show/register touches on the second one stacked over the first (Android tolerates it fine).** This bit twice in the same session, both in the coach-facing "manage X" screens where a detail/editor modal has buttons that open a further picker modal on top of it:
   - `CoachTrainees.tsx`: "Assign Plan" and "Build Calorie & Macro Plan", inside the already-open trainee-detail modal, opened a *second* modal (the nutrition-template picker / `CalorieCalculatorModal`) without closing the first. Fixed via a `nutritionTrainee` capture state: close the trainee-detail modal (`setSelectedTrainee(null)`) before opening either nutrition modal, restore it on that modal's close/cancel/success.
   - `CoachPrograms.tsx`: the Add/Edit Program modal's "Manage Library" link (opens `ExerciseLibraryManager`) and its per-exercise "Select exercise name" field (opens the exercise name-picker modal) had the identical bug — both open a second modal without closing Add/Edit Program first. Fixed with the same capture-and-restore shape, generalized slightly since two different outer modals (`showAddProgram`/`showEditProgram`) share the same two inner modals: a single `reopenAfterModal: 'add' | 'edit' | null` state plus `closeOuterForInner(which)` / `reopenOuterAfterInner()` helpers, wired into every place either inner modal opens or closes (including `openNamePicker`, `handlePickName`, `handleAddNewName`, and both the picker's `onRequestClose` and its own X button).
   - The codebase already had the correct pattern for this exact situation on the *workout* side (`openAssignModal`'s "Assign New Workout" button, `CoachTrainees.tsx`) before either of the above were noticed — this is a recurring shape any time a "detail/editor modal with an inner picker button" gets added, not a one-off.
   - **Rule of thumb: before opening any new `<Modal>` from inside code that's already rendering inside another visible `<Modal>`, close the outer one first** (capturing whatever state it was holding, if the new modal or its callbacks need it), and restore it when the inner one closes. None of the outer modal's in-progress form state needs to live on its visibility flag for this to be safe — check that it doesn't (it shouldn't, per the general React state-design in this codebase) before assuming a close/reopen won't lose data.
8. **A decrement-per-tick countdown "freezes" when the app is backgrounded — RN fully suspends JS timers, it doesn't just slow them down.** `WorkoutScreen.tsx`'s rest timer used to store `secondsLeft` and decrement it via a `setTimeout` re-armed every second; while backgrounded, no ticks fire at all, so it'd sit frozen at whatever value it hit right before backgrounding and then resume counting down from there once foregrounded — silently understating how much rest time had actually passed. **Fix pattern: for any UI countdown/timer that must reflect real elapsed time across a possible backgrounding, store a fixed target timestamp (`endAt = Date.now() + durationMs`) instead of a decrementing counter, and derive the displayed remaining time from `endAt - Date.now()` on every tick** — this is correct by construction the moment the app resumes, with no special-case backgrounding logic needed. Pair it with an `AppState.addEventListener('change', ...)` → `'active'` handler that forces one extra recompute immediately on foreground, so the display doesn't wait up to a full tick interval to visibly correct itself.
9. **A native module call can throw synchronously and crash the whole app uncaught — backgrounding-adjacent audio calls especially.** Fixing pitfall #8 above introduced a new crash: the rest timer's tick sound (`tickPlayer.play()`, `expo-audio`) fired from the `AppState` 'active' recompute or an interval tick landing right at a background transition, and iOS refuses to activate an `AVAudioSession` while backgrounded/mid-transition — `UnexpectedException: Session activation failed (ExpoModulesCore/SyncFunctionDefinition.swift)`, an uncaught JS error that crashed the app (repro: background the app while resting, foreground briefly, then background again right before the timer hits its final 5 seconds). Fixed by (a) only attempting playback when `AppState.currentState === 'active'`, and (b) wrapping the call in `try/catch` anyway, since the check itself has a race window (backgrounding can start in the instant between the check and the native call). **General lesson: any call into a native module that can plausibly be foreground-only (audio, camera, sensors) needs a `try/catch` around it regardless of any `AppState` guard — Expo's sync native bridge throws synchronously, it doesn't reject a promise, so a bare call can crash the whole app instead of just failing that one feature.**
10. **`expo-notifications` crashes the whole app the instant it's *imported* on Android inside Expo Go — not just when you call a push/remote-token function.** Repro: `[runtime not ready]: Error: expo-notifications: Android Push notifications (remote notifications) functionality provided by expo-notifications was removed from Expo Go with the release of SDK 53. Use a development build instead of Expo Go.` — thrown from the module's own top-level setup code (`addPushTokenListener`, called automatically on import), even though `restNotifications.ts` (see "Rest timer between sets" above) only ever uses *local* scheduled notifications, nothing push/remote at all. Expo Go's check doesn't distinguish local from remote usage — merely having the module loaded is enough. **A `Platform.OS === 'android'` runtime guard placed after a static top-level `import * as Notifications from 'expo-notifications'` does NOT help** — the static import is hoisted and always evaluates regardless of any code that runs after it. Fixed in `restNotifications.ts` by switching to `import type * as NotificationsType from 'expo-notifications'` (type-only — erased at compile time, no runtime `require()`) for typing, plus a `getNotifications()` helper that lazily `require('expo-notifications')`s the real module only when NOT `Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient` (Expo Go, detected via the newly-added `expo-constants` dependency) — every exported function checks this and no-ops (returns `null`/does nothing) rather than crashing when it's unavailable. iOS Expo Go is unaffected (Apple didn't remove local-notification support there) — this is Android + Expo Go specifically; a dev-client/EAS build on Android would also be unaffected (only Expo Go itself carries the SDK 53 restriction). **General lesson: for any Expo module known to have Expo Go restrictions, prefer a lazy `require()` behind an environment check over a static `import` + runtime guard — some modules have crash-on-import side effects that a downstream `if` can't prevent.**

---

## Performance & Efficiency Patterns

### General Rules Applied
- Use `Promise.all([...])` for independent DB calls that can run in parallel — never sequential `.then()` chains for unrelated queries.
- Wrap expensive computed values in `useMemo` — only recalculate when specific dependencies change.
- Wrap event handlers and callbacks in `useCallback` when passed as props to child components.
- Wrap list-item components in `React.memo` when rendered in large maps (leaderboards, medal grids).
- Update local state directly after mutations instead of refetching from DB when possible.

### Fixes Applied Per File

**`db.ts`**
- `getExerciseWeightLogs` has a default `limit: 100` — prevents unbounded fetches.
- `getAllUserFriendships(userId)` — single query for all friendship records; avoids N per-user `getFriendshipStatus` calls during search.
- `getUnreadMessagesForCoach` does 2 queries (messages, then a single `in()` lookup for sender profiles) rather than an embedded join, to avoid depending on guessed FK constraint names.

**`TrainerDashboard.tsx`**
- First `useEffect`: 4 DB calls batched into one `Promise.all` (profile, weights, workout, history).
- Second `useEffect`: 2 DB calls batched into one `Promise.all` (messages, coach profile); `userId` in deps.
- `weeklyPerf`/`weeklyDone`/`weeklyXp`/`weeklyAvgCompletion` combined into one `useMemo([sessionHistory])`.
- `handleSaveWeight`, `handleSend`, `handleWeightChange`, `openMsgModal` wrapped in `useCallback`.

**`SocialScreen.tsx`**
- `RankRow` wrapped in `React.memo`.
- `allFriendships` cached in state; search annotates results locally with no extra DB calls.
- `loadAll`, `handleSearch`, `handleAddFriend`, `handleAccept` all wrapped in `useCallback`.

**`WorkoutScreen.tsx`**
- `toggleExercise` and `updateSet` wrapped in `useCallback` (functional setState, no deps needed).
- `completedCount`/`totalSets`/`loggedSets`/`progress`/`isFullyComplete` combined into one `useMemo([exercises])` — positioned before all early returns (see Robustness Pitfalls).

**`GamificationScreen.tsx`**
- `MedalCard` wrapped in `React.memo`.

**`CoachPrograms.tsx` / `CoachTrainees.tsx`**
- Suggested-exercise handlers wrapped in `useCallback`; `activeCategoryItems`/`editActiveCategoryItems` derived via `useMemo` filtering the shared library by active category.
- After mutations, local state is updated directly instead of a full refetch where practical (e.g. deleting a nutrition plan, accepting a request into `trainees`).

**`CoachRankings.tsx`**
- `sorted` array wrapped in `useMemo([trainees])`.

---

## Pending / Future Work
- **Security: RLS lockdown migration written, not yet run.** A security review found every table's RLS was allow-all, meaning any authenticated anon-key user could bypass all client-side role/ownership checks directly via PostgREST — including self-promoting to `role: 'admin'`. Fix is `fitpro_rls_lockdown.sql` (real per-table policies scoped to `auth.uid()`/`coach_id`/`trainee_id`, an admin-bypass baked into every coach-ownership check so "Login as &lt;coach&gt;" impersonation keeps working, a trigger blocking any non-admin `users.role` change, and two new SECURITY DEFINER RPCs — `redeem_coach_invite` and `accept_coach_request` — replacing client-side reads/writes of `coach_invites` and the coach-request accept flow). Matching app-code changes already made: `signUp()` no longer takes a `role` param (always inserts as `trainee`), `signUpCoach()` calls the new RPC instead of reading/updating `coach_invites` directly, `acceptCoachRequest()` calls `accept_coach_request` instead of a raw `users` update, `assignTraineeToCoach()` removed (superseded by the RPC). **Once the user has run the migration in the Supabase SQL Editor**, update the "Database Tables" section below (drop the "allow-all" line) and verify with a REST read using the anon key, not the SQL editor connection (which runs as `postgres` and bypasses RLS, so it can't be used to confirm policies are actually enforced).
- **Not yet addressed (lower priority, found during the same review):** `uploadFileToStorage` (`db.ts`) authenticates storage uploads with the hardcoded anon key as the bearer token instead of the caller's real session `access_token` — harmless while storage bucket policies are themselves unexamined/possibly-permissive, but should be fixed together with an actual look at the `nutrition-plans` bucket's storage.objects policies (not covered by the migration above — RLS lockdown there was scoped out this pass to avoid touching bucket policies blind).
- iOS Simulator: not validated end-to-end. Android emulator is the tested path.
- **Rest-end notification's custom tick sound needs a dev-client/EAS build** (`npx expo run:ios` / `run:android`, or an EAS dev-client build) — see "Rest timer between sets" above. Testing via plain Expo Go still exercises the permission prompt and the notification firing, just with the default system sound instead of the bundled tick.
- Weight editing: trainee's per-set weight is still display-only during a workout, per original trainer request. May need a coach-initiated flow to update prescribed weights.
- Leaderboard: Social screen's weekly-challenge card still uses `mockData`, not real data.
- Medals: `Top Ranker` is not auto-awarded yet (needs a leaderboard-rank query) — see Medals section. `Early Bird`/`Night Owl` (time-of-day) ARE now automated, don't reintroduce this as still-pending.
- ~63 of the 100 achievements in the catalog are visible but not yet auto-awarded — they need features that don't exist (weight-based PRs, coach check-ins/feedback/challenges/coach-set targets, goals, sleep, progress photos, mobility/recovery/rest-day categorization, distance/running, cumulative training hours, weekly/monthly schedule-adherence %, long-horizon tenure) — full breakdown in the Medals section's "Deferred achievements" list.
- Exercise reordering exists for a trainee's assigned workout but not yet for Program templates themselves.
- No dedicated coach→trainee compose UI — only the automatic workout-completion notification exists in that direction.
- **Known live-data cleanup (not a code bug):** trainee `c5ca9d38-b5a3-4889-b07a-86911461dce4` has 3 active workouts assigned ("Day 1 Workout", "Upper", "Tennis session"). Checked directly against the DB — no duplicate-creation bug found anywhere in the assign flow; this is the multi-workout-per-trainee feature working as designed (see "Multiple Workouts Per Trainee" above), but "Day 1 Workout" (assigned Aug 7) looks like a stale leftover from before "Upper" (Aug 29) was assigned and was likely just never manually deactivated by the coach. Flagged rather than touched, since deactivating/deleting it is a real-data change on a live trainee's account, not a code fix.
