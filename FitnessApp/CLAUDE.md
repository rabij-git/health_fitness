@AGENTS.md

# Session Notes & Decisions

## Dev Environment Setup
- **Framework:** React Native / Expo SDK 56
- **Node version:** v20.20.2 via nvm (minimum >=20.19.4 required for Expo 56)
- **Android SDK:** Installed at `/opt/homebrew/share/android-commandlinetools/`
- **Emulator:** Pixel 6, API 34 (Android 14)
- **adb path:** `/opt/homebrew/share/android-commandlinetools/platform-tools/adb`

### Android Emulator

**Step 1 — Start the emulator** (AVD name: `Pixel_6_API_34`):
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

### Database Tables

| Table | Purpose |
|---|---|
| `public.users` | All users (admin, coach, trainee). Has `coach_id`, `gym_id`, `xp`, `streak`, `level`, `status` |
| `public.programs` | Coach-created training programs |
| `public.workouts` | Workouts assigned to a specific trainee |
| `public.exercises` | Exercises belonging to a workout |
| `public.workout_sessions` | Completed workout logs (completion_pct, xp_awarded) |
| `public.weight_logs` | Daily body weight entries per trainee |
| `public.exercise_weight_logs` | Per-exercise weight/reps logs |
| `public.messages` | Coach ↔ trainee direct messages |
| `public.gyms` | Coach-created gyms (one gym per coach) |
| `public.friendships` | Trainee friend connections (pending/accepted) |

All tables have RLS enabled with allow-all policies.

---

## UI / UX Decisions Made

### Login Screen
- Role selection highlight color: **green** (`colors.xpBar` = `#00D4AA`), NOT red (`colors.primary`)
- Selected state uses: `borderColor: colors.xpBar`, `backgroundColor: '#0a1f1a'`, icon/label also in `colors.xpBar`

### Add (+) Button (AdminUsers & CoachPrograms)
- Color: **orange** (`#FF8C00`), NOT `colors.primary` (red)
- Has `marginRight: 12` to shift it away from the right screen edge so it's tappable on Android

### Workout Screen (Trainer)
- **Per-set table layout** with columns: `SET | REPS | WEIGHT | EFFORT`
- Each exercise shows one row per set (not a single combined row)
- **No "COACH PRESCRIPTION" label** — prescribed values are shown inline only
- Coach reps shown as **single numbers** (e.g. `8`, not `8-10`)
- **Reps input rules:**
  - Number-pad keyboard only (no letters)
  - Clamped between `0` and `coachReps + 8`
  - Strip non-numeric characters on input
- **Weight field:** Display only — no keyboard, no editing. Renders as a styled `View`+`Text` (not `TextInput`)
- **Effort rating:** Per-set buttons 0–4 (RIR — Reps In Reserve):
  - `0` = 4+ reps in reserve (green `#4CAF50`)
  - `1` = 2–3 reps in reserve (`#8BC34A`)
  - `2` = 1–2 reps in reserve (orange `#FF9800`)
  - `3` = 0–1 reps in reserve (`#FF5722`)
  - `4` = Couldn't finish (red `#E94560`)

### Workout Completion Flow
- **Progress %** is calculated from sets with an effort rating logged (not from exercise checkboxes)
  - `progress = setsWithEffort / totalSets`
- **Exercise checkboxes** are used to mark individual exercises done; `isFullyComplete = completedCount === exercises.length`
- **Submission state** is tracked separately from completion (`submitted`, `awardedXp`)
- **Button behaviour:**
  - Before any submission: shows "Finish Early (X%)" or "Complete Workout!" (if all exercises checked)
  - After partial save: button is hidden — exercises remain editable so the user can continue
  - Once all exercises are checked after a partial save: "Complete Workout!" button reappears
  - After full completion: button is hidden, only Reset is shown
- **Banner behaviour:**
  - Hidden before first submission
  - After partial save: shows "Session Saved" (not "Partial Session Saved") with % logged
  - After full completion: shows "Workout Complete!" with total XP earned
