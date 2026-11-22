/**
 * Colours that have to be real hex values.
 *
 * The wheel is drawn as SVG paths and the chips tint themselves with
 * `color-mix`, and neither can resolve `var(--x)` — SVG `fill` is a
 * presentation attribute, and a CSS variable inside an inline `style` string
 * would need the variable to exist on that element. So these live here rather
 * than in index.css.
 *
 * The wheel's slices are deliberately *not* theme-dependent. It is an object
 * sitting on the page, not a surface, so it keeps one set of deep fills in both
 * themes and always draws its labels in light ink. That is also what makes the
 * contrast provable: every fill below clears 4.5:1 against #fff8f0, so a slice
 * label is legible no matter which slice it lands on.
 */

/**
 * Six slice fills, in a fixed order, spread around the hue circle but all
 * kitchen colours: paprika, mustard, basil, teal, aubergine, beetroot.
 * Contrast with the slice ink (#fff8f0) in comments, measured not guessed.
 */
const SLICES = [
  '#a8380c', // paprika    6.4:1
  '#8a6100', // mustard    5.2:1
  '#3f6b23', // basil      6.2:1
  '#1c6b62', // teal       5.7:1
  '#4e3b96', // aubergine  7.9:1
  '#96225a', // beetroot   7.3:1
];

export const SLICE_INK = '#fff8f0';
export const MAX_SLICES = 12;

/**
 * Slice colours for a wheel of `count` segments.
 *
 * The palette is cycled, which gives no adjacent repeats as long as `count`
 * isn't 1 more than a multiple of six — at 7 slices the last one would wrap
 * around to touch the first and both would be paprika. When that happens the
 * final slice is shifted a step along, which costs a duplicate somewhere
 * harmless in the middle instead of one at the seam where it is obvious.
 */
export function sliceColors(count) {
  const colors = Array.from({ length: count }, (_, index) => SLICES[index % SLICES.length]);
  if (count > 1 && count % SLICES.length === 1) {
    colors[count - 1] = SLICES[1];
  }
  return colors;
}

/**
 * A tint per ingredient category, so a chip carries a hint of what it is.
 *
 * Used at low opacity behind text that stays `--ink`, so these never have to
 * clear a contrast bar themselves — the border and a wash, nothing more. The
 * category name is always written on the chip; colour alone never carries it.
 */
export const CATEGORY_TINTS = {
  produce: '#5b8130',
  protein: '#b3492a',
  dairy: '#c08a2e',
  grain: '#a07a3a',
  legume: '#8a6a3f',
  spice: '#c1440e',
  herb: '#3f7a4a',
  sauce: '#96225a',
  pantry: '#6b6f7a',
  sweet: '#c26b1f',
  drink: '#2f7a72',
  other: '#7a6656',
};

export const categoryTint = (category) => CATEGORY_TINTS[category] ?? CATEGORY_TINTS.other;
