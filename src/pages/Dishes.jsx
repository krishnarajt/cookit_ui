import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { FileText, FileUp, Heart, Plus, Search, Utensils } from 'lucide-react';
import api from '../api/client';
import { useToast } from '../context/ToastContext';
import useQuery from '../hooks/useQuery';
import Button from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { Sheet } from '../components/ui/Sheet';
import { Select, TextArea, TextField } from '../components/ui/Field';
import { EmptyState, ErrorState, SkeletonCard } from '../components/ui/Feedback';
import { Page, Stagger, StaggerItem } from '../components/ui/Motion';
import FilterBar from '../components/ui/FilterBar';
import DishCard from '../components/dish/DishCard';
import { EMPTY_BOOK_LINES, MEAL_ORDER, MEAL_TYPES, SORTS, mealLabel, pickLine } from '../lib/labels';

/**
 * The book.
 *
 * Same FilterBar as the dashboard, same backend query — the list and the wheel
 * must never disagree about what matches, and the surest way to guarantee that
 * is for both to send the same request.
 *
 * `?new=1` opens the create sheet, so "New dish" works as a link from anywhere
 * (the rail, the dashboard, an empty state) without lifting the sheet's state
 * into a context.
 */
export default function Dishes() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [filters, setFilters] = useState({ meal_types: [], ingredient_uuids: [], match: 'any' });
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sort, setSort] = useState(params.get('sort') || 'name');
  const creating = params.get('new') === '1';
  const importing = params.get('import') === '1';

  // A keystroke per request would hammer the backend and flicker the list.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 260);
    return () => clearTimeout(timer);
  }, [search]);

  const shelf = useQuery(useCallback(() => api.ingredients(), []));

  const query = useMemo(
    () => ({
      q: debounced || undefined,
      meal_type: filters.meal_types,
      ingredient: filters.ingredient_uuids,
      // Sent from the first ingredient on: with the "what I can cook" match,
      // one tick already asks a different question than ANY does.
      match: filters.ingredient_uuids.length > 0 ? filters.match : undefined,
      favorites_only: favoritesOnly || undefined,
      sort,
    }),
    [debounced, filters, favoritesOnly, sort]
  );

  const dishes = useQuery(
    useCallback(() => api.dishes(query), [query]),
    [JSON.stringify(query)]
  );

  const topIngredients = useMemo(
    () => (shelf.data || []).filter((item) => item.used_in > 0).slice(0, 10),
    [shelf.data]
  );

  const closeCreate = () => {
    const next = new URLSearchParams(params);
    next.delete('new');
    setParams(next, { replace: true });
  };

  const closeImport = () => {
    const next = new URLSearchParams(params);
    next.delete('import');
    setParams(next, { replace: true });
  };

  const list = dishes.data || [];

  return (
    <Page className="space-y-5 py-2">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-ink-3">
            {list.length} {list.length === 1 ? 'dish' : 'dishes'}
          </p>
          <h1 className="text-2xl leading-tight sm:text-3xl">Your dishes</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            icon={FileUp}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.delete('new');
              next.set('import', '1');
              setParams(next);
            }}
          >
            Import Markdown
          </Button>
          <Button
            icon={Plus}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.delete('import');
              next.set('new', '1');
              setParams(next);
            }}
          >
            New dish
          </Button>
        </div>
      </header>

      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3"
          aria-hidden
        />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search dishes…"
          aria-label="Search dishes"
          className="w-full rounded-2xl border border-line bg-surface-2/60 py-3 pl-10 pr-4 text-ink placeholder:text-ink-3 focus:border-saffron/60 focus:outline-none focus:ring-4 focus:ring-[color-mix(in_oklab,var(--accent)_16%,transparent)]"
        />
      </div>

      <FilterBar
        value={filters}
        onChange={setFilters}
        ingredients={shelf.data || []}
        topIngredients={topIngredients}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Chip selected={favoritesOnly} onClick={() => setFavoritesOnly((v) => !v)} icon={Heart}>
          Favourites
        </Chip>
        <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden />
        {SORTS.map((option) => (
          <Chip
            key={option.value}
            selected={sort === option.value}
            onClick={() => setSort(option.value)}
          >
            {option.label}
          </Chip>
        ))}
      </div>

      {dishes.error && !dishes.data ? (
        <ErrorState error={dishes.error} onRetry={dishes.reload} />
      ) : dishes.loading && !dishes.data ? (
        <div className="grid gap-2.5 sm:grid-cols-2">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={Utensils}
          title={
            debounced || filters.meal_types.length || filters.ingredient_uuids.length
              ? 'Nothing matches that'
              : 'No dishes yet'
          }
          body={
            debounced || filters.meal_types.length || filters.ingredient_uuids.length
              ? 'Try loosening a filter, or clear the search.'
              : pickLine(EMPTY_BOOK_LINES, 0)
          }
          action={
            <Button
              icon={Plus}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('new', '1');
                setParams(next);
              }}
            >
              Add a dish
            </Button>
          }
        />
      ) : (
        <Stagger className="grid gap-2.5 sm:grid-cols-2">
          {list.map((dish) => (
            <StaggerItem key={dish.dish_uuid}>
              <DishCard dish={dish} />
            </StaggerItem>
          ))}
        </Stagger>
      )}

      <NewDishSheet
        open={creating}
        onClose={closeCreate}
        onCreated={(dish) => {
          closeCreate();
          toast(`${dish.name} added. Now write the recipe.`, 'win');
          // Straight into the dish, because a dish with no recipe is a
          // half-finished job and this is where you finish it.
          navigate(`/dishes/${dish.dish_uuid}?edit=1`);
        }}
      />
      <ImportMarkdownSheet
        open={importing}
        onClose={closeImport}
        onImported={(dish) => {
          closeImport();
          toast(
            `${dish.name} imported with ${dish.ingredient_count} ingredients and ${dish.step_count} steps.`,
            'win'
          );
          navigate(`/dishes/${dish.dish_uuid}`);
        }}
      />
    </Page>
  );
}