- **XP is additive across submissions:**
  - Partial save awards prorated XP (e.g. 60% done → 150 XP)
  - Finalizing later shows only the *remaining* XP (e.g. 250 − 150 = 100 XP top-up)
- **Medal modal** reflects the snapshot at the moment the button was pressed (`modalXp`, `modalIsComplete` state), not live values

---

## Data Model Notes

### Exercise (mockData.ts)
- `reps` field must be a single number string (e.g. `'8'`), never a range (e.g. `'8-10'`)

### Key state in WorkoutScreen.tsx
```ts
interface SetLog { reps: string; weight: string; effort: number | null; }
interface ExerciseLog {
  id: string; name: string; coachSets: number; coachReps: string;
  coachWeight?: string; completed: boolean; sets: SetLog[];
}

const [submitted, setSubmitted] = useState(false);
const [awardedXp, setAwardedXp] = useState(0);
const [modalXp, setModalXp] = useState(0);
const [modalIsComplete, setModalIsComplete] = useState(false);
```

---

## Trainee Signup & Coach Assignment Flow

### Overview
Trainees sign up independently → appear as `status: 'pending'` with no `coach_id` → coach finds and assigns them a program + workout → `coach_id` is set and `status` becomes `'assigned'`.

### Signup (db.ts)
- New trainees are inserted with: `xp: 0`, `streak: 0`, `level: 1`, `status: 'pending'`, no `coach_id`
- No mock XP or pre-earned medals — everything starts at zero

### Coach Assignment Flow (CoachPrograms.tsx) — 4-step modal
- **Step 1 — Find Trainee:** search pending trainees by name/email
- **Step 2 — Assign Program:** select from coach's programs
- **Step 3 — Build First Workout:** name + exercises (category chips + manual rows)
- **Step 4 — Success:** trainee moves to "ASSIGNED TRAINEES" section
- Calls `createWorkout(...)` + `assignTraineeToCoach(traineeId, coachId)` in DB

### Coach Dashboard (CoachDashboard.tsx)
- Loads real trainees via `getMyTrainees(coachId)` and programs via `getPrograms(coachId)`
- `Trainer` interface maps DB fields to UI fields

---

## Achievements / Gamification Rules

### New User State
- A trainee with `xp === 0` and `streak === 0` sees a blank "No achievements yet" empty state on the Achievements screen — no XP card, no streak card, no medal grid
- `isNewUser = user.xp === 0 && user.streak === 0` (checked in `GamificationScreen.tsx`)

### Medals (mockData.ts)
- All medals default to `earned: false` — none are auto-earned on signup
- Medal titles are derived from level: Level 1–4 = "New Adventurer", 5–9 = "Rising Star", 10–19 = "Consistent Athlete", 20+ = "Elite Athlete"

---

## Messaging

### Trainee → Coach
- Message button in `TrainerDashboard.tsx` header is **only shown when `coachId` is not null**
- Modal header shows real coach name/avatar loaded from DB (`getProfile(coachId)`)
- No hardcoded "Coach Mike" — all from live data

---

## Social & Rankings

### Trainee Social Screen (SocialScreen.tsx)
- All tabs use **real DB data** — no mock leaderboard
- **Global tab:** only shows users with `xp > 0`. Empty state if no one has XP yet. "Your Rank" card only appears if you are on the leaderboard.
- **Friends tab:** empty state + "Find Friends" button → search modal (search by name/email, send friend request, shows pending/accepted status). Pending friend requests shown at top with Accept button.
- **My Gym tab:** empty state "your coach will add you to a gym" if `gym_id` is null. Shows gym leaderboard if assigned.

### Coach Rankings Screen (CoachRankings.tsx)
- **My Gym section:** coach can create a gym (one per coach), add trainees by name/email search, remove members
- **My Trainees section:** real leaderboard of assigned trainees sorted by XP — empty state if no trainees yet
- `coachId` prop passed from `CoachTabs.tsx`

