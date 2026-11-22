import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDown,
  ChevronUp,
  Clock,
  ImagePlus,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import Button from '../ui/Button';
import DishPhoto, { forgetPhoto } from './DishPhoto';
import { activeMention, insertMention, searchIngredients } from '../../lib/mentions';
import { categoryEmoji } from '../../lib/labels';

/**
 * The recipe editor.
 *
 * One textarea per step, and typing `@` opens a picker over the shelf. Picking
 * something writes `@[name](uuid)` into the text — the name so it stays
 * readable, the uuid so it survives a rename — and the backend links that
 * ingredient to the step *and* adds it to the dish. Writing the recipe is what
 * builds the shopping list.
 *
 * Reordering is buttons, not drag. Every step is a focusable textarea and a
 * drag handle inside one is a fight with text selection on a touchscreen; two
 * arrows always work, and work with a keyboard for free.
 *
 * Nothing here saves as you type. The whole recipe goes up in one PUT when you
 * press Save, which is the same shape as the endpoint (`replace all`) and means
 * a half-finished sentence never becomes step 4.
 *
 * Photos are the exception, and have to be: an upload is a file going to object
 * storage, not a field in a form, so it commits immediately. That is why a step
 * has to exist server-side before it can hold one — a brand new row shows the
 * camera button disabled until the recipe is saved and the step has a uuid.
 */
export function StepEditor({
  steps,
  onChange,
  ingredients = [],
  onCreateIngredient,
  onUploadPhoto,
  onDeletePhoto,
}) {
  const update = (index, patch) =>
    onChange(steps.map((step, i) => (i === index ? { ...step, ...patch } : step)));

  const remove = (index) => onChange(steps.filter((_, i) => i !== index));

  const move = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const add = () => onChange([...steps, { text: '', minutes: null }]);

  return (
    <div className="space-y-2.5">
      <AnimatePresence initial={false}>
        {steps.map((step, index) => (
          <motion.div
            key={step.key ?? index}
            layout
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ type: 'spring', stiffness: 460, damping: 38 }}
          >
            <StepRow
              step={step}
              index={index}
              total={steps.length}
              ingredients={ingredients}
              onCreateIngredient={onCreateIngredient}
              onChange={(patch) => update(index, patch)}
              onRemove={() => remove(index)}
              onMove={(direction) => move(index, direction)}
              onUploadPhoto={onUploadPhoto}
              onDeletePhoto={onDeletePhoto}
            />
          </motion.div>
        ))}
      </AnimatePresence>

      <Button variant="outline" icon={Plus} onClick={add} full>
        Add a step
      </Button>

      {steps.length === 0 && (
        <p className="pt-1 text-center text-xs text-ink-3">
          Type <span className="font-mono font-bold text-saffron-text">@</span> in a step to pull
          an ingredient in — it gets added to the dish automatically.
        </p>
      )}
    </div>
  );
}

