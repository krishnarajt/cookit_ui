import { useCallback, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Carrot, Check, Search, Sparkles, Trash2, Wand2 } from 'lucide-react';
import api from '../api/client';
import { useToast } from '../context/ToastContext';
import useQuery from '../hooks/useQuery';
import Button from '../components/ui/Button';
import Card, { SectionTitle } from '../components/ui/Card';
import { Chip, AddChip } from '../components/ui/Chip';
import { Sheet } from '../components/ui/Sheet';
import { Select, TextArea, TextField, Toggle } from '../components/ui/Field';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/Feedback';
import { Page } from '../components/ui/Motion';
import { CATEGORIES, CATEGORY_ORDER, categoryEmoji, categoryLabel } from '../lib/labels';
import { categoryTint } from '../lib/palette';

/**
 * The shelf.
 *
 * Adding has to be frictionless or nothing else in the app works, so there are
 * three routes in and none of them is a form:
 *
 *   1. The box at the top. Type a name and press enter, or paste a whole list -
 *      commas, newlines and list bullets all count as separators, and anything
 *      already there comes back as "already on your shelf" rather than an error.
 *   2. Suggestion chips from the backend's catalogue. One tap each, and they
 *      arrive with a category, a unit and an emoji already filled in.
 *   3. Typing `@something` in a recipe step, which is the one that actually
 *      gets used once the app is in daily service.
 *
 * Editing is a sheet rather than inline fields: the interesting edits (category,
 * default unit, staple) are all pickers, and pickers inline in a wrapped grid of
 * chips would be unusable on a phone.
 */
