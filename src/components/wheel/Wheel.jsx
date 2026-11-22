import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { SLICE_INK, sliceColors } from '../../lib/palette';
import { useReducedMotion } from '../../hooks/useMediaQuery';

const rad = (degrees) => (degrees * Math.PI) / 180;

/** How long the wheel takes to settle, and how many turns it takes doing it. */
const SPIN_SECONDS = 3.4;
const MIN_TURNS = 4;
const MAX_TURNS = 6;

// Label geometry, in viewBox units where the wheel radius is 50.
//
// Labels run inwards from the rim along the radius, so the room a name has is
// the gap between the rim and the hub -- not the width of its slice. The hub is
// `radius * 0.72` across, which is 0.36 of the radius; LABEL_INNER leaves a
// little clearance on top of that.
const LABEL_OUTER = 0.94;
const LABEL_INNER = 0.42;
// Helvetica-ish average advance width as a fraction of font size. Only has to
// be close: it decides when a name shrinks, and being slightly pessimistic
// costs a point of size rather than a clipped word.
const CHAR_WIDTH = 0.55;
// Below this a slice label is decoration rather than information, so names are
// truncated instead of shrunk any further.
const MIN_FONT = 2.7;

/** Font size and text for one slice label, fitted to the radial room it has. */
function fitLabel(name, base, room) {
  const wanted = room / (Math.max(1, name.length) * CHAR_WIDTH);
  if (wanted >= base) return { text: name, fontSize: base };
  if (wanted >= MIN_FONT) return { text: name, fontSize: wanted };
  return {
    text: truncate(name, Math.floor(room / (MIN_FONT * CHAR_WIDTH))),
    fontSize: MIN_FONT,
  };
}

/**
 * A prize wheel.
 *
 * The mechanics worth knowing, because they are the whole illusion:
 *
 * The winner is chosen by the *backend* before the wheel moves — it comes back
 * from `POST /randomizer/spin` along with the slices to draw. The wheel then
 * rotates to land on it. So this is an animation of a decision already made,
 * not a random draw of its own, which is what lets the weighting live in one
 * place and be testable.
 *
 * Landing is arithmetic, not luck. Slice `i` sits at `mid` degrees clockwise
 * from twelve o'clock, so the wheel has to finish at a rotation congruent to
 * `-mid` (mod 360) for that slice to be under the pointer. A few whole turns
 * are added on top, and the final resting angle is jittered within the slice so
 * it doesn't stop dead centre every time — a wheel that always lands on the
 * exact middle of a segment stops looking like a wheel.
 *
 * Rotation accumulates rather than resetting: framer-motion animates from the
 * current value, and snapping back to 0 between spins would unwind the whole
 * wheel backwards on screen.
 */