### DB functions (db.ts)
- `getLeaderboard()` — all trainees with xp > 0, sorted by xp desc
- `getGymLeaderboard(gymId)` — users in a gym with xp > 0
- `getFriends(userId)` — accepted friendships resolved to user objects
- `searchUsers(query, excludeId)` — search trainees by name/email
- `sendFriendRequest(userId, targetId)` — inserts pending friendship
- `acceptFriendRequest(userId, requesterId)` — sets status to accepted
- `getPendingFriendRequests(userId)` — incoming pending requests with sender profile
- `getFriendshipStatus(userId, targetId)` — returns 'none' | 'pending' | 'accepted'
- `createGym(name, coachId)` — creates a gym row
- `getCoachGym(coachId)` — fetches coach's gym
- `addToGym(userId, gymId)` — sets user's gym_id
- `removeFromGym(userId)` — nulls user's gym_id

---

## Performance & Efficiency Patterns

### General Rules Applied
- Use `Promise.all([...])` for independent DB calls that can run in parallel — never sequential `.then()` chains for unrelated queries
- Wrap expensive computed values in `useMemo` — only recalculate when specific dependencies change
- Wrap event handlers and callbacks in `useCallback` when passed as props to child components
- Wrap list-item components in `React.memo` when rendered in large maps (leaderboards, medal grids)
- Update local state directly after mutations instead of refetching from DB when possible

### Fixes Applied Per File

**`db.ts`**
- `getExerciseWeightLogs` has a default `limit: 100` — prevents unbounded fetches
- `getAllUserFriendships(userId)` — single query for all friendship records; used to avoid N per-user `getFriendshipStatus` calls during search

**`TrainerDashboard.tsx`**
- First `useEffect`: 4 DB calls batched into one `Promise.all` (profile, weights, workout, history)
- Second `useEffect`: 2 DB calls batched into one `Promise.all` (messages, coach profile); `userId` added to deps
- `weeklyPerf`, `weeklyDone`, `weeklyXp`, `weeklyAvgCompletion` all wrapped in a single `useMemo([sessionHistory])`
- `handleSaveWeight`, `handleSend`, `handleQuickLog` wrapped in `useCallback`

**`SocialScreen.tsx`**
- `RankRow` wrapped in `React.memo`
- `allFriendships` cached in state on load via `getAllUserFriendships` — search annotates results locally with no extra DB calls
- `loadAll`, `handleSearch`, `handleAddFriend`, `handleAccept` all wrapped in `useCallback`
- `myRank` derived with `useMemo([leaderboard, userId])`

**`WorkoutScreen.tsx`**
- `toggleExercise` and `updateSet` declared once and wrapped in `useCallback` (use functional setState, no deps needed)
- `completedCount`, `totalSets`, `loggedSets`, `progress`, `isFullyComplete` combined into a single `useMemo([exercises])`

**`GamificationScreen.tsx`**
- `MedalCard` wrapped in `React.memo`

**`CoachPrograms.tsx`**
- `addSuggestedExercise` and `addEditSuggestedExercise` wrapped in `useCallback`
- `activeCategoryItems` and `editActiveCategoryItems` wrapped in `useMemo([activeCategory])` — replaces `.find()` on every render
- After trainee assignment: local state updated directly (`setAssignedTrainees`, `setPendingTrainees`) instead of calling `await loadTrainees()` — saves 2 DB queries per assignment

**`CoachRankings.tsx`**
- `sorted` array wrapped in `useMemo([trainees])`

**`ExerciseLogScreen.tsx`**
- `handleAddEntry`: reduced from 2 fetches to 1 — single `getExerciseWeightLogs` call after save, then derives both `logs` and `selected` from the result

---

## Pending / Future Work
- Weight editing: display-only per trainer request. May need coach-initiated flow to update prescribed weights.
- iOS Simulator: not validated end-to-end. Android emulator is the tested path.
- Leaderboard: currently uses `mockData` for Social screen weekly challenge card — needs real data.
- Achievements: medal earning logic not yet wired to workout completion events — medals are all static for now.