const MAX_MARKDOWN_BYTES = 1024 * 1024;

function ImportMarkdownSheet({ open, onClose, onImported }) {
  const { toast } = useToast();
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setDragging(false);
    setBusy(false);
  }, [open]);

  const choose = (nextFile) => {
    if (!nextFile) return;
    if (nextFile.size > MAX_MARKDOWN_BYTES) {
      toast('That Markdown file is larger than 1 MB.', 'error');
      return;
    }
    setFile(nextFile);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    try {
      onImported(await api.importMarkdown(file));
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={busy ? undefined : onClose}
      title="Import a recipe"
      subtitle="Cookit exports and ordinary Markdown both work."
      footer={
        <Button full size="lg" loading={busy} onClick={submit} disabled={!file} icon={FileUp}>
          Import recipe
        </Button>
      }
    >
      <form onSubmit={submit} className="space-y-4 pb-3">
        <label
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            event.preventDefault();
            setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            choose(event.dataTransfer.files?.[0]);
          }}
          className={`flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-5 py-7 text-center transition-colors ${
            dragging
              ? 'border-saffron bg-saffron/10'
              : 'border-line-strong bg-surface/50 hover:border-saffron-mark'
          }`}
        >
          <input
            type="file"
            accept=".md,.markdown,text/markdown,text/plain"
            className="sr-only"
            onChange={(event) => choose(event.target.files?.[0])}
          />
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-2 text-saffron-text">
            {file ? <FileText size={23} aria-hidden /> : <FileUp size={23} aria-hidden />}
          </span>
          <strong className="mt-3 text-sm text-ink">
            {file ? file.name : 'Choose a Markdown file'}
          </strong>
          <span className="mt-1 text-xs text-ink-3">
            {file ? `${Math.max(1, Math.ceil(file.size / 1024))} KB` : 'or drop it here · up to 1 MB'}
          </span>
        </label>

        <div className="rounded-2xl border border-line bg-surface-2/50 p-4 text-sm leading-relaxed text-ink-2">
          <p>
            Put ingredients in a list under <strong className="text-ink">Ingredients</strong> and
            the recipe under <strong className="text-ink">Method</strong>,{' '}
            <strong className="text-ink">Steps</strong>, <strong className="text-ink">Recipe</strong>,{' '}
            <strong className="text-ink">Instructions</strong>, or{' '}
            <strong className="text-ink">Directions</strong>.
          </p>
          <p className="mt-2 text-ink-3">
            No headings? That’s fine — every bullet, number, or to-do item becomes a step.
          </p>
        </div>
      </form>
    </Sheet>
  );
}

