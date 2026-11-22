import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import { Chip, IngredientChip } from './Chip';
import { MEAL_ORDER, MEAL_TYPES, mealLabel } from '../../lib/labels';

/**
 * The filter bar above the wheel and above the dishes list — the same
 * component in both places, because they filter the same thing and the two
 * disagreeing would be a bug you could see.
 *
 * Meals are always visible: four chips, and the answer to "what meal is it"
 * is the most common narrowing anyone does. Ingredients live behind a
 * disclosure, because a shelf runs to a hundred entries and the useful ones —
 * the ingredients in the most dishes — are surfaced first as a single row.
 */
export function FilterBar({
  value,
  onChange,
  ingredients = [],
  topIngredients = [],
  showMatch = true,
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Memoised, not `value.x || []` inline: that fallback allocates a new array
  // on every render, which would invalidate every memo below it and rebuild the
  // whole ingredient picker on each keystroke in the search box.
  const selectedUuids = useMemo(() => value.ingredient_uuids || [], [value.ingredient_uuids]);
  const selectedMeals = useMemo(() => value.meal_types || [], [value.meal_types]);

  const toggle = (key, item) => {
    const current = value[key] || [];
    onChange({
      ...value,
      [key]: current.includes(item)
        ? current.filter((entry) => entry !== item)
        : [...current, item],
    });
  };

  // Selected ingredients are pinned to the front of the picker, so a choice
  // never scrolls out of sight behind a search that no longer matches it.
  const pickable = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const selected = ingredients.filter((i) => selectedUuids.includes(i.ingredient_uuid));
    const rest = ingredients.filter(
      (i) =>
        !selectedUuids.includes(i.ingredient_uuid) &&
        (!needle || i.name.toLowerCase().includes(needle))
    );
    return [...selected, ...rest];
  }, [ingredients, search, selectedUuids]);

  const shortlist = useMemo(() => {
    const selected = ingredients.filter((i) => selectedUuids.includes(i.ingredient_uuid));
    const suggested = topIngredients.filter((i) => !selectedUuids.includes(i.ingredient_uuid));
    return [...selected, ...suggested].slice(0, 10);
  }, [ingredients, topIngredients, selectedUuids]);

  const activeCount = selectedUuids.length + selectedMeals.length;

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        {MEAL_ORDER.map((meal) => (
          <Chip
            key={meal}
            selected={selectedMeals.includes(meal)}
            onClick={() => toggle('meal_types', meal)}
            icon={MEAL_TYPES[meal].icon}
          >
            {mealLabel(meal)}
          </Chip>
        ))}

        <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden />

        <Chip
          selected={open}
          onClick={() => setOpen((current) => !current)}
          icon={SlidersHorizontal}
          count={selectedUuids.length}
        >
          Ingredients
          <ChevronDown
            size={13}
            className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </Chip>

        {activeCount > 0 && (
          <Chip
            onClick={() => onChange({ ...value, meal_types: [], ingredient_uuids: [] })}
            icon={RotateCcw}
          >
            Clear
          </Chip>
        )}
      </div>

      {/* The shortlist stays out when the picker is shut, so the ingredients
          people actually filter by are one tap away rather than two. */}
      {!open && shortlist.length > 0 && (
        <div className="no-scrollbar mask-fade -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
          {shortlist.map((ingredient) => (
            <IngredientChip
              key={ingredient.ingredient_uuid}
              ingredient={ingredient}
              selected={selectedUuids.includes(ingredient.ingredient_uuid)}
              onClick={() => toggle('ingredient_uuids', ingredient.ingredient_uuid)}
            />
          ))}
        </div>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="rounded-[var(--radius-card)] border border-line bg-surface/60 p-3">
              <div className="relative">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
                  aria-hidden
                />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search your shelf…"
                  aria-label="Search ingredients"
                  className="w-full rounded-xl border border-line bg-surface-2/60 py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-3 focus:border-saffron/60 focus:outline-none"
                />
              </div>

              {/* Offered from the first ingredient, not the second: "I only have
                  bread, what can I make" is a real question with one tick. */}
              {showMatch && selectedUuids.length > 0 && (
                <div className="mt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-ink-3">
                      Show
                    </span>
                    {[
                      { key: 'any', label: 'Dishes using any' },
                      { key: 'all', label: 'What I can cook' },
                    ].map((option) => (
                      <Chip
                        key={option.key}
                        selected={(value.match || 'any') === option.key}
                        onClick={() => onChange({ ...value, match: option.key })}
                      >
                        {option.label}
                      </Chip>
                    ))}
                  </div>
                  {(value.match || 'any') === 'all' && (
                    <p className="mt-1.5 text-[0.7rem] leading-relaxed text-ink-3">
                      Only dishes that need nothing else. Staples and anything
                      marked optional are assumed you have.
                    </p>
                  )}
                </div>
              )}

              <div className="mt-3 flex max-h-64 flex-wrap gap-2 overflow-y-auto">
                {pickable.length === 0 && (
                  <p className="py-3 text-sm text-ink-3">
                    {ingredients.length
                      ? 'Nothing on your shelf matches that.'
                      : 'Your shelf is empty — add some ingredients first.'}
                  </p>
                )}
                {pickable.map((ingredient) => (
                  <IngredientChip
                    key={ingredient.ingredient_uuid}
                    ingredient={ingredient}
                    selected={selectedUuids.includes(ingredient.ingredient_uuid)}
                    onClick={() => toggle('ingredient_uuids', ingredient.ingredient_uuid)}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default FilterBar;
