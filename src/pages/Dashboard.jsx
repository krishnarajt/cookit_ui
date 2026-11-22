import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Clock,
  Dices,
  Flame,
  Heart,
  Plus,
  RotateCw,
  Users,
  Utensils,
} from 'lucide-react';
import api from '../api/client';
import { useToast } from '../context/ToastContext';
import useQuery from '../hooks/useQuery';
import Button from '../components/ui/Button';
import Card, { SectionTitle } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { Confetti } from '../components/ui/Confetti';
import { EmptyState, ErrorState, SkeletonCard } from '../components/ui/Feedback';
import { Page, Stagger, StaggerItem } from '../components/ui/Motion';
import FilterBar from '../components/ui/FilterBar';
import Wheel from '../components/wheel/Wheel';
import DishCard from '../components/dish/DishCard';
import DishPhoto from '../components/dish/DishPhoto';
import { formatMinutes, greeting, lastCookedLabel, relativeTime } from '../lib/format';
import {
  IDLE_LINES,
  MEAL_TYPES,
  NO_MATCH_LINES,
  SPINNING_LINES,
  pickLine,
  sortMeals,
} from '../lib/labels';

/**
 * The dashboard, which is really just the wheel.
 *
 * The order of events on a spin matters and is easy to get wrong:
 *   1. `POST /randomizer/spin` returns the winner *and* the slices to draw.
 *   2. The slices are set, so the wheel is showing the right segments.
 *   3. Only then does the wheel start turning, towards a decision already made.
 *   4. The result card appears when the wheel stops, not when the request
 *      returns — revealing the answer three seconds before the wheel gets
 *      there would make the whole animation pointless.
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [filters, setFilters] = useState({ meal_types: [], ingredient_uuids: [], match: 'any' });
  const [slices, setSlices] = useState([]);
  const [winner, setWinner] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [revealed, setRevealed] = useState(null);
  const [poolSize, setPoolSize] = useState(null);
  const [rejected, setRejected] = useState([]);
  const [celebrate, setCelebrate] = useState(false);

  const dashboard = useQuery(useCallback(() => api.dashboard(), []));
  const shelf = useQuery(useCallback(() => api.ingredients(), []));

  const stats = dashboard.data;
  const idleLine = useMemo(() => pickLine(IDLE_LINES, Date.now() / 60000), []);

  // A change of filters invalidates whatever is on the wheel, and silently
  // leaving a stale result up would suggest it still matches.
  useEffect(() => {
    setRevealed(null);
    setWinner(null);
    setPoolSize(null);
    setRejected([]);
  }, [filters]);

  const spin = useCallback(
    async ({ again = false } = {}) => {
      if (spinning) return;
      setSpinning(true);
      setRevealed(null);
      try {
        const result = await api.spin({
          meal_types: filters.meal_types,
          ingredient_uuids: filters.ingredient_uuids,
          match: filters.match,
          exclude_dish_uuids: again && winner ? [...rejected, winner.dish_uuid] : rejected,
        });
        setPoolSize(result.pool_size);

        if (!result.dish) {
          setSpinning(false);
          setWinner(null);
          setSlices([]);
          return;
        }

        if (again && winner) setRejected((current) => [...current, winner.dish_uuid]);
        // Slices before the winner: the wheel has to be drawing the right
        // segments before it can be told which one to stop on.
        setSlices(result.slices);
        setWinner(result.dish);
      } catch (error) {
        setSpinning(false);
        toast(error.message, 'error');
      }
    },
    [filters, rejected, spinning, toast, winner]
  );

  const onSettled = useCallback(() => {
    setSpinning(false);
    setRevealed(winner);
    setCelebrate(true);
  }, [winner]);

  const cook = useCallback(
    async (dish) => {
      try {
        await api.cookDish(dish.dish_uuid, { source: 'randomizer' });
        toast(`${dish.name} — logged. Enjoy it.`, 'win');
        dashboard.reload();
      } catch (error) {
        toast(error.message, 'error');
      }
    },
    [dashboard, toast]
  );

  const emptyPool = poolSize === 0 && !spinning;

  return (
    <Page className="space-y-6 py-2">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-ink-3">
            {greeting()}
          </p>
          <h1 className="text-2xl leading-tight sm:text-3xl">
            What&rsquo;s it going to be<span className="text-brand-glow">?</span>
          </h1>
        </div>
        <Link to="/dishes?new=1">
          <Button variant="outline" size="sm" icon={Plus}>
            New dish
          </Button>
        </Link>
      </header>

      <FilterBar
        value={filters}
        onChange={setFilters}
        ingredients={shelf.data || []}
        topIngredients={stats?.top_ingredients || []}
      />

      {/* ------------------------------------------------------------ wheel */}

      <Card glow className="relative overflow-visible px-4 py-7 sm:px-8">
        <div className="grain absolute inset-0 -z-10 rounded-[var(--radius-card)]" aria-hidden />
        <Confetti fire={celebrate} onDone={() => setCelebrate(false)} />

        <div className="grid items-center gap-7 lg:grid-cols-[auto_1fr] lg:gap-10">
          <Wheel
            slices={slices}
            winnerUuid={winner?.dish_uuid}
            spinning={spinning}
            onSettled={onSettled}
            onSpin={() => spin()}
            disabled={dashboard.loading || stats?.dish_count === 0}
            size={300}
          >
            <span className="relative z-10 px-2">
              <Dices
                size={20}
                className={`mx-auto mb-0.5 text-brand-glow ${spinning ? 'animate-spin' : ''}`}
                aria-hidden
              />
              <span className="block font-display text-[0.8rem] font-bold uppercase tracking-[0.1em] text-ink">
                {spinning ? 'Spinning' : revealed ? 'Again' : 'Spin'}
              </span>
            </span>
          </Wheel>

          <div className="min-w-0">
            <AnimatePresence mode="wait">
              {emptyPool ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-center lg:text-left"
                >
                  <h2 className="text-xl">Nothing matches.</h2>
                  <p className="mt-2 text-sm text-ink-2">
                    {pickLine(NO_MATCH_LINES, filters.ingredient_uuids.length)}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() =>
                      setFilters({ meal_types: [], ingredient_uuids: [], match: 'any' })
                    }
                  >
                    Clear the filters
                  </Button>
                </motion.div>
              ) : spinning ? (
                <motion.p
                  key="spinning"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center font-display text-xl text-ink-2 lg:text-left"
                >
                  {pickLine(SPINNING_LINES, slices.length)}
                </motion.p>
              ) : revealed ? (
                <Result
                  key={revealed.dish_uuid}
                  dish={revealed}
                  poolSize={poolSize}
                  onCook={() => cook(revealed)}
                  onOpen={() => navigate(`/dishes/${revealed.dish_uuid}`)}
                  onAgain={() => spin({ again: true })}
                />
              ) : (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-center lg:text-left"
                >
                  <h2 className="text-xl sm:text-2xl">{idleLine}</h2>
                  <p className="mt-2 text-sm text-ink-2">
                    {stats?.dish_count
                      ? `${stats.dish_count} dishes in the book. The wheel favours the ones you haven’t had in a while.`
                      : 'Add a dish or two and the wheel has something to spin over.'}
                  </p>
                  {stats?.dish_count === 0 && (
                    <Link to="/dishes?new=1" className="mt-4 inline-block">
                      <Button icon={Plus}>Add your first dish</Button>
                    </Link>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </Card>

      {/* ------------------------------------------------------------ stats */}

      {dashboard.error && !stats ? (
        <ErrorState error={dashboard.error} onRetry={dashboard.reload} />
      ) : dashboard.loading && !stats ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        stats && (
          <>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Stat label="Dishes" value={stats.dish_count} icon={Utensils} to="/dishes" />
              <Stat
                label="Cooked this week"
                value={stats.cooks_this_week}
                icon={Flame}
                tone="brand"
              />
              <Stat
                label="Never cooked"
                value={stats.never_cooked}
                icon={Clock}
                tone="saffron"
                to="/dishes?sort=stale"
              />
              <Stat label="Favourites" value={stats.favorite_count} icon={Heart} />
            </div>

            {stats.overdue?.length > 0 && (
              <section>
                <SectionTitle icon={Clock} action={<Link to="/dishes?sort=stale" className="text-xs font-semibold text-saffron-text hover:underline">See all</Link>}>
                  Haven&rsquo;t had these in a while
                </SectionTitle>
                <Stagger className="grid gap-2.5 sm:grid-cols-2">
                  {stats.overdue.map((dish) => (
                    <StaggerItem key={dish.dish_uuid}>
                      <DishCard dish={dish} compact />
                    </StaggerItem>
                  ))}
                </Stagger>
              </section>
            )}

            {stats.recent_cooks?.length > 0 && (
              <section>
                <SectionTitle icon={Flame}>Recently cooked</SectionTitle>
                <div className="no-scrollbar mask-fade -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
                  {stats.recent_cooks.map((event) => (
                    <Link
                      key={event.id}
                      to={`/dishes/${event.dish_uuid}`}
                      className="w-36 shrink-0 rounded-2xl border border-line bg-surface p-2 transition-colors hover:border-line-strong"
                    >
                      <span className="block h-20 overflow-hidden rounded-xl">
                        <DishPhoto imageUuid={event.cover_image_uuid} alt={event.dish_name} />
                      </span>
                      <span className="mt-2 block truncate text-sm font-semibold text-ink">
                        {event.dish_name}
                      </span>
                      <span className="mt-0.5 block truncate text-[0.68rem] text-ink-3">
                        {relativeTime(event.cooked_at)}
                        {event.source === 'randomizer' && ' · the wheel'}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {stats.dish_count === 0 && (
              <EmptyState
                icon={Utensils}
                title="The book is empty"
                body="Add the three things you cook most and the wheel starts being useful immediately."
                action={
                  <Link to="/dishes?new=1">
                    <Button icon={Plus}>Add a dish</Button>
                  </Link>
                }
              />
            )}
          </>
        )
      )}
    </Page>
  );
}

/** The reveal. Everything needed to act on the answer, and nothing else. */
function Result({ dish, poolSize, onCook, onOpen, onAgain }) {
  const meals = sortMeals(dish.meal_types || []);
  const time = formatMinutes(dish.total_minutes);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
    >
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-saffron-text">
        Tonight, apparently
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="mt-1 block text-left font-display text-3xl font-bold leading-tight text-ink underline-offset-4 hover:underline sm:text-4xl"
      >
        {dish.name}
      </button>

      {dish.description && (
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-2">{dish.description}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs font-medium text-ink-3">
        {time && (
          <span className="inline-flex items-center gap-1">
            <Clock size={12} aria-hidden />
            {time}
          </span>
        )}
        {dish.servings && (
          <span className="inline-flex items-center gap-1">
            <Users size={12} aria-hidden />
            serves {dish.servings}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <Flame size={12} aria-hidden />
          {lastCookedLabel(dish.last_cooked_at)}
        </span>
        {poolSize > 1 && <span>· picked from {poolSize}</span>}
      </div>

      {meals.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {meals.map((meal) => (
            <Badge key={meal} tone="saffron" icon={MEAL_TYPES[meal]?.icon}>
              {MEAL_TYPES[meal]?.short ?? meal}
            </Badge>
          ))}
        </div>
      )}

      {dish.often_had_with?.length > 0 && (
        <p className="mt-3 text-xs text-ink-3">
          Often had with{' '}
          <span className="font-semibold text-ink-2">
            {dish.often_had_with.map((other) => other.name).join(', ')}
          </span>
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="saffron" onClick={onCook}>
          Cook it
        </Button>
        <Button variant="outline" onClick={onOpen}>
          Open the recipe
        </Button>
        <Button variant="ghost" icon={RotateCw} onClick={onAgain}>
          Not that
        </Button>
      </div>
    </motion.div>
  );
}

function Stat({ label, value, icon: Icon, tone = 'neutral', to }) {
  const tones = {
    neutral: 'border-line',
    brand: 'border-brand-bright/30',
    saffron: 'border-saffron-dim/35',
  };
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[0.64rem] font-bold uppercase tracking-[0.12em] text-ink-3">{label}</p>
        {Icon && <Icon size={14} className="shrink-0 text-ink-3" aria-hidden />}
      </div>
      <p className="tabular mt-1.5 font-display text-2xl font-bold leading-none text-ink">
        {value}
      </p>
    </>
  );

  const className = `block rounded-2xl border bg-surface p-3 transition-colors ${
    tones[tone] ?? tones.neutral
  } ${to ? 'hover:border-line-strong' : ''}`;

  return to ? (
    <Link to={to} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