function StepRow({
  step,
  index,
  total,
  ingredients,
  onCreateIngredient,
  onChange,
  onRemove,
  onMove,
  onUploadPhoto,
  onDeletePhoto,
}) {
  const textareaRef = useRef(null);
  const [mention, setMention] = useState(null);
  const [highlight, setHighlight] = useState(0);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  // Set when a mention is inserted, so the caret can be restored after React
  // re-renders the controlled textarea from the new value.
  const pendingCaret = useRef(null);

  const images = step.images || [];
  // A step only gets a uuid once it has been saved, and a photo has to be
  // attached to something that exists.
  const savable = Boolean(step.step_uuid);

  const upload = async (files) => {
    if (!files?.length || !savable) return;
    setUploading(true);
    try {
      // One at a time, like the dish gallery: four 5MB photos in parallel over
      // a kitchen wifi times out all four instead of landing three.
      for (const file of files) {
        await onUploadPhoto(step.step_uuid, file);
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const matches = mention ? searchIngredients(ingredients, mention.query) : [];
  const exact = matches.some(
    (i) => i.name.toLowerCase() === mention?.query.trim().toLowerCase()
  );
  // Offering to create is what stops the editor being a dead end: a recipe
  // mentions something not on the shelf far more often than not.
  const canCreate = Boolean(mention?.query.trim()) && !exact && Boolean(onCreateIngredient);
  const options = canCreate ? [...matches, { create: true }] : matches;

  useLayoutEffect(() => {
    if (pendingCaret.current === null) return;
    const node = textareaRef.current;
    if (node) {
      node.focus();
      node.setSelectionRange(pendingCaret.current, pendingCaret.current);
    }
    pendingCaret.current = null;
  }, [step.text]);

  const syncMention = useCallback(() => {
    const node = textareaRef.current;
    if (!node) return;
    const found = activeMention(node.value, node.selectionStart);
    setMention(found);
    setHighlight(0);
  }, []);

  const choose = useCallback(
    async (option) => {
      if (!mention) return;
      const node = textareaRef.current;
      if (!node) return;

      let ingredient = option;
      if (option?.create) {
        setCreating(true);
        try {
          ingredient = await onCreateIngredient(mention.query.trim());
        } catch {
          // The toast comes from the caller; leave the text alone so nothing
          // is lost and the person can try again.
          setCreating(false);
          return;
        }
        setCreating(false);
        if (!ingredient) return;
      }

      const { text, caret } = insertMention(
        node.value,
        mention.from,
        node.selectionStart,
        ingredient
      );
      pendingCaret.current = caret;
      setMention(null);
      onChange({ text });
    },
    [mention, onChange, onCreateIngredient]
  );

  const onKeyDown = (event) => {
    if (!mention || options.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((current) => (current + 1) % options.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((current) => (current - 1 + options.length) % options.length);
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      choose(options[highlight]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setMention(null);
    }
  };

  return (
    <div className="rounded-2xl border border-line bg-surface/70 p-2.5">
      <div className="flex gap-2.5">
        <div className="flex flex-col items-center gap-0.5 pt-1">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand/15 font-display text-sm font-bold text-brand-glow">
            {index + 1}
          </span>
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Move step up"
            className="rounded p-0.5 text-ink-3 transition-colors hover:text-ink disabled:opacity-25"
          >
            <ChevronUp size={15} />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label="Move step down"
            className="rounded p-0.5 text-ink-3 transition-colors hover:text-ink disabled:opacity-25"
          >
            <ChevronDown size={15} />
          </button>
        </div>

        <div className="relative min-w-0 flex-1">
          <textarea
            ref={textareaRef}
            value={step.text}
            onChange={(event) => {
              onChange({ text: event.target.value });
              // After the value lands, not before — activeMention reads the
              // caret, and the caret is only correct post-change.
              requestAnimationFrame(syncMention);
            }}
            onKeyUp={syncMention}
            onClick={syncMention}
            onKeyDown={onKeyDown}
            onBlur={() => {
              // Delayed, or tapping an option blurs the textarea and unmounts
              // the option before its click ever fires.
              setTimeout(() => setMention(null), 150);
            }}
            rows={2}
            placeholder={
              index === 0
                ? 'Chop the @onion finely…'
                : 'What happens next? Use @ for ingredients.'
            }
            className="w-full resize-y rounded-xl border border-line bg-surface-2/60 px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-ink-3 focus:border-saffron/60 focus:outline-none"
          />

          <AnimatePresence>
            {mention && options.length > 0 && (
              <motion.ul
                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
                transition={{ type: 'spring', stiffness: 620, damping: 40 }}
                role="listbox"
                aria-label="Ingredients"
                className="absolute left-0 right-0 top-full z-40 mt-1 max-h-56 overflow-y-auto rounded-xl border border-line-strong bg-bg-elev p-1 shadow-[var(--shadow-soft)]"
              >
                {options.map((option, optionIndex) => (
                  <li key={option.create ? '__create' : option.ingredient_uuid}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={optionIndex === highlight}
                      // onMouseDown, not onClick: the textarea's blur fires
                      // first on click and would close the list underneath us.
                      onMouseDown={(event) => {
                        event.preventDefault();
                        choose(option);
                      }}
                      onMouseEnter={() => setHighlight(optionIndex)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                        optionIndex === highlight
                          ? 'bg-surface-3 text-ink'
                          : 'text-ink-2 hover:bg-surface-2'
                      }`}
                    >
                      {option.create ? (
                        <>
                          <Sparkles size={14} className="shrink-0 text-saffron-text" aria-hidden />
                          <span className="truncate">
                            {creating ? 'Adding…' : `Add “${mention.query.trim()}” to your shelf`}
                          </span>
                        </>
                      ) : (
                        <>
                          <span aria-hidden>
                            {option.emoji || categoryEmoji(option.category)}
                          </span>
                          <span className="truncate">{option.name}</span>
                          {option.is_staple && (
                            <span className="ml-auto shrink-0 text-[0.6rem] font-bold uppercase tracking-wider text-ink-3">
                              staple
                            </span>
                          )}
                        </>
                      )}
                    </button>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>

          <div className="mt-1.5 flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2/50 px-2 py-1 text-[0.7rem] font-semibold text-ink-3 focus-within:border-saffron/60">
              <Clock size={12} aria-hidden />
              <input
                type="number"
                inputMode="numeric"
                min="0"
                max="6000"
                value={step.minutes ?? ''}
                onChange={(event) =>
                  onChange({
                    minutes: event.target.value === '' ? null : Number(event.target.value),
                  })
                }
                placeholder="—"
                aria-label={`Minutes for step ${index + 1}`}
                className="w-12 bg-transparent text-center text-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              min
            </label>

            <button
              type="button"
              onClick={() => (savable ? fileRef.current?.click() : null)}
              disabled={!savable || uploading}
              title={
                savable
                  ? 'Add a photo of this step'
                  : 'Save the recipe first — then this step can hold photos'
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2/50 px-2 py-1 text-[0.7rem] font-semibold text-ink-3 transition-colors hover:border-saffron/60 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-3"
            >
              {uploading ? (
                <Loader2 size={12} className="animate-spin" aria-hidden />
              ) : (
                <ImagePlus size={12} aria-hidden />
              )}
              {uploading ? 'Adding…' : 'Photo'}
              {images.length > 0 && (
                <span className="tabular-nums text-saffron-text">{images.length}</span>
              )}
            </button>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => upload([...event.target.files])}
              className="hidden"
            />

            <button
              type="button"
              onClick={onRemove}
              aria-label={`Delete step ${index + 1}`}
              className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[0.7rem] font-semibold text-ink-3 transition-colors hover:text-bad"
            >
              <Trash2 size={12} />
              Remove
            </button>
          </div>

          {images.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {images.map((image) => (
                <div key={image.image_uuid} className="group relative">
                  <span className="block h-16 w-16 overflow-hidden rounded-lg border border-line">
                    <DishPhoto
                      imageUuid={image.image_uuid}
                      alt={image.caption || `Step ${index + 1}`}
                      rounded="rounded-none"
                    />
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      await onDeletePhoto(image.image_uuid);
                      // The presigned URL is dead the moment the object is; not
                      // dropping it would serve a 403 to the next render.
                      forgetPhoto(image.image_uuid);
                    }}
                    aria-label={`Remove photo from step ${index + 1}`}
                    className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full border border-line-strong bg-bg-elev text-ink-3 opacity-0 transition-opacity hover:text-bad focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** A dismissible hint about `@`, shown the first time a recipe is edited. */
export function MentionHint({ onDismiss }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-saffron-dim/40 bg-saffron/10 p-3 text-sm text-ink-2">
      <Sparkles size={15} className="mt-0.5 shrink-0 text-saffron-text" aria-hidden />
      <p className="flex-1 leading-relaxed">
        Type <span className="font-mono font-bold text-saffron-text">@</span> anywhere in a step to
        pull in an ingredient. It gets tagged to that step and added to the dish&rsquo;s list — so
        the recipe writes the shopping list for you.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded p-0.5 text-ink-3 hover:text-ink"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export default StepEditor;
