/** Backend enum values → the words shown on screen. */

import {
  Croissant,
  CookingPot,
  Moon,
  Sandwich,
} from 'lucide-react';

export const MEAL_TYPES = {
  breakfast: { label: 'Breakfast', short: 'Brekkie', icon: Croissant, order: 0 },
  lunch: { label: 'Lunch', short: 'Lunch', icon: Sandwich, order: 1 },
  dinner: { label: 'Dinner', short: 'Dinner', icon: CookingPot, order: 2 },
  supper: { label: 'Supper', short: 'Supper', icon: Moon, order: 3 },
};

/** In meal order, not alphabetical — supper does not come before breakfast. */
export const MEAL_ORDER = Object.entries(MEAL_TYPES)
  .sort(([, a], [, b]) => a.order - b.order)
  .map(([value]) => value);

export const mealLabel = (value) => MEAL_TYPES[value]?.label ?? value;
export const mealIcon = (value) => MEAL_TYPES[value]?.icon ?? CookingPot;

/** Meal values sorted into meal order, for rendering a dish's tags. */
export const sortMeals = (values = []) =>
  [...values].sort((a, b) => (MEAL_TYPES[a]?.order ?? 9) - (MEAL_TYPES[b]?.order ?? 9));

export const DIFFICULTY = {
  easy: { label: 'Easy', blurb: 'One pan and no thinking', tone: 'good' },
  medium: { label: 'Medium', blurb: 'Wants a bit of attention', tone: 'warn' },
  hard: { label: 'Hard', blurb: 'Clear the evening', tone: 'bad' },
};

export const difficultyLabel = (value) => DIFFICULTY[value]?.label ?? value;

/**
 * Ingredient categories, in the order the shelf groups them: the things you
 * reach for while cooking first, the cupboard last. Each gets an icon so a long
 * shelf is scannable at a glance rather than a wall of words.
 */
export const CATEGORIES = {
  produce: { label: 'Produce', emoji: '🥕' },
  protein: { label: 'Protein', emoji: '🍗' },
  dairy: { label: 'Dairy', emoji: '🧀' },
  grain: { label: 'Grains', emoji: '🌾' },
  legume: { label: 'Legumes', emoji: '🫘' },
  spice: { label: 'Spices', emoji: '🧂' },
  herb: { label: 'Herbs', emoji: '🌿' },
  sauce: { label: 'Sauces', emoji: '🍶' },
  pantry: { label: 'Pantry', emoji: '🫗' },
  sweet: { label: 'Sweet', emoji: '🍯' },
  drink: { label: 'Drinks', emoji: '🍵' },
  other: { label: 'Other', emoji: '📦' },
};

export const CATEGORY_ORDER = Object.keys(CATEGORIES);
export const categoryLabel = (value) => CATEGORIES[value]?.label ?? value;
export const categoryEmoji = (value) => CATEGORIES[value]?.emoji ?? '📦';

/** The units the amount picker offers first. Anything can still be typed. */
export const UNITS = [
  'g',
  'kg',
  'ml',
  'l',
  'tsp',
  'tbsp',
  'cup',
  'piece',
  'clove',
  'slice',
  'pinch',
  'handful',
  'to taste',
];

export const SORTS = [
  { value: 'name', label: 'A–Z' },
  { value: 'recent', label: 'Newest' },
  { value: 'cooked', label: 'Most cooked' },
  { value: 'stale', label: 'Overdue' },
];

/** Copy for the moment the wheel comes up empty. */
export const NO_MATCH_LINES = [
  'Nothing in the book matches that. Loosen a filter?',
  'That combination has no answer. Yet.',
  'Empty pool. Either add a dish or want less.',
];

/** Shown on the wheel before the first spin. */
export const IDLE_LINES = [
  'Press it. Stop thinking.',
  'One spin and dinner is decided.',
  'The wheel does not care what you feel like.',
];

/** Shown while it spins. */
export const SPINNING_LINES = ['Deciding…', 'Consulting the shelf…', 'Weighing it up…'];

/** Shown on an empty dishes tab. */
export const EMPTY_BOOK_LINES = [
  'No dishes yet. The wheel needs something to spin over.',
  'An empty book. Add the thing you cook most.',
];

export function pickLine(lines, seed = 0) {
  return lines[Math.abs(Math.floor(seed)) % lines.length];
}
