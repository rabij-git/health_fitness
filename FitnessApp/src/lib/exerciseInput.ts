// Shared input sanitizers for exercise fields (weight/sets/reps), used anywhere
// a coach enters or edits exercise data: program templates, workout assignment,
// and the exercise library manager.

export function sanitizeCount(value: string, min: number, max: number): string {
  const digits = value.replace(/[^0-9]/g, '');
  if (digits === '') return '';
  const num = parseInt(digits, 10);
  return String(Math.min(Math.max(num, min), max));
}

export function sanitizeWeightInput(value: string): string {
  let cleaned = value.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
  }
  if (cleaned === '0') return '';
  const num = parseFloat(cleaned);
  if (!isNaN(num) && num > 250) return '250';
  return cleaned;
}

// A duration like "30s" or "5m" — digits only, with an optional trailing
// s/m unit and nothing else. Caps the number below 500.
export function sanitizeTimeInput(value: string): string {
  const cleaned = value.replace(/[^0-9smSM]/g, '');
  const unitMatch = cleaned.match(/[smSM]$/);
  const unit = unitMatch ? unitMatch[0].toLowerCase() : '';
  const digits = cleaned.replace(/[smSM]/g, '');
  if (digits === '') return unit;
  const num = Math.min(parseInt(digits, 10), 499);
  return `${num}${unit}`;
}

export function stripKg(value?: string | null): string {
  if (!value) return '';
  return value.replace(/\s*kg\s*$/i, '').trim();
}

export function withKg(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return `${trimmed}kg`;
}