export default function Ingredients() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(new Set());
  const [editing, setEditing] = useState(null);
  const inputRef = useRef(null);

  const shelf = useQuery(useCallback(() => api.ingredients(), []));
  const suggestions = useQuery(useCallback(() => api.ingredientSuggestions(), []));

  // Memoised for the same reason as FilterBar's selections: the `|| []` fallback
  // is a fresh array each render and would rebuild every group on any keystroke.
  const items = useMemo(() => shelf.data || [], [shelf.data]);

  /** Grouped by category, in the order the shelf reads. Empty groups dropped. */
  const groups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matching = needle
      ? items.filter((item) => item.name.toLowerCase().includes(needle))
      : items;

    return CATEGORY_ORDER.map((category) => ({
      category,
      items: matching.filter((item) => item.category === category),
    })).filter((group) => group.items.length > 0);
  }, [items, search]);

  const staples = useMemo(() => items.filter((item) => item.is_staple).length, [items]);

  const addFromBox = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const result = await api.addIngredients(text);
      setDraft('');
      shelf.reload();
      suggestions.reload();

      if (result.created.length && result.already_there.length) {
        toast(
          `${result.created.length} added, ${result.already_there.length} already there.`,
          'success'
        );
      } else if (result.created.length) {
        toast(
          result.created.length === 1
            ? `${result.created[0].name} added.`
            : `${result.created.length} ingredients added.`,
          'success'
        );
      } else {
        toast('All of those were already on your shelf.', 'info');
      }
      inputRef.current?.focus();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const addSuggestion = async (suggestion) => {
    // Track per-chip rather than a single flag, so tapping four in a row does
    // not grey out the whole row each time.
    setAdding((current) => new Set(current).add(suggestion.name));
    try {
      await api.addIngredient({
        name: suggestion.name,
        category: suggestion.category,
        default_unit: suggestion.default_unit,
        emoji: suggestion.emoji,
        is_staple: suggestion.is_staple,
      });
      shelf.reload();
      suggestions.reload();
    } catch (error) {
      // A 409 means someone already added it in another tab. Refresh and move
      // on rather than complaining about the outcome we wanted anyway.
      if (error.status !== 409) toast(error.message, 'error');
      shelf.reload();
      suggestions.reload();
    } finally {
      setAdding((current) => {
        const next = new Set(current);
        next.delete(suggestion.name);
        return next;
      });
    }
  };

  const suggestionRow = (suggestions.data || []).slice(0, 24);

  return (
    <Page className="space-y-5 py-2">
      <header>
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-ink-3">
          {items.length} on the shelf
          {staples > 0 && ` - ${staples} always in`}
        </p>
        <h1 className="text-2xl leading-tight sm:text-3xl">Your shelf</h1>
      </header>

      {/* ------------------------------------------------------------ add box */}

      <Card glow className="p-3.5">
        <label
          htmlFor="add-ingredients"
          className="mb-1.5 block text-[0.7rem] font-bold uppercase tracking-[0.16em] text-ink-3"
        >
          Add ingredients
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <textarea
            id="add-ingredients"
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter submits, shift-enter makes a new line. A single name is
              // the common case and should never need a second gesture; a
              // pasted list already has its own newlines.
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                addFromBox();
              }
            }}
            rows={1}
            placeholder="Onion, tomato, paneer... or paste a whole list"
            className="min-h-[3rem] flex-1 resize-y rounded-xl border border-line bg-surface-2/60 px-3.5 py-3 text-ink placeholder:text-ink-3 focus:border-saffron/60 focus:outline-none focus:ring-4 focus:ring-[color-mix(in_oklab,var(--accent)_16%,transparent)]"
          />
          <Button
            variant="saffron"
            size="lg"
            loading={busy}
            onClick={addFromBox}
            disabled={!draft.trim()}
            className="sm:self-stretch"
          >
            Add
          </Button>
        </div>
        <p className="mt-2 text-xs text-ink-3">
          Commas, newlines and bullets all separate. Duplicates are ignored, not rejected.
        </p>
      </Card>

      {/* --------------------------------------------------------- suggestions */}

      {suggestionRow.length > 0 && (
        <section>
          <SectionTitle icon={Sparkles}>Common things, one tap each</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {suggestionRow.map((suggestion) => (
              <AddChip
                key={suggestion.name}
                emoji={suggestion.emoji}
                busy={adding.has(suggestion.name)}
                onClick={() => addSuggestion(suggestion)}
              >
                {suggestion.name}
              </AddChip>
            ))}
          </div>
        </section>
      )}

      {/* --------------------------------------------------------------- shelf */}

      {items.length > 6 && (
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3"
            aria-hidden
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search the shelf..."
            aria-label="Search the shelf"
            className="w-full rounded-2xl border border-line bg-surface-2/60 py-3 pl-10 pr-4 text-ink placeholder:text-ink-3 focus:border-saffron/60 focus:outline-none"
          />
        </div>
      )}

      {shelf.error && !shelf.data ? (
        <ErrorState error={shelf.error} onRetry={shelf.reload} />
      ) : shelf.loading && !shelf.data ? (
        <div className="space-y-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-24" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-24" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Carrot}
          title="Nothing on the shelf yet"
          body="Tap a few suggestions above, or paste your own list into the box. The shelf is what the wheel filters by."
        />
      ) : groups.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-3">Nothing matches that.</p>
      ) : (
        <div className="space-y-5">
          <AnimatePresence initial={false}>
            {groups.map((group) => (
              <motion.section
                key={group.category}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', stiffness: 460, damping: 40 }}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span aria-hidden>{CATEGORIES[group.category]?.emoji}</span>
                  <h2 className="text-[0.7rem] font-bold uppercase tracking-[0.18em] text-ink-3">
                    {categoryLabel(group.category)}
                  </h2>
                  <span className="tabular text-[0.7rem] font-bold text-ink-3/70">
                    {group.items.length}
                  </span>
                  <span className="h-px flex-1 bg-line" aria-hidden />
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.items.map((item) => (
                    <Chip
                      key={item.ingredient_uuid}
                      onClick={() => setEditing(item)}
                      tint={categoryTint(item.category)}
                      count={item.used_in}
                    >
                      <span className="mr-0.5" aria-hidden>
                        {item.emoji || categoryEmoji(item.category)}
                      </span>
                      {item.name}
                      {item.is_staple && (
                        <Check size={11} className="opacity-50" aria-label="always in" />
                      )}
                    </Chip>
                  ))}
                </div>
              </motion.section>
            ))}
          </AnimatePresence>
        </div>
      )}

      <EditSheet
        ingredient={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          shelf.reload();
        }}
      />
    </Page>
  );
}

