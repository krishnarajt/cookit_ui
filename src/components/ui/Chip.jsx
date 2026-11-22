import { motion } from 'framer-motion';
import { Check, Plus, X } from 'lucide-react';
import { categoryTint } from '../../lib/palette';
import { categoryEmoji } from '../../lib/labels';

/**
 * The app's smallest unit of interaction, and the one it leans on hardest.
 *
 * Everything selectable is a chip: an ingredient on the shelf, a meal type in
 * the filter bar, a mentioned ingredient in a step. They are sized for a thumb
 * (36px tall, which clears the 32px most phones want) and wrap rather than
 * scroll, because a filter you have to scroll sideways to see is a filter you
 * forget you set.
 */
export function Chip({
  children,
  selected = false,
  onClick,
  tint,
  icon: Icon,
  count,
  removable = false,
  onRemove,
  as: Tag = 'button',
  className = '',
  ...props
}) {
  const interactive = Tag === 'button';
  return (
    <motion.span
      // `layout` would be nice here but chips wrap, and animating a reflowing
      // wrap looks like a glitch rather than a transition.
      whileTap={interactive ? { scale: 0.94 } : undefined}
      transition={{ type: 'spring', stiffness: 600, damping: 30 }}
      className="inline-flex"
    >
      <Tag
        type={interactive ? 'button' : undefined}
        onClick={onClick}
        aria-pressed={interactive && onClick ? selected : undefined}
        style={
          tint
            ? {
                borderColor: selected
                  ? tint
                  : `color-mix(in oklab, ${tint} 35%, transparent)`,
                backgroundColor: `color-mix(in oklab, ${tint} ${selected ? 26 : 10}%, transparent)`,
              }
            : undefined
        }
        className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[0.8125rem] font-semibold transition-colors duration-200 ${
          tint
            ? 'text-ink'
            : selected
              ? 'border-saffron-dim bg-saffron text-saffron-ink'
              : 'border-line bg-surface-2/70 text-ink-2 hover:border-line-strong hover:text-ink'
        } ${className}`}
        {...props}
      >
        {selected && !tint && <Check size={13} aria-hidden />}
        {Icon && <Icon size={14} aria-hidden />}
        <span className="max-w-[11rem] truncate">{children}</span>
        {count > 0 && (
          <span className="tabular rounded-full bg-black/15 px-1.5 py-px text-[0.65rem] font-bold">
            {count}
          </span>
        )}
        {removable && (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Remove"
            onClick={(event) => {
              event.stopPropagation();
              onRemove?.();
            }}
            className="-mr-1 ml-0.5 grid h-5 w-5 place-items-center rounded-full text-current opacity-60 transition-opacity hover:opacity-100"
          >
            <X size={12} />
          </span>
        )}
      </Tag>
    </motion.span>
  );
}

/** An ingredient chip, tinted by its category. */
export function IngredientChip({ ingredient, selected, onClick, ...props }) {
  return (
    <Chip
      selected={selected}
      onClick={onClick}
      tint={selected ? categoryTint(ingredient.category) : undefined}
      className={selected ? 'ring-1 ring-inset ring-white/10' : ''}
      {...props}
    >
      <span className="mr-0.5" aria-hidden>
        {ingredient.emoji || categoryEmoji(ingredient.category)}
      </span>
      {ingredient.name}
    </Chip>
  );
}

/** The "add this" chip in the suggestions row. Always shows a plus. */
export function AddChip({ children, onClick, emoji, busy = false, className = '' }) {
  return (
    <Chip
      onClick={onClick}
      icon={busy ? undefined : Plus}
      disabled={busy}
      className={`border-dashed ${busy ? 'opacity-50' : ''} ${className}`}
    >
      {emoji && (
        <span className="mr-0.5" aria-hidden>
          {emoji}
        </span>
      )}
      {children}
    </Chip>
  );
}

export default Chip;
