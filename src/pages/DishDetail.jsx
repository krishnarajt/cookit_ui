import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  Camera,
  ChefHat,
  Clock,
  ExternalLink,
  FileDown,
  FileText,
  Flame,
  FolderArchive,
  Heart,
  ImagePlus,
  Link2,
  Pencil,
  Plus,
  Star,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import api, { saveBlob } from '../api/client';
import { useToast } from '../context/ToastContext';
import useQuery from '../hooks/useQuery';
import Button, { IconButton } from '../components/ui/Button';
import Card, { SectionTitle } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { Chip } from '../components/ui/Chip';
import { Sheet } from '../components/ui/Sheet';
import { Select, TextArea, TextField } from '../components/ui/Field';
import { Tabs } from '../components/ui/Tabs';
import { Confetti } from '../components/ui/Confetti';
import { ErrorState, Skeleton } from '../components/ui/Feedback';
import { Page } from '../components/ui/Motion';
import DishPhoto, { forgetPhoto } from '../components/dish/DishPhoto';
import { StepEditor, MentionHint } from '../components/dish/StepEditor';
import { StepList, CookMode } from '../components/dish/StepList';
import { IngredientList, DishIngredientsEditor } from '../components/dish/DishIngredients';
import { formatMinutes, lastCookedLabel, relativeTime } from '../lib/format';
import { toEditable, toStorage } from '../lib/mentions';
import { MEAL_ORDER, MEAL_TYPES, mealLabel, sortMeals } from '../lib/labels';

const HINT_KEY = 'cookit_mention_hint_seen';

/**
 * One dish, everything about it.
 *
 * Two modes rather than always-editable fields: reading a recipe and writing
 * one want different layouts, and inline-editing every field would mean either
 * a save button per row or an autosave that fires mid-word. `?edit=1` puts it
 * in edit mode, so "add a dish then write the recipe" is one navigation.
 */
