import { Link } from 'react-router-dom';
import { Clock, Flame, Heart, ListOrdered, Users } from 'lucide-react';
import { TouchCard } from '../ui/Card';
import Badge from '../ui/Badge';
import DishPhoto from './DishPhoto';
import { formatMinutes, lastCookedLabel } from '../../lib/format';
import { MEAL_TYPES, sortMeals } from '../../lib/labels';

/**
 * A dish, as it appears in a list.
 *
 * Shows the four things that decide whether you tap it: what it looks like,
 * how long it takes, what meals it suits, and when you last had it. That last
 * one earns its place — "never cooked" is the most interesting thing the app
 * can tell you about a dish, and it is the reason the overdue shelf works.
 */
export function DishCard({ dish, compact = false }) {
  const meals = sortMeals(dish.meal_types || []);
  const time = formatMinutes(dish.total_minutes);

  return (
    <TouchCard glow={dish.is_favorite}>
      <Link to={`/dishes/${dish.dish_uuid}`} className="flex h-full gap-3 p-3">
        <span
          className={`relative shrink-0 overflow-hidden rounded-xl ${
            compact ? 'h-16 w-16' : 'h-20 w-20 sm:h-24 sm:w-24'
          }`}
        >
          <DishPhoto imageUuid={dish.cover_image_uuid} alt={dish.name} />
          {dish.image_count > 1 && (
            <span className="absolute bottom-1 right-1 rounded-md bg-black/60 px-1 text-[0.6rem] font-bold text-white">
              {dish.image_count}
            </span>
          )}
        </span>

        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-start justify-between gap-2">
            <span className="min-w-0">
              <span className="block truncate font-display text-[1.05rem] font-semibold leading-tight text-ink">
                {dish.name}
              </span>
              {dish.cuisine && (
                <span className="block truncate text-[0.7rem] font-medium uppercase tracking-[0.1em] text-ink-3">
                  {dish.cuisine}
                </span>
              )}
            </span>
            {dish.is_favorite && (
              <Heart size={14} className="mt-0.5 shrink-0 fill-brand-glow text-brand-glow" aria-label="Favourite" />
            )}
          </span>

          {!compact && dish.description && (
            <span className="mt-1 line-clamp-2 text-[0.8rem] leading-snug text-ink-3">
              {dish.description}
            </span>
          )}

          <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-[0.7rem] font-medium text-ink-3">
            {time && (
              <span className="inline-flex items-center gap-1">
                <Clock size={11} aria-hidden />
                {time}
              </span>
            )}
            {dish.servings && (
              <span className="inline-flex items-center gap-1">
                <Users size={11} aria-hidden />
                {dish.servings}
              </span>
            )}
            {dish.step_count > 0 && (
              <span className="inline-flex items-center gap-1">
                <ListOrdered size={11} aria-hidden />
                {dish.step_count}
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1 ${
                dish.times_cooked === 0 ? 'text-saffron-text' : ''
              }`}
            >
              <Flame size={11} aria-hidden />
              {lastCookedLabel(dish.last_cooked_at)}
            </span>
          </span>

          {meals.length > 0 && (
            <span className="mt-2 flex flex-wrap gap-1">
              {meals.map((meal) => (
                <Badge key={meal} tone="neutral" icon={MEAL_TYPES[meal]?.icon}>
                  {MEAL_TYPES[meal]?.short ?? meal}
                </Badge>
              ))}
            </span>
          )}
        </span>
      </Link>
    </TouchCard>
  );
}

export default DishCard;
