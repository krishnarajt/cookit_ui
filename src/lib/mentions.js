/**
 * Ingredient mentions inside a recipe step.
 *
 * A step's text is prose with typed references in it:
 *
 *     Fry the @[cumin seeds](8f1c…) until they pop, then add @[onion](2a4e…).
 *
 * The markup carries the ingredient's UUID as well as its name, so "oil" and
 * "olive oil" stay distinct and renaming an ingredient later leaves every step
 * still correct. It is written by the autocomplete in StepEditor and never by
 * hand.
 *
 * The regex here is the same one the backend parses with
 * (`app/services/mention_service.py`). If one changes, both change — a step
 * saved with markup the server doesn't recognise would silently stop adding
 * ingredients to the dish.
 */

export const MENTION_RE =
  /@\[([^\]\n]{1,200})\]\(([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)/g;

/**
 * The form a mention takes *in the editor*: `@[onion]`, with no uuid.
 *
 * Showing the storage form in a textarea is unreadable — a step turns into more
 * UUID than prose. But a bare `@onion` cannot be stored either, because the
 * extent of a multi-word name ("garam masala") is then unguessable.
 *
 * So the editor works in a bracketed-name form and `toStorage`/`toEditable`
 * translate at the boundary. That is only sound because ingredient names are
 * unique per user (the backend has a unique index on user + normalised name),
 * which makes a name an unambiguous key within one shelf.
 *
 * The negative lookahead is what stops a storage-form mention being matched and
 * converted a second time into `@[onion](uuid)(uuid)`.
 */
export const EDITABLE_MENTION_RE = /@\[([^\]\n]{1,200})\](?!\()/g;

/** A fresh regex each call — a global `lastIndex` is shared state and bites. */
const re = () => new RegExp(MENTION_RE.source, 'g');
const editableRe = () => new RegExp(EDITABLE_MENTION_RE.source, 'g');

/** The step as a human reads it: `@[onion](…)` becomes `onion`. */
export function stripMentions(text) {
  return (text || '').replace(re(), (_match, name) => name);
}

/** Every ingredient mentioned, in reading order, deduped by uuid. */
export function parseMentions(text) {
  const found = new Map();
  for (const match of (text || '').matchAll(re())) {
    if (!found.has(match[2])) found.set(match[2], { name: match[1], uuid: match[2] });
  }
  return [...found.values()];
}

/**
 * Split a step into renderable pieces: `{ type: 'text' | 'mention', … }`.
 *
 * Used to draw mentions as chips while keeping the surrounding prose intact.
 */
export function segments(text) {
  const out = [];
  let cursor = 0;
  for (const match of (text || '').matchAll(re())) {
    if (match.index > cursor) {
      out.push({ type: 'text', value: text.slice(cursor, match.index) });
    }
    out.push({ type: 'mention', value: match[1], uuid: match[2] });
    cursor = match.index + match[0].length;
  }
  if (cursor < (text || '').length) out.push({ type: 'text', value: text.slice(cursor) });
  return out;
}

/**
 * Storage form into editor form: `@[Onion](uuid)` becomes `@[Onion]`.
 *
 * The uuid is resolved against the *current* shelf so a renamed ingredient
 * shows its new name, and saving then writes the new name back. When the uuid
 * is unknown — the shelf has not loaded, or the ingredient was deleted — the
 * name already in the markup stands in, which keeps the step readable.
 */
export function toEditable(text, ingredients = []) {
  const byUuid = new Map(
    ingredients.map((item) => [item.ingredient_uuid.toLowerCase(), item])
  );
  return (text || '').replace(re(), (_match, name, uuid) => {
    const current = byUuid.get(uuid.toLowerCase());
    return `@[${current ? current.name : name}]`;
  });
}

/**
 * Editor form into storage form: `@[Onion]` becomes `@[Onion](uuid)`.
 *
 * A name that matches nothing on the shelf degrades to the plain word rather
 * than being stored as a broken mention — someone typing the brackets by hand
 * should get prose, not an error.
 *
 * Callers must have the shelf loaded before using this. With an empty
 * `ingredients` every mention degrades, which would quietly strip them all;
 * DishDetail therefore does not mount the editor until the shelf is in.
 */
export function toStorage(text, ingredients = []) {
  const byName = new Map(
    ingredients.map((item) => [item.name.trim().toLowerCase(), item])
  );
  return (text || '').replace(editableRe(), (_match, name) => {
    const found = byName.get(name.trim().toLowerCase());
    return found ? `@[${found.name}](${found.ingredient_uuid})` : name;
  });
}

/** The editor-form markup for one mention. */
export const toMention = (ingredient) => `@[${ingredient.name}]`;

/**
 * Is the caret currently inside an unfinished `@query`?
 *
 * Returns `{ query, from }` where `from` is the index of the `@`, or null.
 *
 * The rules exist to keep the popover from firing on things that only look like
 * a mention:
 *   - The `@` must start the text or follow whitespace or an opening bracket,
 *     so an email address never opens the picker.
 *   - The query may hold spaces, because ingredient names do ("garam masala"),
 *     but stops at a newline and gives up past 40 characters — by then it is
 *     prose, not a search.
 *   - A completed mention is skipped, so the caret sitting just after
 *     `@[onion](uuid)` doesn't reopen the picker on "onion](uuid)".
 */
export function activeMention(text, caret) {
  if (!text) return null;
  const before = text.slice(0, caret);

  const at = before.lastIndexOf('@');
  if (at === -1) return null;

  const preceding = at === 0 ? '' : before[at - 1];
  if (preceding && !/[\s([]/.test(preceding)) return null;

  const query = before.slice(at + 1);
  if (query.length > 40) return null;
  if (/[\n\]()]/.test(query)) return null;

  return { query, from: at };
}

/**
 * Replace the active `@query` with a real mention.
 *
 * Returns `{ text, caret }` so the caller can restore the cursor after the
 * inserted chip — React re-renders a controlled textarea from scratch, and
 * without this the caret jumps to the end of the step.
 */
export function insertMention(text, from, caret, ingredient) {
  const markup = toMention(ingredient);
  // A trailing space, so the next word doesn't sit against the closing bracket
  // and reopen the picker.
  const next = `${text.slice(0, from)}${markup} ${text.slice(caret)}`;
  return { text: next, caret: from + markup.length + 1 };
}

/** Rank shelf entries against an `@query`. Prefix matches first. */
export function searchIngredients(ingredients, query, limit = 8) {
  const needle = (query || '').trim().toLowerCase();
  if (!needle) return ingredients.slice(0, limit);

  const scored = [];
  for (const ingredient of ingredients) {
    const name = ingredient.name.toLowerCase();
    const index = name.indexOf(needle);
    if (index === -1) continue;
    // A prefix match is almost always the one meant; among those, the shorter
    // name wins, so "@on" offers "Onion" before "Spring onion".
    scored.push({ ingredient, score: index * 100 + name.length });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((item) => item.ingredient);
}