export function Wheel({
  slices = [],
  winnerUuid,
  spinning = false,
  onSettled,
  size = 320,
  disabled = false,
  onSpin,
  children,
}) {
  const reduced = useReducedMotion();
  const controls = useAnimationControls();
  const rotation = useRef(0);
  const [pulseAt, setPulseAt] = useState(null);

  const count = slices.length;
  const step = count ? 360 / count : 360;
  const colors = useMemo(() => sliceColors(count), [count]);

  const radius = size / 2;
  // Everything inside is drawn in a -50..50 viewBox, so the geometry doesn't
  // have to know the pixel size and the wheel scales cleanly on a phone.
  const R = 50;

  const geometry = useMemo(
    () =>
      slices.map((dish, index) => {
        const start = index * step;
        const end = start + step;
        const mid = start + step / 2;

        // Zero degrees is twelve o'clock, angles run clockwise: x = sin, y = -cos.
        const point = (angle, r = R) => [
          (r * Math.sin(rad(angle))).toFixed(3),
          (-r * Math.cos(rad(angle))).toFixed(3),
        ];
        const [x1, y1] = point(start);
        const [x2, y2] = point(end);
        // largeArc matters the moment a wheel has two slices or fewer.
        const largeArc = step > 180 ? 1 : 0;
        const path =
          count === 1
            ? // A single slice is the whole disc; an arc from a point to itself
              // draws nothing, so draw a circle instead.
              `M 0 ${-R} A ${R} ${R} 0 1 1 0 ${R} A ${R} ${R} 0 1 1 0 ${-R} Z`
            : `M 0 0 L ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} Z`;

        // Labels run along the radius. Past the bottom of the wheel that would
        // read upside down, so those flip and anchor from the rim outwards
        // instead.
        const flip = mid > 180;
        const [lx, ly] = point(mid, R * LABEL_OUTER);
        const fitted = fitLabel(
          dish.name,
          count > 9 ? 3.5 : 4.2,
          (LABEL_OUTER - LABEL_INNER) * R
        );
        return {
          dish,
          path,
          fill: colors[index],
          mid,
          label: {
            x: lx,
            y: ly,
            rotate: flip ? mid + 90 : mid - 90,
            anchor: flip ? 'start' : 'end',
            ...fitted,
          },
        };
      }),
    [slices, step, count, colors, R]
  );

  const winnerIndex = useMemo(
    () => geometry.findIndex((entry) => entry.dish.dish_uuid === winnerUuid),
    [geometry, winnerUuid]
  );

  const settle = useCallback(() => {
    setPulseAt(Date.now());
    onSettled?.();
  }, [onSettled]);

  useEffect(() => {
    if (!spinning || winnerIndex < 0 || !count) return;

    const mid = geometry[winnerIndex].mid;
    // Stay clear of the seams: a label straddling the pointer looks like the
    // wheel stopped between two answers.
    const jitter = (Math.random() - 0.5) * step * 0.64;
    const target = -(mid + jitter);

    const current = rotation.current;
    const turns = MIN_TURNS + Math.floor(Math.random() * (MAX_TURNS - MIN_TURNS + 1));
    // Modulo twice: JS `%` keeps the sign of the dividend, so a negative
    // remainder would spin the wheel backwards.
    const delta = (((target - current) % 360) + 360) % 360;
    const next = current + turns * 360 + delta;
    rotation.current = next;

    if (reduced) {
      controls.set({ rotate: next });
      settle();
      return;
    }

    controls
      .start({
        rotate: next,
        transition: {
          duration: SPIN_SECONDS,
          // A long, flat tail: fast off the mark, then a slow creep into place.
          // A spring would overshoot and bounce back past the answer, which
          // reads as the wheel changing its mind.
          ease: [0.12, 0.74, 0.04, 1],
        },
      })
      .then(settle)
      // An interrupted animation (a second spin, or an unmount) rejects. That
      // is not an error and must not settle the previous result.
      .catch(() => {});
  }, [spinning, winnerIndex, geometry, step, count, controls, reduced, settle]);

  return (
    <div className="relative mx-auto grid place-items-center" style={{ width: size, height: size }}>
      {/* The pointer. Outside the rotating group, obviously — it is the thing
          the wheel moves relative to. */}
      <div
        className="absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-1"
        aria-hidden
      >
        <motion.svg
          width="26"
          height="22"
          viewBox="0 0 26 22"
          animate={pulseAt ? { y: [0, -4, 0], scale: [1, 1.15, 1] } : {}}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          key={pulseAt}
        >
          <path
            d="M13 21 L2 3 A 2 2 0 0 1 4 0 L22 0 A 2 2 0 0 1 24 3 Z"
            fill="var(--brand)"
            stroke="var(--brand-glow)"
            strokeWidth="1.5"
          />
        </motion.svg>
      </div>

      <motion.div
        animate={controls}
        style={{ width: size, height: size }}
        className="relative rounded-full"
      >
        <svg
          viewBox="-52 -52 104 104"
          width={size}
          height={size}
          role="img"
          aria-label={
            count
              ? `A wheel of ${count} dishes: ${slices.map((d) => d.name).join(', ')}`
              : 'An empty wheel'
          }
        >
          <defs>
            {/* A soft radial shade so the disc reads as an object with a lip,
                rather than a flat pie chart. */}
            <radialGradient id="wheel-shade" cx="50%" cy="35%" r="75%">
              <stop offset="60%" stopColor="#000" stopOpacity="0" />
              <stop offset="100%" stopColor="#000" stopOpacity="0.3" />
            </radialGradient>
          </defs>

          {geometry.map((entry, index) => (
            <g key={entry.dish.dish_uuid ?? index}>
              <path d={entry.path} fill={entry.fill} stroke="rgba(0,0,0,0.22)" strokeWidth="0.4" />
              {count <= 14 && (
                <text
                  x={entry.label.x}
                  y={entry.label.y}
                  transform={`rotate(${entry.label.rotate}, ${entry.label.x}, ${entry.label.y})`}
                  textAnchor={entry.label.anchor}
                  dominantBaseline="middle"
                  fill={SLICE_INK}
                  fontSize={entry.label.fontSize}
                  fontWeight="700"
                  style={{ letterSpacing: '0.01em' }}
                >
                  {entry.label.text}
                </text>
              )}
            </g>
          ))}

          {count === 0 && (
            <circle r={R} fill="var(--surface-2)" stroke="var(--border)" strokeWidth="0.6" />
          )}

          <circle r={R} fill="url(#wheel-shade)" pointerEvents="none" />
          <circle
            r={R}
            fill="none"
            stroke="var(--accent-mark)"
            strokeWidth="1.1"
            pointerEvents="none"
          />
        </svg>
      </motion.div>

      {/* The hub, and the button. Centred over the wheel, outside the rotating
          group so the label doesn't tumble with it. */}
      <div className="absolute inset-0 grid place-items-center">
        <button
          type="button"
          onClick={onSpin}
          disabled={disabled || spinning}
          aria-label={spinning ? 'Spinning' : 'Spin the wheel'}
          className="group relative grid place-items-center rounded-full border-4 border-bg bg-bg-elev text-center shadow-[var(--shadow-soft)] transition-transform duration-200 enabled:hover:scale-105 enabled:active:scale-95 disabled:cursor-not-allowed"
          style={{ width: radius * 0.72, height: radius * 0.72 }}
        >
          <span className="absolute inset-1 rounded-full border border-line" aria-hidden />
          {children}
        </button>
      </div>
    </div>
  );
}

function truncate(text = '', max = 20) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export default Wheel;
