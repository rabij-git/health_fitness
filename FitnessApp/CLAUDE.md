@AGENTS.md

# Session Notes & Decisions

## Dev Environment Setup
- **Framework:** React Native / Expo SDK 56
- **Node version:** v20.20.2 via nvm (minimum >=20.19.4 required for Expo 56)
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

### Workout Screen (Trainee)
- **Per-set table layout** with columns: `SET | REPS | WEIGHT | EFFORT`
- Each exercise shows one row per set (not a single combined row)
- Coach reps shown as **single numbers** (e.g. `8`, not `8-10`)
- **Reps input rules (trainee logging a set):** number-pad only, clamped between `0` and `coachReps + 8`, non-numeric stripped
- **Weight field:** Display only for the trainee — no keyboard, no editing
- **Effort rating:** per-set buttons 0–4 (RIR — Reps In Reserve), colors `#4CAF50 → #8BC34A → #FF9800 → #FF5722 → #E94560`

### Exercise Input Rules (coach-facing: program templates, workout assignment, exercise library)
Shared sanitizers in `src/lib/exerciseInput.ts`, used by `CoachPrograms.tsx`, `CoachTrainees.tsx`, and `ExerciseLibraryManager.tsx`:
- `sanitizeCount(v, min, max)` — digits only, clamps in range. Sets: 1–6. Reps: 1–30.
- `sanitizeWeightInput(v)` — digits + single decimal point, blocks a bare `"0"`. The field only takes the number; **`kg` is appended automatically** on save (`withKg`), stripped back off when re-editing (`stripKg`) — the coach never types "kg".
- Trainee's own body weight (`TrainerDashboard.tsx`) has separate rules: numeric only, max 200kg, rejects 0, Save button disabled while invalid.

### Workout Name Lock
Workout name is **not editable** at assignment or edit time in `CoachTrainees.tsx` — shown read-only, always equal to the source program's name. It can only be changed by editing the Program itself in the Programs tab (`updateProgram`).

### Exercise Reordering
Up/down chevron controls exist on exercise rows in `CoachTrainees.tsx`'s assign-workout (step 2) and edit-workout modals. **Not yet implemented** in the Program template builder itself (`CoachPrograms.tsx`) — reordering a template's exercise list isn't possible yet, only a per-trainee workout's.

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

## Shared Exercise Library

- `exercise_library` table, global — seeded with the original 22 default exercises (Push/Pull/Legs/Core). Since renamed/extended: `Leg Curl` → `Knee Extension`, plus a new `Knee Curl` added.
- **Any coach** can add/edit/delete library entries — deliberately *not* admin-gated (Admin's role per the top-level spec is scoped to third-party sync only, not templates; the whole DB already follows an "any coach manages their own stuff" model with no role-based restrictions).
- `ExerciseLibraryManager.tsx` — full-screen modal: list grouped by category, add/edit/delete. Reachable via "Manage Library" next to "Suggested Exercises" in the Add/Edit Program modals.
- Categories are **dynamic** — derived from whatever categories exist in the library (defaulting to Push/Pull/Legs/Core), not a hardcoded list. A coach can type a brand-new category name directly in the add/edit form.
- Both `CoachPrograms.tsx` and `CoachTrainees.tsx` pull their "suggested exercises" picker from this shared library — there is no more per-file hardcoded exercise list.

---

## Nutrition Plans

- `nutrition_plans` table + public `nutrition-plans` Storage bucket.
- Coach uploads a scanned PDF via the trainee-detail modal's "Nutrition" tab in `CoachTrainees.tsx` (`expo-document-picker`, restricted to `application/pdf`).
- Trainee views/opens their plan(s) on `ProfileScreen.tsx`, directly below the Body Weight chart. Tapping opens the file via `Linking.openURL`.

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
- `CoachDashboard.tsx` has a notification bell in the header with a red-dot badge (`getUnreadMessagesForCoach`); tapping opens a modal listing them and marks them read (`markMessageRead`).
- Trainee's own chat button (`TrainerDashboard.tsx`) — the unread dot now only renders when there's a genuine unread message from the coach (`dbMessages.some(m => m.from_id === coachId && !m.read)`). It used to always render whenever a coach was assigned, regardless of unread state.

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
- No dedicated compose UI yet — the only coach→trainee-originated messages today are the automatic workout-completion notification. Real-time coach-initiated chat is not built.

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

**`ExerciseLogScreen.tsx`**
- `handleAddEntry`: reduced from 2 fetches to 1 — single `getExerciseWeightLogs` call after save, then derives both `logs` and `selected` from the result.

---

## Pending / Future Work
- iOS Simulator: not validated end-to-end. Android emulator is the tested path.
- Weight editing: trainee's per-set weight is still display-only during a workout, per original trainer request. May need a coach-initiated flow to update prescribed weights.
- Leaderboard: Social screen's weekly-challenge card still uses `mockData`, not real data.
- Medals: `Top Ranker` and `Early Bird` are not auto-awarded yet (need leaderboard-rank and time-of-day queries respectively) — see Medals section.
- Exercise reordering exists for a trainee's assigned workout but not yet for Program templates themselves.
- No dedicated coach→trainee compose UI — only the automatic workout-completion notification exists in that direction.
