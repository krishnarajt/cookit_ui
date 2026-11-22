import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronUp, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import Button from '../ui/Button';
import { Chip } from '../ui/Chip';
import { formatAmount } from '../../lib/format';
import { UNITS, categoryEmoji } from '../../lib/labels';
import { categoryTint } from '../../lib/palette';

/** The dish's ingredient list, read-only. */
export function IngredientList({ ingredients = [] }) {
  if (ingredients.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-3">
        Nothing listed yet. Anything you <span className="font-mono font-bold">@</span>-mention in
        the method shows up here automatically.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-line/70">
      {ingredients.map((item) => {
        const amount = formatAmount(item.quantity, item.unit);
        return (
          <li key={item.ingredient_uuid} className="flex items-baseline gap-3 py-2.5">
            <span
              className="tabular w-24 shrink-0 text-right text-sm font-bold text-ink"
              aria-label={amount ? `Amount: ${amount}` : 'No amount recorded'}
            >
              {amount || '—'}
            </span>
            <span className="min-w-0 flex-1 text-sm text-ink-2">
              <span className="mr-1.5" aria-hidden>
                {item.emoji || categoryEmoji(item.category)}
              </span>
              <span className="font-medium text-ink">{item.name}</span>
              {item.note && <span className="text-ink-3"> — {item.note}</span>}
              {item.is_optional && (
                <span className="ml-1.5 rounded-md bg-surface-3 px-1.5 py-px text-[0.62rem] font-bold uppercase tracking-wider text-ink-3">
                  optional
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The dish's ingredient list, editable.
 *
 * Rows carry an amount, a unit and a note, and all three are optional — half of
 * cooking is "a splash", and a picker that insisted on grams would just get
 * lied to. The unit is a free text input with a datalist rather than a select,
 * for the same reason.
 *
 * Order is meaningful (it is usually the order things get used), so rows move
 * with arrows. Same reasoning as the step editor: a drag handle inside a row of
 * inputs is a fight with text selection on a phone.
 */
export function DishIngredientsEditor({
  rows,
  onChange,
  shelf = [],
  onCreateIngredient,
  className = '',
}) {
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const chosen = useMemo(() => new Set(rows.map((row) => row.ingredient_uuid)), [rows]);

  const available = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return shelf.filter(
      (item) =>
        !chosen.has(item.ingredient_uuid) &&
        (!needle || item.name.toLowerCase().includes(needle))
    );
  }, [shelf, chosen, search]);

  const exactOnShelf = shelf.some(
    (item) => item.name.toLowerCase() === search.trim().toLowerCase()
  );
  const canCreate = Boolean(search.trim()) && !exactOnShelf && Boolean(onCreateIngredient);

  const addRow = (ingredient) =>
    onChange([
      ...rows,
      {
        ingredient_uuid: ingredient.ingredient_uuid,
        name: ingredient.name,
        emoji: ingredient.emoji,
        category: ingredient.category,
        quantity: null,
        // Pre-fill the unit the shelf entry suggests — "clove" for garlic —
        // so the common case needs one number and nothing else.
        unit: ingredient.default_unit || '',
        note: '',
        is_optional: false,
      },
    ]);

  const create = async () => {
    setCreating(true);
    try {
      const ingredient = await onCreateIngredient(search.trim());
      if (ingredient) {
        addRow(ingredient);
        setSearch('');
      }
    } finally {
      setCreating(false);
    }
  };

  const update = (index, patch) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const move = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className={`space-y-2.5 ${className}`}>
      <AnimatePresence initial={false}>
        {rows.map((row, index) => (
          <motion.div
            key={row.ingredient_uuid}
            layout
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ type: 'spring', stiffness: 460, damping: 38 }}
            className="rounded-2xl border border-line bg-surface/70 p-2.5"
            style={{
              borderLeftWidth: 3,
              borderLeftColor: categoryTint(row.category),
            }}
          >
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                <span className="mr-1.5" aria-hidden>
                  {row.emoji || categoryEmoji(row.category)}
                </span>
                {row.name}
              </span>
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${row.name} up`}
                  className="rounded p-1 text-ink-3 hover:text-ink disabled:opacity-25"
                >
                  <ChevronUp size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === rows.length - 1}
                  aria-label={`Move ${row.name} down`}
                  className="rounded p-1 text-ink-3 hover:text-ink disabled:opacity-25"
                >
                  <ChevronDown size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => onChange(rows.filter((_, i) => i !== index))}
                  aria-label={`Remove ${row.name}`}
                  className="rounded p-1 text-ink-3 hover:text-bad"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={row.quantity ?? ''}
                onChange={(event) =>
                  update(index, {
                    quantity: event.target.value === '' ? null : Number(event.target.value),
                  })
                }
                placeholder="Qty"
                aria-label={`Quantity of ${row.name}`}
                className="tabular w-16 rounded-lg border border-line bg-surface-2/60 px-2 py-1.5 text-center text-sm text-ink placeholder:text-ink-3 focus:border-saffron/60 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              <input
                list="cookit-units"
                value={row.unit ?? ''}
                onChange={(event) => update(index, { unit: event.target.value })}
                placeholder="unit"
                aria-label={`Unit for ${row.name}`}
                className="w-20 rounded-lg border border-line bg-surface-2/60 px-2 py-1.5 text-sm text-ink placeholder:text-ink-3 focus:border-saffron/60 focus:outline-none"
              />
              <input
                value={row.note ?? ''}
                onChange={(event) => update(index, { note: event.target.value })}
                placeholder="finely chopped…"
                aria-label={`Note for ${row.name}`}
                className="min-w-0 flex-1 rounded-lg border border-line bg-surface-2/60 px-2 py-1.5 text-sm text-ink placeholder:text-ink-3 focus:border-saffron/60 focus:outline-none"
              />
              <Chip
                selected={row.is_optional}
                onClick={() => update(index, { is_optional: !row.is_optional })}
                className="h-8"
              >
                Optional
              </Chip>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* One datalist for every unit input on the page. */}
      <datalist id="cookit-units">
        {UNITS.map((unit) => (
          <option key={unit} value={unit} />
        ))}
      </datalist>

      {!picking ? (
        <Button variant="outline" icon={Plus} onClick={() => setPicking(true)} full>
          Add an ingredient
        </Button>
      ) : (
        <div className="rounded-2xl border border-line bg-surface/60 p-3">
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
              aria-hidden
            />
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setPicking(false);
                if (event.key === 'Enter') {
                  event.preventDefault();
                  if (available.length) {
                    addRow(available[0]);
                    setSearch('');
                  } else if (canCreate) {
                    create();
                  }
                }
              }}
              placeholder="Search your shelf, or type something new…"
              aria-label="Search ingredients"
              className="w-full rounded-xl border border-line bg-surface-2/60 py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-3 focus:border-saffron/60 focus:outline-none"
            />
          </div>

          <div className="mt-3 flex max-h-56 flex-wrap gap-2 overflow-y-auto">
            {canCreate && (
              <Chip onClick={create} icon={Sparkles} className="border-dashed">
                {creating ? 'Adding…' : `Add “${search.trim()}”`}
              </Chip>
            )}
            {available.map((item) => (
              <Chip
                key={item.ingredient_uuid}
                onClick={() => {
                  addRow(item);
                  setSearch('');
                }}
              >
                <span className="mr-0.5" aria-hidden>
                  {item.emoji || categoryEmoji(item.category)}
                </span>
                {item.name}
              </Chip>
            ))}
            {available.length === 0 && !canCreate && (
              <p className="py-2 text-sm text-ink-3">
                {shelf.length ? 'Everything matching is already on the dish.' : 'Your shelf is empty.'}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => setPicking(false)}
            className="mt-3 w-full rounded-xl border border-line py-2 text-sm font-semibold text-ink-3 hover:text-ink"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

export default DishIngredientsEditor;
