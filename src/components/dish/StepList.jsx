import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Clock, X } from 'lucide-react';
import Button from '../ui/Button';
import DishPhoto, { usePhotoUrl } from './DishPhoto';
import { segments } from '../../lib/mentions';
import { categoryEmoji } from '../../lib/labels';

/** One step, with its `@`-mentioned ingredients rendered as chips inline. */
export function StepText({ text, className = '' }) {
  return (
    <span className={className}>
      {segments(text).map((segment, index) =>
        segment.type === 'mention' ? (
          <span
            key={index}
            className="mx-px inline-flex items-baseline rounded-md bg-saffron/15 px-1 font-semibold text-saffron-text"
          >
            {segment.value}
          </span>
        ) : (
          <span key={index}>{segment.value}</span>
        )
      )}
    </span>
  );
}

// Four tiles is two rows of the grid below, which is as tall as a step is
// allowed to get before its photos start outweighing its instruction. Anything
// past that is counted on the last tile and opens in the lightbox.
const MAX_TILES = 4;

/**
 * A step's photos, in the column beside its text.
 *
 * Laid out as a small mosaic rather than a plain grid, because a plain grid
 * leaves an odd count with a half-empty final row — three photos as 2 + 1 reads
 * like something failed to load. So an odd set leads with one wide tile and
 * pairs the rest, and every arrangement fills its rectangle:
 *
 *     1 → ▔▔▔      2 → ▘▝      3 → ▔▔▔      4 → ▘▝
 *                                   ▘▝            ▘▝
 *
 * Captions only ride on the wide tiles. On a square barely 100px across a line
 * of text is a smudge, and the lightbox shows every caption in full.
 */