/**
 * Creating a dish asks for a name and nothing else that matters.
 *
 * Everything below the name is optional and collapsed by default. The fastest
 * path — type "Poha", press Add — has to stay one field long, or the book never
 * gets filled in.
 */
function NewDishSheet({ open, onClose, onCreated }) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [prep, setPrep] = useState('');
  const [cook, setCook] = useState('');
  const [servings, setServings] = useState('');
  const [difficulty, setDifficulty] = useState('easy');
  const [meals, setMeals] = useState([]);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName('');
    setDescription('');
    setCuisine('');
    setPrep('');
    setCook('');
    setServings('');
    setDifficulty('easy');
    setMeals([]);
    setMore(false);
  }, [open]);

  const submit = async (event) => {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    try {
      const dish = await api.createDish({
        name: name.trim(),
        description: description.trim() || null,
        cuisine: cuisine.trim() || null,
        prep_minutes: prep === '' ? null : Number(prep),
        cook_minutes: cook === '' ? null : Number(cook),
        servings: servings === '' ? null : Number(servings),
        difficulty,
        meal_types: meals,
      });
      onCreated(dish);
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New dish"
      subtitle="A name is enough to start."
      footer={
        <Button full size="lg" loading={busy} onClick={submit} disabled={!name.trim()}>
          Add it
        </Button>
      }
    >
      <form onSubmit={submit} className="space-y-4 pb-2">
        <TextField
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Paneer butter masala"
          autoFocus
          required
        />

        <div>
          <p className="mb-1.5 text-[0.7rem] font-bold uppercase tracking-[0.16em] text-ink-3">
            Good for
          </p>
          <div className="flex flex-wrap gap-2">
            {MEAL_ORDER.map((meal) => (
              <Chip
                key={meal}
                selected={meals.includes(meal)}
                icon={MEAL_TYPES[meal].icon}
                onClick={() =>
                  setMeals((current) =>
                    current.includes(meal)
                      ? current.filter((entry) => entry !== meal)
                      : [...current, meal]
                  )
                }
              >
                {mealLabel(meal)}
              </Chip>
            ))}
          </div>
        </div>

        {!more ? (
          <button
            type="button"
            onClick={() => setMore(true)}
            className="text-sm font-semibold text-saffron-text underline-offset-4 hover:underline"
          >
            Add times, servings, a description…
          </button>
        ) : (
          <div className="space-y-4">
            <TextArea
              label="Description"
              hint="optional"
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Restaurant-style, but weeknight-fast."
            />
            <div className="grid grid-cols-3 gap-2">
              <TextField
                label="Prep"
                suffix="min"
                type="number"
                inputMode="numeric"
                min="0"
                value={prep}
                onChange={(event) => setPrep(event.target.value)}
              />
              <TextField
                label="Cook"
                suffix="min"
                type="number"
                inputMode="numeric"
                min="0"
                value={cook}
                onChange={(event) => setCook(event.target.value)}
              />
              <TextField
                label="Serves"
                type="number"
                inputMode="numeric"
                min="1"
                value={servings}
                onChange={(event) => setServings(event.target.value)}
              />
            </div>
            <TextField
              label="Cuisine"
              hint="optional"
              value={cuisine}
              onChange={(event) => setCuisine(event.target.value)}
              placeholder="North Indian"
            />
            <Select
              label="Difficulty"
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value)}
              options={[
                { value: 'easy', label: 'Easy — one pan, no thinking' },
                { value: 'medium', label: 'Medium — wants attention' },
                { value: 'hard', label: 'Hard — clear the evening' },
              ]}
            />
          </div>
        )}
      </form>
    </Sheet>
  );
}
