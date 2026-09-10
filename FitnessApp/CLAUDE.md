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
| `public.weight_logs` | Daily body weight entries per trainee |
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

---

## Coach ↔ Trainee Connection

Replaces the old "coach unilaterally assigns" flow entirely.

- `coach_requests` table: either side can initiate (`initiated_by: 'coach' | 'trainee'`), the other side accepts/declines.
  - Trainee side: `ProfileScreen.tsx` → "Find a Coach" search modal (only shown when no coach assigned) → send request. Incoming coach-initiated requests show as an accept/decline card at the top of the Coach card.
  - Coach side: `CoachTrainees.tsx` → "Find Trainees" search modal → send request. Incoming trainee-initiated requests show in a "Requests" section with accept/decline.
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
- **A "Workout Today" card was later added back to Home**, positioned above Calories Today — unlike the old preview card, this one *is* genuinely actionable: it lists every active workout scheduled for today (via `isScheduledForToday`) that hasn't already been completed today (`getWorkoutIdsCompletedToday`), and each row is tappable. Tapping deep-links into the Workout tab and opens that specific workout directly (`navigation.navigate('Workout', { openWorkoutId })`, read by `WorkoutScreen.tsx` via a `useRoute`/`useNavigation` effect that sets `selectedWorkoutId` then clears the param — same pattern `CoachDashboard` uses for `openTraineeId` → `CoachTrainees`). The card only renders when there's at least one such workout; it's absent otherwise rather than showing an empty state. Home's cards, top to bottom: header, Gamification Hero (level/XP bar/streak), Workout Today (conditional), Calories Today, Today's Activity (steps/weight/water/heart rate).
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
- **Per-trainee assignment (`CoachTrainees.tsx`):** the trainee-detail modal's "Nutrition" tab is an expandable list (same pattern as the Program tab's workout list) with Edit/Active-toggle/Delete per plan. Three actions up top: "Upload PDF" (quick), "Assign Plan" (opens a picker of the coach's templates — tap one to assign), and "Build Calorie Plan" (opens the calculator — see below). The old ad-hoc "New Plan" (build from scratch, no template) button is gone. The manual per-plan editor (opened via Edit) has DAILY TARGETS fields for calories/protein/carbs/fat plus a WATER (ML) field (`planWater` state, saved/loaded alongside the others) — all optional. The expanded plan detail view shows a target chip per set field, including water (`{target_water_ml}ml`), and — when the trainee has an active plan with a water target set — a "{today's actual} / {target}ml water today" summary chip above the existing per-day water-intake log, computed from that day's `vitals` row (`selectedTraineeWater[0]`, only counted if its `created_date` is today).
- **Calorie & Macro Calculator (`CalorieCalculatorModal.tsx`):** a 5-step wizard (Biometrics → Calories → Macros → Meals → Review) launched from "Build Calorie Plan". Computes BMR (Mifflin-St Jeor) and TDEE from the trainee's saved biometrics (birth year/sex/height/activity level, refetched fresh each open) and latest logged weight, lets the coach override the total and set macro percentages (auto-balancing the third when two are edited), generates a meal-by-meal breakdown (`src/data/mealLibrary.ts` + `src/lib/nutritionCalc.ts`) for 3–5 meals/day by diet preference, and includes an optional "DAILY WATER TARGET (ML)" field on the Calories step, carried through to `createCalculatedNutritionPlan` as `target_water_ml` and shown on the Review step's summary. Finalizing locks the resulting plan (`nutrition_plans.locked`); editing it afterward via the plan editor unlocks it again.
  - **Year of birth / sex / height are locked to whichever side set them first.** `lockedFields` state (`{ birthYear, sex, height }`) is derived from the freshly-fetched profile every time the modal opens — if a field is already non-null (whether the trainee set it in their own Profile, or a coach set it in a previous session), the corresponding input is `editable={false}`/disabled with a "Set by the trainee — only they can change it, in their Profile" note and a small lock icon next to the label. A field the trainee never filled in stays coach-editable exactly once — `saveBiometricsAndNext` locks it immediately after a successful save (so going back to this step later in the same session shows it locked too), and it stays locked on every future open since the DB now has a value. **Activity level is deliberately excluded** from this locking — the request was specifically about birth year/sex/height, and activity level isn't really a fixed biological fact the way those are.
  - **Meal picker ("Choose"):** each meal card in the Meals step has a "Choose" button opening a scrollable list (`pickerOptions`, via `templatesForMealType`) of every template eligible for that slot's meal type *and* the trainee's diet — tapping one calls `scaleTemplateToTarget` (extracted out of `generateMealForSlot` so both the auto-generator and the manual picker scale identically) and replaces just that slot. The picker is a second `<Modal>`, so per the app's established two-Modal rule, the outer wizard modal's own `visible` prop is gated on `pickerIndex === null` (same close-outer-before-inner pattern as `CoachPrograms.tsx`'s exercise-name picker) rather than stacking two visible modals. **"Regenerate" (random-swap to the next closest macro-ratio match) was removed** — per feedback it only ever toggled between two options in practice, which read as broken; "Choose" already supersedes it since a coach can just pick from the full list directly.
  - **Diet nesting** (`Diet`/`DIET_RANK`/`satisfiesDiet` in `mealLibrary.ts`, unchanged logic, already correct before this): each template is tagged with the single most-restrictive diet it satisfies, and a trainee on a less-restrictive diet sees every template at-or-below their own rank — vegan(0) ⊂ vegetarian(1) ⊂ pescatarian(2) ⊂ omnivore(3). So a vegetarian trainee's pool also includes vegan-tagged templates, a pescatarian's also includes vegetarian+vegan, and an omnivore's includes all four tiers. This applies identically to both the auto-generator and the "Choose" picker.
  - **Meal library size:** `mealTemplates` has exactly **10 templates per (meal type × diet) cell** — 160 total across Breakfast/Lunch/Dinner/Snack × vegan/vegetarian/pescatarian/omnivore. Combined with diet nesting, an omnivore trainee sees 40 eligible options per meal slot (10 from each tier), a pescatarian 30, a vegetarian 20, a vegan 10.
  - **Kosher-only animal proteins.** Per feedback, every template containing pork/bacon/ham/prosciutto/salami or shellfish (shrimp, crab, mussels, scallops) was removed and replaced with an equivalent using chicken, turkey, beef, lamb, bison, or a fin-and-scale fish (salmon, tuna, cod, halibut, tilapia, mahi mahi, snapper, herring, etc.) — same (meal type × diet) cell, same slot in the count, so the 10-per-cell / 40-for-omnivore figures above still hold exactly. This governs the app's own curated meal content, not a trainee-facing dietary-restriction filter — there's no separate "kosher" toggle; the animal proteins available are just kosher species by construction now. Not a full kosher audit (meat/dairy separation within a single template isn't enforced) — scoped to what was actually asked: excluding non-kosher animals.
- **Trainee side:** 6 bottom tabs — Home, Workout, Nutrition, Medals, Social, Profile. The old standalone "Log" tab is gone; its two segments were split into the two tabs that actually own that content, each now a two-segment screen in its own right:
  - **Workout tab** (`WorkoutTabScreen.tsx`, new) — segmented "Workout" / "History". "Workout" renders `WorkoutScreen.tsx` unchanged (the picker/do-workout flow — see below). "History" renders `ExerciseLogScreen.tsx` (moved here from the old Log tab's "Exercises" segment — read-only workout activity chart + table, see Workout Completion Flow). `WorkoutTabScreen.tsx` owns the single `SafeAreaView` for the tab; both children use a plain `View` so insets aren't applied twice — this meant changing `WorkoutScreen.tsx` itself (previously used standalone, so it owned its own `SafeAreaView`) to also use a plain `View`, across all of its return paths (pending/loading/main), not just the happy path. `WorkoutTabScreen.tsx` also watches `route.params?.openWorkoutId` (the Home "Workout Today" deep link) and forces the segment back to "Workout" if the trainee was sitting on "History" when the link fires — `WorkoutScreen.tsx` itself still owns actually reading/clearing that param.
  - **Nutrition tab** (`FoodLogScreen.tsx`) — segmented "Nutrition" / "History", the toggle now built directly into `FoodLogScreen.tsx` itself (owns its own `SafeAreaView`) rather than a separate wrapper, since both segments share the same already-fetched state (`plans`, `entries`, `completionsByPlan`) and a second wrapper would mean a redundant fetch. "Nutrition" shows Active/Past nutrition plan cards (target macro chips including water, notes, tappable PDF link if attached) plus Calories Today / water progress bars. If any active plan has `target_calories` set, shows a "today's calories / target" progress bar; if any active plan has `target_water_ml` set, a second progress bar shows today's actual water intake (`getTodayMetrics(userId).water_ml`, the same phone-independent manual/synced total used on the trainee's Home screen) against that target.
  - **"History" pools two sources by date, newest first** — this was initially built as just the day-grouped `food_log_entries` list, but since the manual "Add Food" entry point was removed, that table is basically always empty in practice (nothing writes to it anymore for a normally-used account) and the screen looked like it had "no history" even for trainees who'd been actively tracking. The data that's actually populated is `meal_completions` (As Planned/Substituted/Skipped, one row per plan/meal-slot/day) — previously only visible one plan at a time via each `NutritionPlanCard`'s own collapsible history toggle (`MealHistory`, still there, unchanged). "History" now merges both: `mealHistoryByDate` pools every plan's completions (not just one) keyed by date, `historyDates` unions that with the food-log's own date keys, and each day group renders meal-status badges (icon + `{plan title} • {meal label}` when the trainee has more than one plan with tracked history, else just the meal label) above any food-log entries for that day. Today is excluded from both sources (shown live on the "Nutrition" segment instead), matching `MealHistory`'s own convention.
- **Meal tracking (per-meal, per-day):** when a plan has generated `meals`, each meal row (`MealRow` in `FoodLogScreen.tsx`) lets the trainee mark today's status as As Planned / Substituted / Skipped (`meal_completions` table, one row per trainee/plan/meal-slot/day via `upsertMealCompletion`, migration `/private/tmp/scratch/meal_completions.sql`, already run). Substituted opens a small **modal** ("What did you have instead?", Cancel/Save) rather than an inline row in the scrollable list — see Robustness Pitfalls #6 for why. Cancel and a blank Save both close it without writing anything, so it reverts to whatever it showed before (existing status badge, or the plain track buttons if nothing was logged yet); reopening an existing substitution (tap its status badge) prefills the modal with the note already on file.
- **"As Planned" meals count toward today's calorie total** — `sumTodayAsPlannedCalories` (`src/lib/nutritionCalc.ts`) sums a plan's `meal.actual_calories` for every `meal_completions` row logged today with `status: 'as_planned'` (only active plans; `'substituted'` has no known calorie figure since its note is free text, and `'skipped'` means nothing was eaten). This is added on top of manual `food_log_entries` calories in **both** places that show a "calories today" figure — `FoodLogScreen.tsx`'s progress bar and `TrainerDashboard.tsx`'s (Home) calorie card — via one shared function, so the two screens can't disagree. `FoodLogScreen.tsx` lifts `meal_completions` fetching up from `NutritionPlanCard` into the parent (`completionsByPlan`, keyed by plan id) specifically so this total updates live the moment a meal is marked, not just on next screen focus.
- **`ProfileScreen.tsx`:** its old "Nutrition Plan" PDF list is now titled "Nutrition Documents", only renders when at least one plan has a `file_url`, and is a quick-access shortcut — full plan management (targets, notes, active state) lives on the Nutrition tab's "Nutrition" segment instead.

---

## Workout Completion Flow

Fully reworked — no more partial-save/resume semantics.

- **Single "Finish" button** (not "Finish Early" / "Complete Workout!"). Visible until the trainee taps it, then permanently hidden — no re-appearing, no "Reset Workout" (each day gets a fresh assigned workout, so resuming doesn't apply).
- Tapping Finish is **terminal**: it saves the session with whatever progress was logged (`progress = setsWithEffort / totalSets`), regardless of whether every exercise was checked off.
- On finish, `WorkoutScreen.handleSubmit`:
  1. `saveWorkoutSession(...)` — as before.
  2. **Really updates `users.xp` / `users.level` / `users.streak`** (this never happened before this session — XP/streak/level were static after signup).
     - XP: `+= Math.round(250 * progress)`.
     - Level: `computeLevelFromXp(xp) = floor(xp / 500) + 1` (added to `mockData.ts`).
     - Streak: last-session-date logic — consecutive day → `+1`, same day → unchanged, gap → reset to `1`.
  3. `evaluateAndAwardMedals(userId, sessionsCount, newStreak)` — see Medals below.
  4. Auto-sends a message to the trainee's coach (see Coach Notifications below).
- Workout count on dashboards is derived live from `workout_sessions` rows — no separate counter needed.

---

## Medals (Real, Not Mock)

- `user_medals` table tracks actually-earned medals (`medal_id`, `earned_at`) — previously **every medal was hardcoded `earned: false`**, nothing was ever awarded.
- `evaluateAndAwardMedals` (db.ts) checks the objectively-computable rules and awards any newly-qualified ones after each workout finish:
  - `1` First Workout (sessions ≥ 1), `7` New Adventure (sessions ≥ 1), `2` 7-Day Streak (streak ≥ 7), `3` 30-Day Streak (streak ≥ 30), `4` 100 Workouts (sessions ≥ 100).
- **Deliberately not automated yet:** `5` Top Ranker (needs a leaderboard-rank query) and `6` Early Bird (needs historical time-of-day analysis across sessions) — flagged as future work, not silently skipped.
- `GamificationScreen.tsx` merges the static `mockMedals` definitions (name/icon/rarity/xpReward) with real earned state from `getUserMedals(userId)` — `mockMedals` itself is unchanged, only the `earned` flag is now real.
- Medal titles by level are unchanged: 1–4 "New Adventurer", 5–9 "Rising Star", 10–19 "Consistent Athlete", 20+ "Elite Athlete".

---

## Coach Notifications

No push notifications — in-app only, built on the existing `messages` table:
- Trainee finishing a workout auto-sends a message to their coach (`🏋️ {name} completed "{workout}" — {pct}% done, +{xp} XP`).
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

### Coach → Trainee
- Coaches can now reply/initiate: `CoachDashboard.tsx`'s notification-triggered reply modal, and a dedicated "Chat" tab in `CoachTrainees.tsx`'s trainee-detail modal for messaging any trainee proactively, not just in response to a notification.

---

## Social & Rankings

### Trainee Social Screen (SocialScreen.tsx)
- All tabs use **real DB data** — no mock leaderboard.
- **Global tab:** only shows users with `xp > 0`. Empty state if no one has XP yet. "Your Rank" card only appears if you are on the leaderboard.
- **Friends tab:** empty state + "Find Friends" button → search modal (search by name/email, send friend request, shows pending/accepted status). Pending friend requests shown at top with Accept button.
- **My Gym tab:** empty state "your coach will add you to a gym" if `gym_id` is null. Shows gym leaderboard if assigned.

### Coach Rankings Screen (CoachRankings.tsx)
- **My Gym section:** coach can create a gym (one per coach), add trainees by name/email search, remove members.
- **My Trainees section:** real leaderboard of assigned trainees sorted by XP — empty state if no trainees yet.
- `coachId` prop passed from `CoachTabs.tsx`.

### DB functions (db.ts)
- `getLeaderboard()`, `getGymLeaderboard(gymId)`, `getFriends(userId)`, `searchUsers(query, excludeId)`, `sendFriendRequest`, `acceptFriendRequest`, `getPendingFriendRequests`, `getFriendshipStatus`, `createGym`, `getCoachGym`, `addToGym`, `removeFromGym` — all unchanged this session.

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
- iOS Simulator: not validated end-to-end. Android emulator is the tested path.
- Weight editing: trainee's per-set weight is still display-only during a workout, per original trainer request. May need a coach-initiated flow to update prescribed weights.
- Leaderboard: Social screen's weekly-challenge card still uses `mockData`, not real data.
- Medals: `Top Ranker` and `Early Bird` are not auto-awarded yet (need leaderboard-rank and time-of-day queries respectively) — see Medals section.
- Exercise reordering exists for a trainee's assigned workout but not yet for Program templates themselves.
- No dedicated coach→trainee compose UI — only the automatic workout-completion notification exists in that direction.
