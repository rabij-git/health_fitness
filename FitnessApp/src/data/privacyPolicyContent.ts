import { DocSection } from '../components/DocumentModal';

// The full policy, rendered natively (see DocumentModal.tsx's own header
// comment for why) — keep this in sync with the hosted Artifact version
// used as the public Privacy Policy URL in App Store Connect / the Play
// Console (that hosted copy is what reviewers and the two store consoles
// link to; this in-app copy is what an actual user reads, and is the one
// that has to work with no account and no network dependency).
export const PRIVACY_POLICY_EFFECTIVE_DATE = 'Effective September 29, 2026';

export const PRIVACY_POLICY_SECTIONS: DocSection[] = [
  {
    heading: '1. Who We Are',
    body:
      'Athera ("Athera," "we," "us," or "our") is a training and coaching app that connects coaches with the trainees they work with — workout programming, nutrition planning, progress tracking, and messaging in one place. This policy explains what information the Athera app collects, why, who it\'s shared with, and the choices you have over it. It applies to every account type — trainees, coaches, and administrators.',
  },
  {
    heading: '2. Information We Collect',
    body:
      'Account: your name, email address, password, and role.\n\n' +
      'Biometric profile (optional): birth year, sex, height, and activity level — used only so your coach can calculate accurate calorie and macro targets for you.\n\n' +
      'Body weight, step count, and water intake: weight entries, your daily step total (read directly from your phone\'s own motion sensor), and logged water intake.\n\n' +
      'Nutrition: manual food log entries, assigned nutrition plans, and which planned meals you marked as eaten, substituted, or skipped.\n\n' +
      'Workouts: assigned exercises, and the sets, reps, weight, and effort you log per session.\n\n' +
      'Messages: direct messages between a trainee and their coach.\n\n' +
      'Gamification & social: XP, level, streaks, earned medals, friend connections, gym membership, and leaderboard rank.\n\n' +
      'What we don\'t collect: your camera, photo library, contacts, or precise location. We don\'t connect to Apple Health, Garmin, MyFitnessPal, or any other third-party fitness service — those integrations don\'t exist in the app today. We don\'t use advertising identifiers, and we run no analytics or crash-reporting SDKs. No ads, no trackers, no data sale.',
  },
  {
    heading: '3. How We Use It',
    body:
      'We use your information to operate and secure your account, deliver the coach-trainee relationship (assigning and tracking workouts/nutrition, enabling messages), calculate calorie and macro targets from your biometric profile when your coach builds a plan, and power the gamification and social features. We do not use your information for advertising, and we do not build behavioral profiles of you for any purpose outside the app itself.',
  },
  {
    heading: '4. Who Can See Your Information',
    body:
      'Your coach can see the workouts, nutrition, weight, step, and water data logged under your account, and the messages you exchange with them — this is core to how coaching works here. Other trainees only ever see what you\'d expect from a leaderboard or gym roster: your display name, avatar, and XP/level — never your workouts, nutrition, weight, or messages. Platform administrators can view aggregate, non-identifying usage statistics and manage user accounts (for example, resolving a login issue); they don\'t browse day-to-day training data. We never sell your information, and we never share it with third parties for their own marketing or advertising purposes.',
  },
  {
    heading: '5. Storage & Security',
    body:
      'Your data is stored on Supabase, a hosted PostgreSQL database provider, protected by row-level security policies scoped to your account and role — enforced at the database layer, not just the app\'s interface. All traffic between the app and our servers is encrypted in transit (HTTPS/TLS). No system is perfectly secure, but access controls throughout the app follow the same principle: you and your coach see your data, no one else does.',
  },
  {
    heading: '6. Your Choices & Rights',
    body:
      'Your profile, workout history, nutrition logs, and settings are visible and editable directly in the app at any time. A trainee can request or cancel a coach connection at any time from their Profile tab, without losing their training history. Both trainees and coaches can permanently delete their own account and all associated data directly in the app, under Settings → Delete Account — this takes effect immediately and cannot be undone; a coach\'s trainees are simply disconnected, not deleted, when the coach deletes their own account. If you\'d rather we handle a request for you, contact us using the details in Section 11.',
  },
  {
    heading: '7. Data Retention',
    body:
      'We keep your information for as long as your account is active, so your training history stays available to you and your coach. When you delete your account through the in-app Delete Account flow, your profile and associated training data are permanently removed immediately — there is no recovery period.',
  },
  {
    heading: '8. Children\'s Privacy',
    body:
      'Athera is not directed at, and is not intended for use by, children under the age of 13 (or the equivalent minimum age in your region). We do not knowingly collect information from children under that age. If you believe a child has created an account, contact us and we\'ll remove it.',
  },
  {
    heading: '9. Third-Party Services',
    body:
      'Athera relies on one infrastructure provider: Supabase, Inc., which hosts our database, handles account authentication, and stores uploaded files (such as nutrition plan PDFs) as our data processor — it doesn\'t use your data for its own purposes. We don\'t use any advertising networks, analytics platforms, or other third-party trackers beyond this.',
  },
  {
    heading: '10. Changes to This Policy',
    body:
      'If we make a material change to how we collect or use your information, we\'ll update the effective date at the top of this page and, where appropriate, notify you inside the app. We encourage checking back here periodically.',
  },
  {
    heading: '11. Contact Us',
    body: 'Questions about this policy, or a request regarding your data? Reach us at Roniboterashvili1@gmail.com.',
  },
];
