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

- **Coach tabs** (`CoachTabs.tsx`): Dashboard, Programs, **Trainees**, Rankings, Settings.
  - `Trainees` is its own tab — trainee search/requests/roster live there, not mixed into Programs.
  - `Programs` is template-only: program list + a full-width "Add Program" CTA at the top.
- **Trainee tabs** (`TrainerTabs.tsx`, note: "Trainer" here is the trainee-facing role name, confusingly): Home, Workout, Log, Medals, Social, Profile.

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
- **Finish gating:** the Finish button is disabled (with a hint text) until at least one set has a logged effort rating — previously a workout could be "finished" with zero progress logged, which still counted toward medal eligibility and sent a misleading "0% done, +0 XP" notification to the coach.
- **Log tab integration:** finishing a workout now writes an `exercise_weight_logs` entry (via `logExerciseWeight`) for every exercise that had at least one set's effort logged, using that day's coach-assigned sets/reps/weight — previously the Log tab was entirely disconnected from workout completion and always stayed empty. `ExerciseLogScreen.tsx` (the "Exercises" segment of the Log tab) is now **read-only** — the "Add Today's Weight" manual-entry modal was removed entirely; the log is exclusively a byproduct of finishing workouts, never hand-typed.
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

- **Schema:** `workouts.active` (boolean, default `true`) — a coach retires a workout by toggling it inactive rather than deleting it, so it stays visible as history. Migration: `/private/tmp/scratch/workouts_add_active_flag.sql` (already run).
- **`db.ts`:** `getWorkoutWithExercises` now takes a **`workoutId`**, not a `traineeId` — it fetches one specific workout, since "the latest one" is no longer a meaningful concept. `getWorkoutsForTrainee(traineeId)` returns *all* of a trainee's workouts (active + inactive), newest first. `setWorkoutActive(workoutId, active)` toggles the flag. `createWorkout` always inserts with `active: true`.
- **`CoachTrainees.tsx` (coach side):** the trainee-detail modal's "Program" tab is now a list of every workout ever assigned, each an expandable row (tap to load its exercises on demand) with an **Edit** button and an **Active/Inactive `Switch`**. "Assign New Workout" in the status row is always available and always *adds* — there's no more "Switch Program" replace semantics. The roster card shows each trainee's active-workout count (`traineeActiveCounts`, batch-fetched in `loadData`) instead of a single program name.
- **`WorkoutScreen.tsx` (trainee side):** the tab's landing view is now a workout picker — "Active" workouts (tappable, start logging) and "Past" workouts (tappable, opens a read-only exercise list — no effort inputs, no Finish button, since only active workouts can be completed). Selecting a workout shows a "‹ All Workouts" back row to return to the picker. `submitted`/exercise-log state resets per selected workout via a `useEffect` keyed on `selectedWorkoutId`.
- **`TrainerDashboard.tsx` (Home):** the workout preview card fetches `getWorkoutsForTrainee` and previews the most recent *active* one (`primaryWorkout`) — top 3 exercises, no overflow count. **Deliberately non-interactive** — an earlier version of this card made the whole thing (plus a "+N more exercises"/"+N more active workouts" line) tappable to jump to the Workout tab, but that read as misleading ("I thought it just showed me what exercises were there") since tapping it silently launched the workout-picker flow. Reverted to a plain preview; picking/starting a workout only happens via the bottom Workout tab button.

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

- **Schema:** `nutrition_plans` now carries both the original PDF fields (`file_name`/`file_url`/`storage_path`, all nullable — not every plan has a document) and the structured fields absorbed from the short-lived `diet_plans` table (`title` not null, `notes`, optional `target_calories`/`target_protein`/`target_carbs`/`target_fat`, `active` boolean default true). **A trainee can have several nutrition plans** — some active, some inactive — mirroring the `workouts.active` model exactly (a coach retires one via a toggle rather than deleting it). Migration: `/private/tmp/scratch/merge_nutrition_diet_plans.sql` (already run; the old `diet_plans` table was dropped, it never held real data).
- **`db.ts`:** `getNutritionPlans` (all plans for a trainee, unchanged signature), `uploadNutritionPlan` (PDF-only quick add, sets `title` to the filename), `createNutritionPlan` (structured-only, no PDF), `updateNutritionPlan`, `setNutritionPlanActive`, `deleteNutritionPlan` (storage removal is now conditional on `storage_path` being present, since structured-only plans have none).
- **Coach side (`CoachTrainees.tsx`):** single "Nutrition" tab in the trainee-detail modal — same expandable-list-with-`Switch`-toggle pattern as the Program tab's workout list (exercises fetched on demand → here, everything's already loaded, so expand is just local state). Two buttons up top: "Upload PDF" (quick, unchanged flow) and "New Plan" (structured editor: title, target macros, notes — inline in the tab, not a separate modal). Each row can be edited, toggled active/inactive, or deleted; if a plan has an attached PDF it shows a tappable file row inside the expanded view.
- **Trainee side:** no new bottom tab was added (6 tabs was already the ceiling) — the existing **Log tab is a segmented control** (`LogScreen.tsx`): "Exercises" (`ExerciseLogScreen.tsx`, read-only — see Workout Completion Flow) and "Nutrition" (`FoodLogScreen.tsx`) — shows Active/Past nutrition plan cards (target macro chips, notes, tappable PDF link if attached) plus the day-by-day food log below (grouped "Today"/"Yesterday"/weekday, add/delete entries). If any active plan has `target_calories` set, shows a "today's calories / target" progress bar. `LogScreen.tsx` owns the single `SafeAreaView` for the tab; `ExerciseLogScreen.tsx`/`FoodLogScreen.tsx` use plain `View` so insets aren't applied twice (neither is ever rendered standalone).
- **`ProfileScreen.tsx`:** its old "Nutrition Plan" PDF list is now titled "Nutrition Documents", only renders when at least one plan has a `file_url`, and is a quick-access shortcut — full plan management (targets, notes, active state) lives on the Log tab's Nutrition segment instead.

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
