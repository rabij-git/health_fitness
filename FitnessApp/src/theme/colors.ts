// Brand palette: "Dark Indigo" (#111827) + "Neon Cyan" (#22D3EE) — see the
// brand mood board. `primary` is now the main brand/CTA color (buttons, tab
// active states, badges — the bulk of the app's UI), mapped to Neon Cyan.
// `danger` (the old `primary` red) was split out for the genuinely
// destructive/negative cases that need to stay red regardless of brand color:
// delete/remove icons, error banners, unread-notification dots, "over
// target"/negative-direction indicators (calorie & water DualBar overage,
// weight-trend-up), and the Admin role badge (kept red so it stays visually
// distinct from Coach's cyan). `xpBar` is left as its own token even though
// it's now the same hex as `primary` — most of the app's "positive
// highlight" styling already keyed off `xpBar` specifically before this
// rebrand, so this avoids a second sweeping rename on top of this one.
export const colors = {
  background: '#111827',
  card: '#1F2937',
  primary: '#22D3EE',
  danger: '#E94560',
  secondary: '#16213E',
  accent: '#0F3460',
  text: '#FFFFFF',
  textSecondary: '#9CA3AF',
  gold: '#FFD700',
  xpBar: '#22D3EE',
  streak: '#FF6B35',
  border: '#374151',
  success: '#00C853',
  warning: '#FFB300',
  cardAlt: '#1E1E3A',
};