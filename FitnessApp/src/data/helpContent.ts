import { DocSection } from '../components/DocumentModal';

// Real, role-specific help content, describing only features that actually
// exist in the app today — same "don't fabricate" rule as everywhere else
// in this codebase. Rendered via DocumentModal, same as the Privacy Policy.

export const HELP_SECTIONS_TRAINEE: DocSection[] = [
  {
    heading: 'Connecting With a Coach',
    body:
      'If you signed up with an invite code from a coach, you\'re already connected — no extra steps. Otherwise, open Profile and use "Find a Coach" to search and send a request, or wait for a coach to send you one; either way, it shows up as an accept/decline card on your Profile until you respond. Sent a request to the wrong coach? You can cancel it from the same screen while it\'s still pending.',
  },
  {
    heading: 'Doing a Workout',
    body:
      'The Workout tab lists whatever your coach has assigned — "To Do" for today, plus anything completed today, scheduled for another day, or no longer active. Exercises and their sets unlock in order, so log the current set\'s effort before moving to the next. A workout with a rest period between sets shows a countdown banner and gently buzzes for the final few seconds — handy if your phone is on silent. Once you finish, that workout locks for the rest of the day and reopens tomorrow.',
  },
  {
    heading: 'Nutrition & Food Log',
    body:
      'The Nutrition tab shows your active plan(s) with today\'s progress against your coach-set calorie and macro targets. If your plan has a meal-by-meal breakdown, mark each meal As Planned, Substituted, or Skipped as you go — that\'s what your coach sees on their end too. Past plans and your full meal history live under the History segment.',
  },
  {
    heading: 'Messaging Your Coach',
    body:
      'Tap the message icon on your Home tab to open a direct chat with your coach at any time.',
  },
  {
    heading: 'Medals, XP & Streaks',
    body:
      'Completing workouts, tracking nutrition, and hitting milestones earns XP and medals, shown on the Medals tab. Your streak counts consecutive active days (a workout or any nutrition tracking counts) — it only shows once you\'ve been active two days in a row.',
  },
  {
    heading: 'Your Account',
    body:
      'Manage your biometric details (used for your coach\'s calorie calculations), review your weight history, and change your settings from the Profile tab. You can permanently delete your account and all of your data at any time from Profile → Settings → Delete Account.',
  },
  {
    heading: 'Still Need Help?',
    body: 'Message your coach directly for anything related to your training, or reach us at Roniboterashvili1@gmail.com for account or technical issues.',
  },
];

export const HELP_SECTIONS_COACH: DocSection[] = [
  {
    heading: 'Finding & Connecting Trainees',
    body:
      'Use "Find Trainees" on the Trainees tab to search and send a connection request, or generate an invite code with "Invite a Trainee" and share it — anyone who signs up with that code is connected to you automatically, skipping the request step entirely. Incoming requests from trainees show up in the Requests section for you to accept or decline.',
  },
  {
    heading: 'Programs & Assigning Workouts',
    body:
      'Build reusable workout templates on the Programs tab — exercises, sets, reps, weight, rest periods, all editable later. Assigning a program to a trainee (from their detail page\'s Program tab) copies its current exercises into a workout just for them, so future template edits don\'t retroactively change what they\'ve already been assigned. You can edit any assigned workout at any time, whether or not the trainee has already completed it.',
  },
  {
    heading: 'Nutrition Plans',
    body:
      'Set up reusable nutrition plan templates on the Nutrition tab, or use "Build Calorie Plan" on a trainee\'s Nutrition tab for a full calculator-driven plan with a meal-by-meal breakdown based on their biometrics. Editing an assigned plan\'s calories automatically rescales its macros (and its meals, if it has any) to keep the same proportions — you don\'t need to recalculate every field by hand.',
  },
  {
    heading: 'Messaging & Notifications',
    body:
      'The notification bell on your Dashboard lists incoming messages and requests. Reply from there, or message any trainee proactively from the Chat tab on their detail page.',
  },
  {
    heading: 'Your Gym & Rankings',
    body:
      'Create a gym and add trainees to it from the Rankings tab to give them their own leaderboard, separate from the global one.',
  },
  {
    heading: 'Your Account',
    body:
      'Manage your profile from Settings. You can permanently delete your account and its data at any time from Settings → Delete Account — your trainees are disconnected, not deleted, so their own accounts and history are unaffected.',
  },
  {
    heading: 'Still Need Help?',
    body: 'Reach us at Roniboterashvili1@gmail.com for anything account or technical related.',
  },
];
