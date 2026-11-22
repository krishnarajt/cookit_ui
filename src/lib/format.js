/** Formatting helpers. Everything the backend sends is UTC. */

/**
 * Parse a timestamp from the API.
 *
 * Postgres hands back `2026-08-31T18:12:34+00:00`, SQLite (local dev) hands
 * back `2026-08-31T18:12:34` with no zone at all — and `new Date()` reads that
 * second form as *local* time, which silently shifts every "last cooked" by the
 * viewer's UTC offset. Anything without an explicit offset is treated as the
 * UTC the backend guarantees it is.
 */
export function parseUTC(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  const date = new Date(hasZone ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/* ------------------------------------------------------------------ numbers */

export function formatNumber(value, { decimals } = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const places = decimals ?? (Number.isInteger(value) ? 0 : 1);
  return value.toLocaleString(undefined, {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  });
}

/** 2 → "2", 0.5 → "0.5". A recipe that says "2.0 onions" reads like a spreadsheet. */
export function formatQuantity(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  if (Number.isInteger(value)) return String(value);
  // Common fractions are how the amount was meant, so show them that way.
  const fractions = { 0.25: '¼', 0.5: '½', 0.75: '¾', 0.33: '⅓', 0.67: '⅔' };
  const whole = Math.floor(value);
  const remainder = Number((value - whole).toFixed(2));
  const glyph = fractions[remainder];
  if (glyph) return whole ? `${whole}${glyph}` : glyph;
  return String(Number(value.toFixed(2)));
}

/** "250 g", "2 pieces", "to taste", or "" when there is no amount at all. */
export function formatAmount(quantity, unit) {
  const number = formatQuantity(quantity);
  if (!number && !unit) return '';
  if (!number) return unit;
  if (!unit) return number;
  // Pluralise the units where the singular reads wrong: "2 pieces", not "2 piece".
  const countable = ['piece', 'clove', 'slice', 'pinch', 'handful'];
  const plural = quantity > 1 && countable.includes(unit) ? `${unit}s` : unit;
  return `${number} ${plural}`;
}

/** "40 min", "1 h 15", or null when nothing is recorded. */
export function formatMinutes(minutes) {
  if (!minutes) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest}` : `${hours} h`;
}

/* -------------------------------------------------------------------- dates */

export function formatDate(value, options = { day: 'numeric', month: 'short' }) {
  const date = parseUTC(value);
  return date ? date.toLocaleDateString(undefined, options) : '—';
}

export function relativeTime(value) {
  const date = parseUTC(value);
  if (!date) return '';
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  const table = [
    [60, 'second', 1],
    [3600, 'minute', 60],
    [86400, 'hour', 3600],
    [604800, 'day', 86400],
    [2629800, 'week', 604800],
    [31557600, 'month', 2629800],
    [Infinity, 'year', 31557600],
  ];
  if (Math.abs(seconds) < 45) return 'just now';
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [limit, unit, divisor] of table) {
    if (Math.abs(seconds) < limit) return format.format(-Math.round(seconds / divisor), unit);
  }
  return '';
}

/** Whole days since a timestamp, in the viewer's own timezone. */
export function daysSince(value) {
  const date = parseUTC(value);
  if (!date) return null;
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
}

/**
 * How a dish's history reads on a card. Never cooked is its own answer, not a
 * blank — it is the most interesting thing the app can tell you about a dish.
 */
export function lastCookedLabel(lastCookedAt) {
  if (!lastCookedAt) return 'never cooked';
  const days = daysSince(lastCookedAt);
  if (days === 0) return 'cooked today';
  if (days === 1) return 'cooked yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'last week';
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Which meal it is right now, so the dashboard can pre-select something sane. */
export function currentMealType(date = new Date()) {
  const hour = date.getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'supper';
}

export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  if (hour < 22) return 'Evening';
  return 'Late one';
}