export function StepPhotos({ images = [], stepNumber, onOpen, className = '' }) {
  if (images.length === 0) return null;

  const shown = images.slice(0, MAX_TILES);
  const hidden = images.length - shown.length;
  // An odd set leads with a full-width tile so the pairs below come out even.
  const leadIsWide = shown.length % 2 === 1;

  return (
    <div className={`grid shrink-0 grid-cols-2 gap-1.5 ${className}`}>
      {shown.map((image, index) => {
        const wide = leadIsWide && index === 0;
        const more = hidden > 0 && index === shown.length - 1;
        return (
          <button
            key={image.image_uuid}
            type="button"
            onClick={() => onOpen?.(index)}
            aria-label={
              more
                ? `Photo ${index + 1} of step ${stepNumber}, and ${hidden} more`
                : image.caption || `Photo ${index + 1} of step ${stepNumber}`
            }
            className={`group relative block overflow-hidden rounded-xl border border-line transition-[border-color] duration-200 hover:border-saffron/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
              wide
                ? `col-span-2 ${shown.length === 1 ? 'aspect-[4/3]' : 'aspect-[16/9]'}`
                : 'aspect-square'
            }`}
          >
            <DishPhoto
              imageUuid={image.image_uuid}
              alt={image.caption || `Step ${stepNumber}`}
              rounded="rounded-none"
              className="transition-transform duration-300 group-hover:scale-[1.04]"
            />
            {image.caption && wide && !more && (
              <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 pb-1.5 pt-5 text-left text-[0.68rem] font-medium leading-tight text-white">
                {image.caption}
              </span>
            )}
            {more && (
              <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/55 font-display text-lg font-bold text-white">
                +{hidden}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A step photo, filling the screen.
 *
 * Its own layer rather than the Sheet used by the photos tab: this opens from
 * inside cook mode, which is already a full-screen layer, and a sheet inside a
 * sheet reads as a mistake.
 */
export function PhotoLightbox({ images = [], index, onClose, onIndex }) {
  const open = index !== null && index !== undefined && images[index];

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') onIndex((index + 1) % images.length);
      if (event.key === 'ArrowLeft') onIndex((index - 1 + images.length) % images.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, index, images.length, onClose, onIndex]);

  if (!open) return null;
  const image = images[index];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      // Above cook mode, which is the one thing that can be underneath it.
      className="fixed inset-0 z-[110] flex flex-col bg-black/92 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="safe-top flex justify-end p-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close photo"
          className="grid h-10 w-10 place-items-center rounded-xl border border-white/20 text-white/80 hover:text-white"
        >
          <X size={18} />
        </button>
      </div>

      <div
        className="flex min-h-0 flex-1 items-center justify-center px-4"
        onClick={(event) => event.stopPropagation()}
      >
        <LightboxImage image={image} />
      </div>

      <div className="safe-bottom px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
        {image.caption && <p className="text-sm text-white/85">{image.caption}</p>}
        {images.length > 1 && (
          <div className="mt-3 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => onIndex((index - 1 + images.length) % images.length)}
              aria-label="Previous photo"
              className="grid h-9 w-9 place-items-center rounded-lg border border-white/20 text-white/80 hover:text-white"
            >
              <ArrowLeft size={16} />
            </button>
            <span className="text-xs font-semibold tabular-nums text-white/60">
              {index + 1} / {images.length}
            </span>
            <button
              type="button"
              onClick={() => onIndex((index + 1) % images.length)}
              aria-label="Next photo"
              className="grid h-9 w-9 place-items-center rounded-lg border border-white/20 text-white/80 hover:text-white"
            >
              <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function LightboxImage({ image }) {
  const [url, failed, expired] = usePhotoUrl(image.image_uuid);

  if (!url) {
    return (
      <span className="text-sm text-white/50">
        {failed ? 'That photo could not be loaded.' : 'Loading…'}
      </span>
    );
  }
  return (
    <motion.img
      key={image.image_uuid}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      src={url}
      alt={image.caption || ''}
      onError={expired}
      className="max-h-full max-w-full rounded-xl object-contain"
    />
  );
}

/**
 * The recipe, read-only. Ticking a step off is local and deliberately not saved.
 *
 * A step with photos becomes two columns — instruction left, photos right — so
 * the number and the first word of every step stay on one edge the eye can run
 * down. Below `sm` the photos drop underneath the text instead, because two
 * columns on a phone leaves neither wide enough to be worth having.
 *
 * The tick target is the text half only. Opening a photo and marking a step
 * done are different intentions, and one tap cannot mean both.
 */
export function StepList({ steps = [] }) {
  const [done, setDone] = useState(() => new Set());
  const [viewing, setViewing] = useState(null);

  const toggle = (uuid) =>
    setDone((current) => {
      const next = new Set(current);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });

  if (steps.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-3">
        No method written down yet.
      </p>
    );
  }

  return (
    <>
      <ol className="space-y-2">
        {steps.map((step) => {
          const ticked = done.has(step.step_uuid);
          const images = step.images || [];
          return (
            <li key={step.step_uuid}>
              <div
                className={`flex flex-col gap-3 rounded-2xl border p-3 transition-colors duration-200 sm:flex-row sm:items-start ${
                  ticked
                    ? 'border-good/30 bg-good/5'
                    : 'border-line bg-surface/60 hover:border-line-strong'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggle(step.step_uuid)}
                  aria-pressed={ticked}
                  className="flex min-w-0 flex-1 gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg font-display text-sm font-bold transition-colors ${
                      ticked ? 'bg-good/20 text-good' : 'bg-brand/15 text-brand-glow'
                    }`}
                  >
                    {ticked ? <Check size={14} /> : step.step_index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <StepText
                      text={step.text}
                      className={`block text-sm leading-relaxed ${
                        ticked ? 'text-ink-3 line-through decoration-good/40' : 'text-ink'
                      }`}
                    />
                    {step.minutes ? (
                      <span className="mt-1 inline-flex items-center gap-1 text-[0.7rem] font-semibold text-ink-3">
                        <Clock size={11} aria-hidden />
                        {step.minutes} min
                      </span>
                    ) : null}
                  </span>
                </button>

                <StepPhotos
                  images={images}
                  stepNumber={step.step_index + 1}
                  onOpen={(index) => setViewing({ images, index })}
                  className={`w-full sm:w-56 ${ticked ? 'opacity-60' : ''}`}
                />
              </div>
            </li>
          );
        })}
      </ol>

      <AnimatePresence>
        {viewing && (
          <PhotoLightbox
            images={viewing.images}
            index={viewing.index}
            onClose={() => setViewing(null)}
            onIndex={(index) => setViewing((current) => ({ ...current, index }))}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * Cook mode: one step at a time, full screen.
 *
 * This is why steps are rows in a table rather than a blob of markdown. Each
 * one arrives complete — its own text, its own timer, its own ingredients —
 * so it can be shown alone with nothing else competing for a glance from
 * across the kitchen.
 */
export function CookMode({ dish, open, onClose, onFinish }) {
  const [index, setIndex] = useState(0);
  const [viewing, setViewing] = useState(null);
  const steps = dish.steps || [];
  const step = steps[index];
  const last = index === steps.length - 1;

  if (!open || !step) return null;
  const images = step.images || [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[95] flex flex-col bg-bg"
    >
      <div className="grain absolute inset-0 -z-10" aria-hidden />

      <header className="safe-top flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-semibold text-ink">{dish.name}</p>
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-ink-3">
            Step {index + 1} of {steps.length}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Leave cook mode"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line text-ink-2 hover:text-ink"
        >
          <X size={18} />
        </button>
      </header>

      {/* Progress. Segments rather than a bar, so "two more to go" is countable
          at a glance instead of estimated from a width. */}
      <div className="flex gap-1 px-4">
        {steps.map((entry, entryIndex) => (
          <span
            key={entry.step_uuid}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              entryIndex <= index ? 'bg-saffron' : 'bg-surface-3'
            }`}
          />
        ))}
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-5 py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={step.step_uuid}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            // Photos push this wider and off-centre: a step with a picture is
            // read as a pair, text beside image, while a step without one stays
            // the single centred column it has always been.
            className={
              images.length > 0
                ? 'grid w-full max-w-5xl items-center gap-6 lg:grid-cols-[1fr_minmax(0,22rem)]'
                : 'w-full max-w-xl text-center'
            }
          >
            <div className={images.length > 0 ? 'text-center lg:text-left' : ''}>
              <p className="font-display text-6xl font-bold text-brand-glow">{index + 1}</p>
              <StepText
                text={step.text}
                className="mt-4 block text-balance text-xl leading-relaxed text-ink sm:text-2xl"
              />
              {step.minutes ? (
                <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-saffron-dim/40 bg-saffron/10 px-3 py-1.5 text-sm font-semibold text-saffron-text">
                  <Clock size={14} aria-hidden />
                  {step.minutes} minutes
                </p>
              ) : null}

              {step.ingredients?.length > 0 && (
                <div className="mt-6">
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-ink-3">
                    You&rsquo;ll need
                  </p>
                  <div
                    className={`mt-2 flex flex-wrap gap-1.5 ${
                      images.length > 0 ? 'justify-center lg:justify-start' : 'justify-center'
                    }`}
                  >
                    {step.ingredients.map((ingredient) => (
                      <span
                        key={ingredient.ingredient_uuid}
                        className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2/70 px-2.5 py-1 text-sm text-ink-2"
                      >
                        <span aria-hidden>
                          {ingredient.emoji || categoryEmoji(ingredient.category)}
                        </span>
                        {ingredient.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {images.length > 0 && (
              <StepPhotos
                images={images}
                stepNumber={index + 1}
                onOpen={(photoIndex) => setViewing(photoIndex)}
                className="mx-auto w-full max-w-sm lg:max-w-none"
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <footer className="safe-bottom flex gap-2 border-t border-line bg-surface/40 px-4 py-4">
        <Button
          variant="outline"
          icon={ArrowLeft}
          onClick={() => setIndex((current) => Math.max(0, current - 1))}
          disabled={index === 0}
        >
          Back
        </Button>
        {last ? (
          <Button variant="saffron" icon={Check} onClick={onFinish} className="flex-1">
            Done — I cooked it
          </Button>
        ) : (
          <Button
            iconRight={ArrowRight}
            onClick={() => setIndex((current) => Math.min(steps.length - 1, current + 1))}
            className="flex-1"
          >
            Next
          </Button>
        )}
      </footer>

      <AnimatePresence>
        {viewing !== null && (
          <PhotoLightbox
            images={images}
            index={viewing}
            onClose={() => setViewing(null)}
            onIndex={setViewing}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default StepList;