function EditSheet({ ingredient, onClose, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  // Reset the form whenever a different chip is opened. Keyed off the uuid so
  // reopening the same one does not clobber an in-progress edit.
  const key = ingredient?.ingredient_uuid;
  const [formKey, setFormKey] = useState(key);
  if (key !== formKey) {
    setFormKey(key);
    setForm(
      ingredient
        ? {
            name: ingredient.name,
            category: ingredient.category,
            default_unit: ingredient.default_unit || '',
            emoji: ingredient.emoji || '',
            notes: ingredient.notes || '',
            is_staple: ingredient.is_staple,
          }
        : null
    );
  }

  const set = (patch) => setForm((current) => ({ ...current, ...patch }));

  const save = async () => {
    setBusy(true);
    try {
      await api.updateIngredient(ingredient.ingredient_uuid, {
        name: form.name.trim(),
        category: form.category,
        default_unit: form.default_unit.trim() || null,
        emoji: form.emoji.trim() || null,
        notes: form.notes.trim() || null,
        is_staple: form.is_staple,
      });
      toast('Saved.', 'success');
      onSaved();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const used = ingredient.used_in;
    const warning = used
      ? `Delete "${ingredient.name}"? It will be removed from ${used} ${
          used === 1 ? 'dish' : 'dishes'
        } too.`
      : `Delete "${ingredient.name}"?`;
    if (!window.confirm(warning)) return;
    setBusy(true);
    try {
      await api.deleteIngredient(ingredient.ingredient_uuid);
      toast(`${ingredient.name} removed.`, 'info');
      onSaved();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={Boolean(ingredient && form)}
      onClose={onClose}
      title={ingredient?.name}
      subtitle={
        ingredient?.used_in
          ? `Used in ${ingredient.used_in} ${ingredient.used_in === 1 ? 'dish' : 'dishes'}`
          : 'Not used in any dish yet'
      }
      footer={
        <div className="flex gap-2">
          <Button variant="danger" icon={Trash2} onClick={remove} disabled={busy}>
            Delete
          </Button>
          <Button full loading={busy} onClick={save} disabled={!form?.name?.trim()}>
            Save
          </Button>
        </div>
      }
    >
      {form && (
        <div className="space-y-4 pb-2">
          <div className="flex gap-2">
            <TextField
              label="Emoji"
              value={form.emoji}
              onChange={(event) => set({ emoji: event.target.value })}
              className="w-20 shrink-0"
              maxLength={4}
            />
            <TextField
              label="Name"
              value={form.name}
              onChange={(event) => set({ name: event.target.value })}
              className="flex-1"
            />
          </div>

          <Select
            label="Category"
            hint="how the shelf groups it"
            value={form.category}
            onChange={(event) => set({ category: event.target.value })}
            options={CATEGORY_ORDER.map((value) => ({
              value,
              label: `${CATEGORIES[value].emoji}  ${categoryLabel(value)}`,
            }))}
          />

          <TextField
            label="Default unit"
            hint="pre-filled when you add it to a dish"
            value={form.default_unit}
            onChange={(event) => set({ default_unit: event.target.value })}
            placeholder="g, clove, tbsp..."
          />

          <div className="rounded-2xl border border-line bg-surface-2/40 p-3">
            <Toggle
              label="Always in the house"
              description="Staples never rule a dish out of the wheel, even when you have not ticked them in a filter. Salt should not exclude everything."
              checked={form.is_staple}
              onChange={(value) => set({ is_staple: value })}
            />
          </div>

          <TextArea
            label="Notes"
            hint="optional"
            rows={2}
            value={form.notes}
            onChange={(event) => set({ notes: event.target.value })}
            placeholder="The green one from the corner shop."
          />

          <p className="flex items-start gap-2 text-xs text-ink-3">
            <Wand2 size={13} className="mt-0.5 shrink-0" aria-hidden />
            Renaming is safe. Dishes and recipe steps point at this entry by id, so every mention
            follows the new name.
          </p>
        </div>
      )}
    </Sheet>
  );
}