export default function DishDetail() {
  const { uuid } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();

  const dish = useQuery(useCallback(() => api.dish(uuid), [uuid]), [uuid]);
  const shelf = useQuery(useCallback(() => api.ingredients(), []));

  const [tab, setTab] = useState('recipe');
  const [cooking, setCooking] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [exporting, setExporting] = useState(null);
  const editing = params.get('edit') === '1';

  const data = dish.data;

  const setEditing = (value) => {
    const next = new URLSearchParams(params);
    if (value) next.set('edit', '1');
    else next.delete('edit');
    setParams(next, { replace: true });
  };

  /** Add a shelf entry from inside an editor, and keep the shelf in step. */
  const createIngredient = useCallback(
    async (name) => {
      try {
        const created = await api.addIngredient({ name });
        shelf.reload();
        toast(`${created.name} is on your shelf.`, 'success');
        return created;
      } catch (error) {
        // A 409 means it already exists, which from the editor's point of view
        // is a success: find it and carry on rather than failing the insert.
        if (error.status === 409) {
          const existing = (shelf.data || []).find(
            (item) => item.name.toLowerCase() === name.toLowerCase()
          );
          if (existing) return existing;
        }
        toast(error.message, 'error');
        throw error;
      }
    },
    [shelf, toast]
  );

  const logCook = async (mealType) => {
    try {
      await api.cookDish(uuid, { meal_type: mealType || null, source: 'manual' });
      setCelebrate(true);
      toast('Logged. The wheel will remember.', 'win');
      dish.reload();
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  const EXPORTERS = {
    pdf: api.exportPdf,
    md: api.exportMarkdown,
    zip: api.exportZip,
  };

  const exportAs = async (kind) => {
    setExporting(kind);
    try {
      const { blob, filename } = await EXPORTERS[kind](uuid, data.name);
      saveBlob(blob, filename);
      toast(`Saved ${filename}`, 'success');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setExporting(null);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${data.name}"? Its recipe and photos go too.`)) return;
    try {
      await api.deleteDish(uuid);
      toast(`${data.name} deleted.`, 'info');
      navigate('/dishes', { replace: true });
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  const toggleFavorite = async () => {
    try {
      await api.updateDish(uuid, { is_favorite: !data.is_favorite });
      dish.reload();
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  if (dish.error && !data) {
    return (
      <Page className="py-6">
        <BackLink />
        <ErrorState error={dish.error} onRetry={dish.reload} className="mt-4" />
      </Page>
    );
  }

  if (!data) {
    return (
      <Page className="space-y-4 py-6">
        <BackLink />
        <Skeleton className="h-48 rounded-[var(--radius-card)]" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 rounded-[var(--radius-card)]" />
      </Page>
    );
  }

  const meals = sortMeals(data.meal_types || []);
  const time = formatMinutes(data.total_minutes);

  return (
    <Page className="space-y-5 py-2">
      <Confetti fire={celebrate} onDone={() => setCelebrate(false)} />

      <div className="flex items-center justify-between gap-2">
        <BackLink />
        <div className="flex items-center gap-1.5">
          <IconButton
            icon={Heart}
            label={data.is_favorite ? 'Remove from favourites' : 'Add to favourites'}
            onClick={toggleFavorite}
            className={data.is_favorite ? 'border-brand-bright/40 text-brand-glow' : ''}
          />
          <IconButton
            icon={editing ? X : Pencil}
            label={editing ? 'Stop editing' : 'Edit'}
            onClick={() => setEditing(!editing)}
            className={editing ? 'border-saffron-dim/50 text-saffron-text' : ''}
          />
        </div>
      </div>

      {/* ------------------------------------------------------------ header */}

      <Card glow className="overflow-hidden">
        {data.cover_image_uuid && (
          <div className="relative h-44 w-full sm:h-60">
            <DishPhoto imageUuid={data.cover_image_uuid} alt={data.name} rounded="" />
            <div
              className="absolute inset-0 bg-gradient-to-t from-surface via-surface/25 to-transparent"
              aria-hidden
            />
          </div>
        )}

        <div className={`p-4 sm:p-5 ${data.cover_image_uuid ? 'relative -mt-12' : ''}`}>
          <h1 className="text-balance text-3xl leading-[1.08] sm:text-4xl">{data.name}</h1>

          {data.cuisine && (
            <p className="mt-1 text-[0.7rem] font-bold uppercase tracking-[0.16em] text-saffron-text">
              {data.cuisine}
            </p>
          )}

          {data.description && (
            <p className="mt-3 text-[0.95rem] leading-relaxed text-ink-2">{data.description}</p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-ink-3">
            {time && (
              <span className="inline-flex items-center gap-1.5">
                <Clock size={13} aria-hidden />
                {time}
                {data.prep_minutes && data.cook_minutes ? (
                  <span className="text-ink-3/70">
                    ({data.prep_minutes} prep + {data.cook_minutes} cook)
                  </span>
                ) : null}
              </span>
            )}
            {data.servings && (
              <span className="inline-flex items-center gap-1.5">
                <Users size={13} aria-hidden />
                serves {data.servings}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <ChefHat size={13} aria-hidden />
              {data.difficulty}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 ${
                data.times_cooked === 0 ? 'text-saffron-text' : ''
              }`}
            >
              <Flame size={13} aria-hidden />
              {lastCookedLabel(data.last_cooked_at)}
              {data.times_cooked > 0 && ` - ${data.times_cooked} times`}
            </span>
            {data.source_url && (
              <a
                href={data.source_url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 text-saffron-text hover:underline"
              >
                <ExternalLink size={13} aria-hidden />
                Source
              </a>
            )}
          </div>

          {meals.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {meals.map((meal) => (
                <Badge key={meal} tone="neutral" icon={MEAL_TYPES[meal]?.icon}>
                  {mealLabel(meal)}
                </Badge>
              ))}
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {data.steps.length > 0 && (
              <Button icon={ChefHat} onClick={() => setCooking(true)}>
                Cook it
              </Button>
            )}
            <Button variant="outline" onClick={() => logCook()}>
              Just log it
            </Button>
            <Button
              variant="ghost"
              icon={FileText}
              loading={exporting === 'md'}
              onClick={() => exportAs('md')}
            >
              Markdown
            </Button>
            <Button
              variant="ghost"
              icon={FileDown}
              loading={exporting === 'pdf'}
              onClick={() => exportAs('pdf')}
            >
              PDF
            </Button>
            {/* Only worth offering when there is something to bundle: the zip
                exists so the photos outlive the markdown's signed links. */}
            {data.image_count + data.step_image_count > 0 && (
              <Button
                variant="ghost"
                icon={FolderArchive}
                loading={exporting === 'zip'}
                onClick={() => exportAs('zip')}
                title="recipe.md plus an images folder — markdown that keeps its photos"
              >
                Zip
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* -------------------------------------------------------------- body */}

      <Tabs
        id="dish"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'recipe', label: 'Recipe', count: data.steps.length },
          { value: 'ingredients', label: 'Ingredients', count: data.ingredients.length },
          { value: 'photos', label: 'Photos', count: data.images.length },
          { value: 'pairs', label: 'Goes with', count: data.often_had_with.length },
        ]}
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={`${tab}-${editing}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
        >
          {tab === 'recipe' &&
            (editing ? (
              // Not mounted until the shelf is in: the editor converts mentions
              // to their stored form on save, and without a shelf to resolve
              // them against every one would degrade to plain prose.
              shelf.data ? (
                <RecipeEditor
                  dish={data}
                  shelf={shelf.data}
                  onCreateIngredient={createIngredient}
                  onSaved={() => {
                    dish.reload();
                    shelf.reload();
                  }}
                />
              ) : (
                <Skeleton className="h-64 rounded-[var(--radius-card)]" />
              )
            ) : (
              <Card className="p-4">
                <StepList steps={data.steps} />
                {data.notes && (
                  <>
                    <div className="hairline my-4" />
                    <SectionTitle>Notes</SectionTitle>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-2">
                      {data.notes}
                    </p>
                  </>
                )}
              </Card>
            ))}

          {tab === 'ingredients' &&
            (editing ? (
              shelf.data ? (
                <IngredientsPanel
                  dish={data}
                  shelf={shelf.data}
                  onCreateIngredient={createIngredient}
                  onSaved={() => {
                    dish.reload();
                    shelf.reload();
                  }}
                />
              ) : (
                <Skeleton className="h-64 rounded-[var(--radius-card)]" />
              )
            ) : (
              <Card className="p-4">
                <IngredientList ingredients={data.ingredients} />
              </Card>
            ))}

          {tab === 'photos' && (
            <PhotosPanel dish={data} onChanged={dish.reload} editing={editing} />
          )}

          {tab === 'pairs' && <PairsPanel dish={data} onChanged={dish.reload} />}
        </motion.div>
      </AnimatePresence>

      {editing && (
        <Card className="p-4">
          <SectionTitle>Details</SectionTitle>
          <DetailsEditor dish={data} onSaved={dish.reload} />
          <div className="hairline my-5" />
          <Button variant="danger" icon={Trash2} onClick={remove}>
            Delete this dish
          </Button>
        </Card>
      )}

      <AnimatePresence>
        {cooking && (
          <CookMode
            dish={data}
            open={cooking}
            onClose={() => setCooking(false)}
            onFinish={() => {
              setCooking(false);
              logCook();
            }}
          />
        )}
      </AnimatePresence>
    </Page>
  );
}

function BackLink() {
  return (
    <Link
      to="/dishes"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-3 transition-colors hover:text-ink"
    >
      <ArrowLeft size={16} />
      All dishes
    </Link>
  );
}

/* ---------------------------------------------------------------- recipe */

/** A server step in the shape the editor holds it. */
function fromServer(step, shelf) {
  return {
    key: step.step_uuid,
    // Kept so a save can say "this is the same step, edited" — which is what
    // stops a reorder detaching the step's photos.
    step_uuid: step.step_uuid,
    text: toEditable(step.text, shelf),
    minutes: step.minutes,
    images: step.images || [],
  };
}

function RecipeEditor({ dish, shelf, onCreateIngredient, onSaved }) {
  const { toast } = useToast();
  // Steps are keyed locally so a reorder animates the row rather than the text
  // inside it. Without a stable key React reuses the DOM node and the caret
  // jumps between steps.
  // The editor holds the readable form (`@[Onion]`); the backend stores the
  // uuid-carrying one. src/lib/mentions.js explains why the two differ and
  // translates between them.
  const [steps, setSteps] = useState(() => dish.steps.map((step) => fromServer(step, shelf)));
  const [notes, setNotes] = useState(dish.notes || '');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState(() => {
    try {
      return localStorage.getItem(HINT_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const nextKey = useRef(0);

  // Compared in storage form, because that is the only comparison that answers
  // the question the Save button asks: would pressing this change anything?
  // JSON.stringify rather than a joined string, so no separator can collide
  // with the contents of a step.
  const dirty = useMemo(() => {
    const original = JSON.stringify(
      dish.steps.map((step) => [step.text, step.minutes ?? null])
    );
    const current = JSON.stringify(
      steps
        .filter((step) => step.text.trim())
        .map((step) => [toStorage(step.text.trim(), shelf), step.minutes ?? null])
    );
    return original !== current || (dish.notes || '') !== notes;
  }, [dish.steps, dish.notes, steps, notes, shelf]);

  const save = async () => {
    setBusy(true);
    try {
      const payload = steps
        .filter((step) => step.text.trim())
        .map((step) => ({
          step_uuid: step.step_uuid ?? null,
          text: toStorage(step.text.trim(), shelf),
          minutes: step.minutes ?? null,
        }));
      const updated = await api.setSteps(dish.dish_uuid, payload);
      if ((dish.notes || '') !== notes) {
        await api.updateDish(dish.dish_uuid, { notes: notes.trim() || null });
      }
      // Re-seed from what came back rather than leaving local state as it was.
      // A step added in this save has no uuid until now, and without adopting
      // the response its camera button would stay disabled until the page was
      // reloaded.
      setSteps(updated.steps.map((step) => fromServer(step, shelf)));
      toast('Recipe saved.', 'success');
      onSaved();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  /** Attach a photo to a saved step, and show it without a round trip. */
  const uploadPhoto = async (stepUuid, file) => {
    try {
      const image = await api.uploadStepImage(stepUuid, file);
      setSteps((current) =>
        current.map((step) =>
          step.step_uuid === stepUuid
            ? { ...step, images: [...(step.images || []), image] }
            : step
        )
      );
      onSaved();
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  const deletePhoto = async (imageUuid) => {
    try {
      await api.deleteImage(imageUuid);
      setSteps((current) =>
        current.map((step) => ({
          ...step,
          images: (step.images || []).filter((image) => image.image_uuid !== imageUuid),
        }))
      );
      onSaved();
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  return (
    <Card className="space-y-4 p-4">
      {hint && (
        <MentionHint
          onDismiss={() => {
            setHint(false);
            try {
              localStorage.setItem(HINT_KEY, '1');
            } catch {
              /* private mode: the hint comes back next time, which is fine */
            }
          }}
        />
      )}

      <StepEditor
        steps={steps}
        ingredients={shelf}
        onCreateIngredient={onCreateIngredient}
        onUploadPhoto={uploadPhoto}
        onDeletePhoto={deletePhoto}
        onChange={(next) =>
          setSteps(
            next.map((step) => ({
              ...step,
              // A brand new row has no key yet; give it one that cannot collide
              // with a step_uuid.
              key: step.key ?? `new-${nextKey.current++}`,
            }))
          )
        }
      />

      <div className="hairline" />

      <TextArea
        label="Notes"
        hint="not part of the method"
        rows={3}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Better the next day. Halve the chilli for guests."
      />

      <Button full size="lg" loading={busy} onClick={save} disabled={!dirty}>
        {dirty ? 'Save the recipe' : 'Saved'}
      </Button>
    </Card>
  );
}

/* ----------------------------------------------------------- ingredients */

function IngredientsPanel({ dish, shelf, onCreateIngredient, onSaved }) {
  const { toast } = useToast();
  const [rows, setRows] = useState(() =>
    dish.ingredients.map((item) => ({
      ingredient_uuid: item.ingredient_uuid,
      name: item.name,
      emoji: item.emoji,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit || '',
      note: item.note || '',
      is_optional: item.is_optional,
    }))
  );
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.setDishIngredients(
        dish.dish_uuid,
        rows.map((row) => ({
          ingredient_uuid: row.ingredient_uuid,
          quantity: row.quantity,
          unit: row.unit?.trim() || null,
          note: row.note?.trim() || null,
          is_optional: row.is_optional,
        }))
      );
      toast('Ingredients saved.', 'success');
      onSaved();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-4 p-4">
      <DishIngredientsEditor
        rows={rows}
        onChange={setRows}
        shelf={shelf}
        onCreateIngredient={onCreateIngredient}
      />
      <Button full size="lg" loading={busy} onClick={save}>
        Save ingredients
      </Button>
    </Card>
  );
}

/* ---------------------------------------------------------------- photos */

function PhotosPanel({ dish, onChanged, editing }) {
  const { toast } = useToast();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState(null);

  const upload = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      // Sequentially, not in parallel: a phone uploading four 5MB photos at
      // once over a bad connection times out all four instead of landing three.
      for (const file of files) {
        await api.uploadDishImage(dish.dish_uuid, file);
      }
      toast(files.length > 1 ? `${files.length} photos added.` : 'Photo added.', 'success');
      onChanged();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const setCover = async (image) => {
    try {
      await api.updateImage(image.image_uuid, { is_cover: true });
      toast('Cover updated.', 'success');
      onChanged();
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  const remove = async (image) => {
    try {
      await api.deleteImage(image.image_uuid);
      forgetPhoto(image.image_uuid);
      setViewing(null);
      onChanged();
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  return (
    <Card className="space-y-4 p-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        // `capture` is deliberately absent: on a phone this offers both the
        // camera and the library, which is what you want when half the photos
        // are taken at the stove and half are screenshots of a recipe.
        onChange={(event) => upload([...event.target.files])}
        className="hidden"
      />

      {dish.images.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex w-full flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-6 py-10 text-center transition-colors hover:border-line-strong"
        >
          <span className="grid h-14 w-14 place-items-center rounded-2xl border border-line bg-surface-2 text-ink-3">
            <Camera size={24} aria-hidden />
          </span>
          <span className="text-base font-semibold text-ink">
            {uploading ? 'Uploading...' : 'Add a photo'}
          </span>
          <span className="max-w-xs text-sm text-ink-3">
            The first one becomes the cover, and shows up on the card and in the PDF.
          </span>
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {dish.images.map((image) => (
            <div key={image.image_uuid} className="group relative">
              <button
                type="button"
                onClick={() => setViewing(image)}
                className="block aspect-square w-full overflow-hidden rounded-xl border border-line"
              >
                <DishPhoto imageUuid={image.image_uuid} alt={image.caption || dish.name} />
              </button>
              {image.is_cover && (
                <span className="pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-white">
                  <Star size={9} className="fill-current" aria-hidden />
                  Cover
                </span>
              )}
              {editing && (
                <div className="absolute right-1.5 top-1.5 flex gap-1">
                  {!image.is_cover && (
                    <button
                      type="button"
                      onClick={() => setCover(image)}
                      aria-label="Make this the cover"
                      title="Make this the cover"
                      className="grid h-7 w-7 place-items-center rounded-lg bg-black/65 text-white transition-colors hover:bg-black/85"
                    >
                      <Star size={13} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(image)}
                    aria-label="Delete photo"
                    title="Delete photo"
                    className="grid h-7 w-7 place-items-center rounded-lg bg-black/65 text-white transition-colors hover:bg-bad"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="grid aspect-square place-items-center rounded-xl border border-dashed border-line text-ink-3 transition-colors hover:border-line-strong hover:text-ink"
          >
            <span className="flex flex-col items-center gap-1.5 text-xs font-semibold">
              <ImagePlus size={20} aria-hidden />
              {uploading ? 'Uploading...' : 'Add'}
            </span>
          </button>
        </div>
      )}

      <Sheet
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing?.caption || dish.name}
        maxWidth="max-w-2xl"
      >
        {viewing && (
          <div className="pb-4">
            <div className="overflow-hidden rounded-xl">
              <DishPhoto imageUuid={viewing.image_uuid} alt={viewing.caption || dish.name} />
            </div>
            <p className="mt-3 text-xs text-ink-3">Added {relativeTime(viewing.created_at)}</p>
            {editing && (
              <div className="mt-4 flex flex-wrap gap-2">
                {!viewing.is_cover && (
                  <Button variant="outline" size="sm" icon={Star} onClick={() => setCover(viewing)}>
                    Make cover
                  </Button>
                )}
                <Button variant="danger" size="sm" icon={Trash2} onClick={() => remove(viewing)}>
                  Delete
                </Button>
              </div>
            )}
          </div>
        )}
      </Sheet>
    </Card>
  );
}

/* --------------------------------------------------------------- pairings */

function PairsPanel({ dish, onChanged }) {
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState([]);

  useEffect(() => {
    if (!adding) return;
    api
      .dishes({ sort: 'name' })
      .then((list) =>
        setOptions(
          list.filter(
            (other) =>
              other.dish_uuid !== dish.dish_uuid &&
              !dish.often_had_with.some((paired) => paired.dish_uuid === other.dish_uuid)
          )
        )
      )
      .catch(() => setOptions([]));
  }, [adding, dish]);

  const add = async (body) => {
    setBusy(true);
    try {
      await api.addPairing(dish.dish_uuid, body);
      setName('');
      setAdding(false);
      toast('Noted.', 'success');
      onChanged();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (other) => {
    try {
      await api.removePairing(dish.dish_uuid, other.dish_uuid);
      onChanged();
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  const filtered = useMemo(() => {
    const needle = name.trim().toLowerCase();
    return needle ? options.filter((option) => option.name.toLowerCase().includes(needle)) : options;
  }, [options, name]);

  const exact = options.some((option) => option.name.toLowerCase() === name.trim().toLowerCase());

  return (
    <Card className="space-y-4 p-4">
      <p className="text-sm text-ink-3">
        What you usually eat this with. It works both ways, so adding rice here puts this dish on
        rice&apos;s page too.
      </p>

      {dish.often_had_with.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {dish.often_had_with.map((other) => (
            <Chip
              key={other.dish_uuid}
              as="span"
              removable
              onRemove={() => remove(other)}
              icon={Link2}
              className="pr-1.5"
            >
              <Link to={`/dishes/${other.dish_uuid}`} className="hover:underline">
                {other.name}
              </Link>
            </Chip>
          ))}
        </div>
      )}

      {!adding ? (
        <Button variant="outline" icon={Plus} onClick={() => setAdding(true)} full>
          Add a pairing
        </Button>
      ) : (
        <div className="rounded-2xl border border-line bg-surface/60 p-3">
          <TextField
            autoFocus
            label="Goes with"
            hint="a dish, new or existing"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setAdding(false);
              if (event.key === 'Enter' && name.trim()) {
                event.preventDefault();
                add(
                  exact && filtered.length
                    ? { dish_uuid: filtered[0].dish_uuid }
                    : { name: name.trim() }
                );
              }
            }}
            placeholder="Jeera rice"
          />

          <div className="mt-3 flex max-h-48 flex-wrap gap-2 overflow-y-auto">
            {name.trim() && !exact && (
              <Chip onClick={() => add({ name: name.trim() })} className="border-dashed">
                {busy ? 'Adding...' : `Create "${name.trim()}"`}
              </Chip>
            )}
            {filtered.map((option) => (
              <Chip key={option.dish_uuid} onClick={() => add({ dish_uuid: option.dish_uuid })}>
                {option.name}
              </Chip>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setAdding(false)}
            className="mt-3 w-full rounded-xl border border-line py-2 text-sm font-semibold text-ink-3 hover:text-ink"
          >
            Cancel
          </button>
        </div>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------- details */

function DetailsEditor({ dish, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: dish.name,
    description: dish.description || '',
    cuisine: dish.cuisine || '',
    prep_minutes: dish.prep_minutes ?? '',
    cook_minutes: dish.cook_minutes ?? '',
    servings: dish.servings ?? '',
    difficulty: dish.difficulty,
    source_url: dish.source_url || '',
    meal_types: sortMeals(dish.meal_types || []),
  });
  const [busy, setBusy] = useState(false);

  const set = (patch) => setForm((current) => ({ ...current, ...patch }));

  const save = async () => {
    setBusy(true);
    try {
      await api.updateDish(dish.dish_uuid, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        cuisine: form.cuisine.trim() || null,
        prep_minutes: form.prep_minutes === '' ? null : Number(form.prep_minutes),
        cook_minutes: form.cook_minutes === '' ? null : Number(form.cook_minutes),
        servings: form.servings === '' ? null : Number(form.servings),
        difficulty: form.difficulty,
        source_url: form.source_url.trim() || null,
        meal_types: form.meal_types,
      });
      toast('Details saved.', 'success');
      onSaved();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <TextField
        label="Name"
        value={form.name}
        onChange={(event) => set({ name: event.target.value })}
      />
      <TextArea
        label="Description"
        rows={2}
        value={form.description}
        onChange={(event) => set({ description: event.target.value })}
      />

      <div>
        <p className="mb-1.5 text-[0.7rem] font-bold uppercase tracking-[0.16em] text-ink-3">
          Good for
        </p>
        <div className="flex flex-wrap gap-2">
          {MEAL_ORDER.map((meal) => (
            <Chip
              key={meal}
              selected={form.meal_types.includes(meal)}
              icon={MEAL_TYPES[meal].icon}
              onClick={() =>
                set({
                  meal_types: form.meal_types.includes(meal)
                    ? form.meal_types.filter((entry) => entry !== meal)
                    : [...form.meal_types, meal],
                })
              }
            >
              {mealLabel(meal)}
            </Chip>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <TextField
          label="Prep"
          suffix="min"
          type="number"
          inputMode="numeric"
          min="0"
          value={form.prep_minutes}
          onChange={(event) => set({ prep_minutes: event.target.value })}
        />
        <TextField
          label="Cook"
          suffix="min"
          type="number"
          inputMode="numeric"
          min="0"
          value={form.cook_minutes}
          onChange={(event) => set({ cook_minutes: event.target.value })}
        />
        <TextField
          label="Serves"
          type="number"
          inputMode="numeric"
          min="1"
          value={form.servings}
          onChange={(event) => set({ servings: event.target.value })}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Cuisine"
          value={form.cuisine}
          onChange={(event) => set({ cuisine: event.target.value })}
        />
        <Select
          label="Difficulty"
          value={form.difficulty}
          onChange={(event) => set({ difficulty: event.target.value })}
          options={[
            { value: 'easy', label: 'Easy' },
            { value: 'medium', label: 'Medium' },
            { value: 'hard', label: 'Hard' },
          ]}
        />
      </div>

      <TextField
        label="Source"
        hint="a link, if you got it from somewhere"
        type="url"
        value={form.source_url}
        onChange={(event) => set({ source_url: event.target.value })}
        placeholder="https://..."
      />

      <Button loading={busy} onClick={save} disabled={!form.name.trim()}>
        Save details
      </Button>
    </div>
  );
}
