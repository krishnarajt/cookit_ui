import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * "A new version is ready" — and nothing else.
 *
 * The service worker is registered in `prompt` mode rather than `autoUpdate`,
 * so a new build waits in the wings instead of reloading the page under
 * whoever is mid-sentence. This is the only thing that knows how to let it in.
 *
 * Deliberately styled with stock utilities rather than this app's design
 * tokens: it has to render correctly on the very first paint after an update,
 * which is exactly when a half-loaded stylesheet is most likely.
 */
export default function PwaUpdate() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // A worker that won't register costs offline support and nothing else, so
    // it must never become an error the user has to do something about.
    onRegisterError: (error) => console.warn('Service worker failed', error),
  });

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-3 z-[9999] mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-white/15 bg-neutral-900/95 p-3 text-white shadow-2xl backdrop-blur sm:inset-x-auto sm:right-4 sm:bottom-4"
    >
      <p className="min-w-0 flex-1 text-sm leading-snug">
        <span className="font-semibold">A new version is ready.</span>{' '}
        <span className="text-white/60">Reloading loses anything unsaved.</span>
      </p>
      <button
        type="button"
        onClick={() => updateServiceWorker(true)}
        className="shrink-0 rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-neutral-900 hover:bg-white/90"
      >
        Reload
      </button>
      <button
        type="button"
        onClick={() => setNeedRefresh(false)}
        aria-label="Dismiss"
        className="shrink-0 rounded-lg px-1.5 py-1 text-white/50 hover:text-white"
      >
        ✕
      </button>
    </div>
  );
}
