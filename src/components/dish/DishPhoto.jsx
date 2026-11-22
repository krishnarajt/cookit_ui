import { useEffect, useState } from 'react';
import { ImageOff, UtensilsCrossed } from 'lucide-react';
import api from '../../api/client';

/**
 * A dish photo, fetched behind a presigned URL.
 *
 * Photos live in MinIO and need a round trip before they can be shown, so
 * there is always a placeholder first. Storage being down is not an error state
 * worth shouting about — the placeholder just stays.
 *
 * The URLs are cached for the page's lifetime in a module-level map: the same
 * cover appears on a card, in the wheel result and at the top of the detail
 * screen, and asking the backend three times for the same signature is waste.
 */
const cache = new Map();

function urlFor(imageUuid) {
  if (!cache.has(imageUuid)) {
    cache.set(
      imageUuid,
      api
        .imageUrl(imageUuid)
        .then((result) => result?.url ?? null)
        .catch(() => {
          // Don't cache a failure — storage coming back should fix it on the
          // next render rather than needing a reload.
          cache.delete(imageUuid);
          return null;
        })
    );
  }
  return cache.get(imageUuid);
}

/** Drop a photo from the cache, so a re-upload isn't served the stale URL. */
export function forgetPhoto(imageUuid) {
  cache.delete(imageUuid);
}

/**
 * The presigned URL for one photo, resolved once and shared.
 *
 * Split out of the component because the lightbox needs the same URL with a
 * completely different `<img>` around it — `object-contain` on a black field
 * rather than `object-cover` in a tile — and duplicating the fetch there would
 * mean two components racing for the same signature.
 *
 * Returns `[url, failed]`. `forget` puts the photo back in the queue after an
 * expiry, which is why it is handed back rather than kept private.
 */
export function usePhotoUrl(imageUuid) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    if (!imageUuid) return undefined;
    urlFor(imageUuid).then((result) => {
      if (cancelled) return;
      if (result) setUrl(result);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [imageUuid]);

  const expired = () => {
    forgetPhoto(imageUuid);
    setUrl(null);
    setFailed(true);
  };

  return [url, failed, expired];
}

export function DishPhoto({
  imageUuid,
  alt = '',
  className = '',
  rounded = 'rounded-xl',
  icon: Icon = UtensilsCrossed,
}) {
  const [url, failed, expired] = usePhotoUrl(imageUuid);

  if (url) {
    return (
      <img
        src={url}
        alt={alt}
        loading="lazy"
        // A presigned URL that has expired since it was cached.
        onError={expired}
        className={`h-full w-full object-cover ${rounded} ${className}`}
      />
    );
  }

  return (
    <span
      className={`grid h-full w-full place-items-center bg-surface-2 text-ink-3 ${rounded} ${className}`}
      aria-hidden
    >
      {imageUuid && !failed ? (
        <span className="shimmer h-full w-full" />
      ) : failed ? (
        <ImageOff size={20} />
      ) : (
        <Icon size={22} />
      )}
    </span>
  );
}

export default DishPhoto;
