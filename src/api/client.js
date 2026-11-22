/**
 * The one place that talks to the Cookit backend.
 *
 * Three rules the rest of the app relies on:
 *   1. Every call either resolves with parsed JSON or throws an `ApiError`
 *      carrying the backend's own `detail` string — screens render that
 *      message directly instead of inventing their own.
 *   2. A 401 triggers exactly one refresh, no matter how many requests hit it
 *      at once (see `refreshing` below), and the original requests are retried
 *      behind it. A failed refresh clears the session and notifies listeners.
 *   3. The exports come back as files, not JSON, so they go through
 *      `download()` rather than `request()`.
 */

const DEFAULT_BACKEND_BASE = 'https://cookit.krishnarajthadesar.in';
const RAW_BASE =
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? '' : DEFAULT_BACKEND_BASE);
// Same-origin in dev (Vite proxies /api); production talks directly to the
// deployed Cookit backend unless VITE_API_BASE_URL overrides it.
export const BASE_URL = RAW_BASE.replace(/\/+$/, '');
const API = `${BASE_URL}/api`;
export const GATEWAY_URL = (
  import.meta.env.VITE_API_GATEWAY_URL || 'https://api-get-away.krishnarajthadesar.in'
).replace(/\/+$/, '');
const GATEWAY_API = `${GATEWAY_URL}${import.meta.env.VITE_GATEWAY_ROUTE || '/api/cookit'}/api`;

const ACCESS_KEY = 'cookit_access_token';
const REFRESH_KEY = 'cookit_refresh_token';
const USER_KEY = 'cookit_user';
// The gateway's own session id, obtained by trading the one-time ticket it puts
// on the redirect back from Authentik. See `consumeGatewayHandoff` below.
const GATEWAY_KEY = 'cookit_gateway_session';

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/* ------------------------------------------------------------------ tokens */

const store = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode: the session lives for this tab only */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* nothing to do */
    }
  },
};

export const getAccessToken = () => store.get(ACCESS_KEY);
export const getRefreshToken = () => store.get(REFRESH_KEY);

export function getStoredUser() {
  try {
    const raw = store.get(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession({ access_token, refresh_token, user }) {
  if (access_token) store.set(ACCESS_KEY, access_token);
  if (refresh_token) store.set(REFRESH_KEY, refresh_token);
  if (user) store.set(USER_KEY, JSON.stringify(user));
  return user;
}

export function clearSession() {
  store.remove(ACCESS_KEY);
  store.remove(REFRESH_KEY);
  store.remove(USER_KEY);
  store.remove(GATEWAY_KEY);
}

export const getGatewaySession = () => store.get(GATEWAY_KEY);

export const isLoggedIn = () => Boolean(getAccessToken() && getRefreshToken());

// AuthContext subscribes so a refresh failure logs the UI out immediately
// rather than on the next render that happens to notice.
const sessionListeners = new Set();
export function onSessionLost(listener) {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}
function loseSession() {
  clearSession();
  sessionListeners.forEach((listener) => listener());
}

/* ----------------------------------------------------------------- request */

async function parse(response) {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function messageFrom(body, fallback) {
  if (!body) return fallback;
  if (typeof body === 'string') return body;
  const { detail } = body;
  if (typeof detail === 'string') return detail;
  // FastAPI validation errors arrive as a list of {loc, msg, type}.
  if (Array.isArray(detail) && detail.length) {
    return detail
      .map((item) => {
        const field = Array.isArray(item.loc) ? item.loc[item.loc.length - 1] : null;
        return field ? `${field}: ${item.msg}` : item.msg;
      })
      .join(', ');
  }
  return fallback;
}

// One in-flight refresh, shared by everything that 401s while it runs.
let refreshing = null;

async function runRefresh() {
  const refresh_token = getRefreshToken();
  if (!refresh_token) return false;

  try {
    const response = await fetch(`${API}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token }),
    });
    if (!response.ok) return false;
    const data = await parse(response);
    if (!data?.access_token) return false;
    saveSession(data);
    return true;
  } catch {
    // Network failure isn't a dead session — keep the tokens and let the
    // caller surface the outage.
    return false;
  }
}

function refreshOnce() {
  if (!refreshing) {
    refreshing = runRefresh().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

/** Send a request, refreshing once and retrying if the token has expired. */
async function send(path, { method = 'GET', body, auth = true, isForm = false } = {}) {
  const fire = async () => {
    const headers = {};
    if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) {
      const token = getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    return fetch(`${API}${path}`, {
      method,
      headers,
      body: isForm ? body : body === undefined ? undefined : JSON.stringify(body),
    });
  };

  let response;
  try {
    response = await fire();
  } catch {
    throw new ApiError('Can’t reach the kitchen. Check your connection.', 0, null);
  }

  // 403 is here because FastAPI's HTTPBearer answers a missing header with 403,
  // not 401 — without it a returning tab with an expired token never refreshes.
  if ((response.status === 401 || response.status === 403) && auth && getRefreshToken()) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      try {
        response = await fire();
      } catch {
        throw new ApiError('Can’t reach the kitchen. Check your connection.', 0, null);
      }
    } else {
      loseSession();
      throw new ApiError('Your session expired. Please sign in again.', 401, null);
    }
  }
  return response;
}

async function request(path, options = {}) {
  const response = await send(path, options);
  const payload = await parse(response);
  if (!response.ok) {
    throw new ApiError(
      messageFrom(payload, `Request failed (${response.status})`),
      response.status,
      payload
    );
  }
  return payload;
}

/**
 * Fetch a file and hand back the blob plus the name the server chose.
 *
 * The exports need an `Authorization` header, so they can't be a plain
 * `<a href>` — the browser wouldn't attach one. The blob is downloaded here and
 * saved with a temporary object URL instead. `Content-Disposition` is only
 * readable because the backend lists it in `Access-Control-Expose-Headers`.
 */
async function download(path, fallbackName) {
  const response = await send(path);
  if (!response.ok) {
    const payload = await parse(response);
    throw new ApiError(
      messageFrom(payload, `Export failed (${response.status})`),
      response.status,
      payload
    );
  }
  const disposition = response.headers.get('Content-Disposition') || '';
  const matched = /filename="([^"]+)"/.exec(disposition);
  return { blob: await response.blob(), filename: matched?.[1] || fallbackName };
}

/** Save a blob to the user's downloads. */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoked on the next tick rather than immediately: Safari cancels an
  // in-flight download if the object URL is released in the same frame.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------------------------------------------ gateway */

export function authentikLoginUrl(next = '/login?authentik=1') {
  const url = new URL(`${GATEWAY_URL}/auth/login`);
  url.searchParams.set('frontend_host', window.location.origin);
  url.searchParams.set('next', next);
  return url.toString();
}

/**
 * Trade the `gw_handoff` ticket on the current URL for the gateway session id.
 *
 * The gateway sets a session cookie on its own domain, and this app is served
 * from another one. Firefox partitions third-party cookie jars by default and
 * Safari does the same, so that cookie is never sent back on a call from here —
 * `credentials: 'include'` and `SameSite=None` change nothing, because the
 * browser isn't asking about our intent. The gateway therefore hands the
 * session over in the redirect instead, and we carry it in a header from then
 * on.
 *
 * The ticket is single-use and expires in two minutes, so it is spent and
 * scrubbed off the address bar immediately — a URL is the one place a
 * credential can end up in a bookmark or a screenshot.
 *
 * Returns true when a ticket was present and accepted.
 */
export function consumeGatewayHandoff() {
  // Exactly one exchange per page load, shared by every caller. StrictMode runs
  // mount effects twice and both landings would race: the first strips the
  // ticket off the URL, the second finds nothing and carries on without a
  // session. A page load only ever arrives with one ticket, so this is never
  // reset — a fresh ticket means a fresh navigation and a fresh module.
  if (!handoffExchange) handoffExchange = runHandoffExchange();
  return handoffExchange;
}

let handoffExchange = null;

async function runHandoffExchange() {
  const url = new URL(window.location.href);
  const handoff = url.searchParams.get('gw_handoff');
  if (!handoff) return false;

  url.searchParams.delete('gw_handoff');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);

  try {
    const response = await fetch(`${GATEWAY_URL}/auth/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handoff }),
      credentials: 'include',
    });
    if (!response.ok) return false;
    const data = await parse(response);
    if (!data?.session) return false;
    store.set(GATEWAY_KEY, data.session);
    return true;
  } catch {
    return false;
  }
}

async function gatewayRequest(path, { method = 'GET', auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && getAccessToken()) headers.Authorization = `Bearer ${getAccessToken()}`;
  // Belt (header) and braces (cookie): the header is what works cross-site, the
  // cookie is what works if this app is ever served from the gateway's domain.
  const gatewaySession = getGatewaySession();
  if (gatewaySession) headers['X-Gateway-Session'] = gatewaySession;
  let response;
  try {
    response = await fetch(`${GATEWAY_API}${path}`, { method, headers, credentials: 'include' });
  } catch {
    throw new ApiError('Can’t reach API Get Away.', 0, null);
  }
  const payload = await parse(response);
  if (response.status === 401) {
    // The gateway session is spent, so the stored id is only noise now.
    store.remove(GATEWAY_KEY);
    throw new ApiError('That Authentik sign-in has expired. Try signing in again.', 401, payload);
  }
  if (!response.ok)
    throw new ApiError(
      messageFrom(payload, 'Authentik request failed'),
      response.status,
      payload
    );
  return payload;
}

/* ---------------------------------------------------------------- helpers */

/** Turn a filter object into a query string, dropping anything empty.
 *  Array values repeat the key, which is what FastAPI's `Query(default=[])`
 *  expects — `?meal_type=lunch&meal_type=dinner`. */
function qs(params) {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '' || value === false) return;
    if (Array.isArray(value)) {
      value.forEach((item) => item && search.append(key, item));
    } else {
      search.append(key, String(value));
    }
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

/* -------------------------------------------------------------------- api */

export const api = {
  health: () =>
    fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(6000) })
      .then((r) => r.ok)
      .catch(() => false),

  /* --------------------------------------------------------------- auth */

  register: async ({ username, password, display_name }) =>
    saveSession(
      await request('/auth/register', {
        method: 'POST',
        auth: false,
        body: { username, password, display_name },
      })
    ),

  login: async ({ username, password }) =>
    saveSession(
      await request('/auth/login', { method: 'POST', auth: false, body: { username, password } })
    ),

  loginWithAuthentik: async () =>
    saveSession(await gatewayRequest('/auth/authentik/session', { method: 'POST' })),
  authentikStatus: () => request('/auth/authentik'),
  linkAuthentik: () => gatewayRequest('/auth/authentik/link', { method: 'POST', auth: true }),
  unlinkAuthentik: () => request('/auth/authentik', { method: 'DELETE' }),

  logout: async () => {
    const refresh_token = getRefreshToken();
    if (refresh_token) {
      // Best effort: a dead backend must not trap someone in a signed-in shell.
      await request('/auth/logout', {
        method: 'POST',
        auth: false,
        body: { refresh_token },
      }).catch(() => null);
    }
    clearSession();
  },

  me: () => request('/auth/me'),
  updateProfile: async (display_name) => {
    const user = await request('/auth/me', { method: 'PATCH', body: { display_name } });
    saveSession({ user });
    return user;
  },
  changePassword: (current_password, new_password) =>
    request('/auth/password', { method: 'POST', body: { current_password, new_password } }),

  /* -------------------------------------------------------- ingredients */

  ingredients: (params) => request(`/ingredients${qs(params)}`),
  ingredientCategories: () => request('/ingredients/categories'),
  /** Catalogue chips for one-tap adding, minus what's already on the shelf. */
  ingredientSuggestions: () => request('/ingredients/suggestions'),
  addIngredient: (payload) => request('/ingredients', { method: 'POST', body: payload }),
  /** A pasted blob or a list. Duplicates come back as `already_there`, not an error. */
  addIngredients: (text) => request('/ingredients/bulk', { method: 'POST', body: { text } }),
  updateIngredient: (uuid, payload) =>
    request(`/ingredients/${uuid}`, { method: 'PATCH', body: payload }),
  deleteIngredient: (uuid) => request(`/ingredients/${uuid}`, { method: 'DELETE' }),

  /* ------------------------------------------------------------- dishes */

  dishes: (params) => request(`/dishes${qs(params)}`),
  dish: (uuid) => request(`/dishes/${uuid}`),
  createDish: (payload) => request('/dishes', { method: 'POST', body: payload }),
  importMarkdown: (file) => {
    const form = new FormData();
    form.append('file', file);
    return request('/dishes/import.md', { method: 'POST', body: form, isForm: true });
  },
  updateDish: (uuid, payload) => request(`/dishes/${uuid}`, { method: 'PATCH', body: payload }),
  deleteDish: (uuid) => request(`/dishes/${uuid}`, { method: 'DELETE' }),

  /** Replace the ingredient list wholesale — order included. */
  setDishIngredients: (uuid, ingredients) =>
    request(`/dishes/${uuid}/ingredients`, { method: 'PUT', body: { ingredients } }),
  /**
   * Replace the whole recipe. Anything `@`-mentioned joins the ingredient list.
   *
   * Each step should carry its `step_uuid` where it has one: that is what tells
   * the backend "this is the same step, edited" and keeps the step's photos
   * attached across a reword or a reorder. A step without one is new.
   */
  setSteps: (uuid, steps) => request(`/dishes/${uuid}/steps`, { method: 'PUT', body: { steps } }),

  addPairing: (uuid, body) => request(`/dishes/${uuid}/pairings`, { method: 'POST', body }),
  removePairing: (uuid, otherUuid) =>
    request(`/dishes/${uuid}/pairings/${otherUuid}`, { method: 'DELETE' }),

  cookDish: (uuid, body) => request(`/dishes/${uuid}/cook`, { method: 'POST', body: body || {} }),
  dishCooks: (uuid) => request(`/dishes/${uuid}/cooks`),

  /* ------------------------------------------------------------ exports */

  exportMarkdown: (uuid, name) => download(`/dishes/${uuid}/export.md`, `${name || 'dish'}.md`),
  exportPdf: (uuid, name) => download(`/dishes/${uuid}/export.pdf`, `${name || 'dish'}.pdf`),
  /** recipe.md plus an images/ folder — the markdown that keeps its photos. */
  exportZip: (uuid, name) => download(`/dishes/${uuid}/export.zip`, `${name || 'dish'}.zip`),

  /* ------------------------------------------------------------- photos */

  uploadDishImage: (dishUuid, file) => {
    const form = new FormData();
    form.append('file', file);
    return request(`/dishes/${dishUuid}/images`, { method: 'POST', body: form, isForm: true });
  },
  /** A photo of one step. A step takes any number; the first is not a cover. */
  uploadStepImage: (stepUuid, file) => {
    const form = new FormData();
    form.append('file', file);
    return request(`/steps/${stepUuid}/images`, { method: 'POST', body: form, isForm: true });
  },
  dishImages: (dishUuid) => request(`/dishes/${dishUuid}/images`),
  stepImages: (stepUuid) => request(`/steps/${stepUuid}/images`),
  imageUrl: (imageUuid) => request(`/images/${imageUuid}/url`),
  updateImage: (imageUuid, payload) =>
    request(`/images/${imageUuid}`, { method: 'PATCH', body: payload }),
  deleteImage: (imageUuid) => request(`/images/${imageUuid}`, { method: 'DELETE' }),

  /* --------------------------------------------------------- randomizer */

  /** Spin. An empty body means "anything". */
  spin: (payload) => request('/randomizer/spin', { method: 'POST', body: payload || {} }),

  /* ---------------------------------------------------- stats, settings */

  dashboard: () => request('/stats/dashboard'),
  settings: () => request('/settings'),
  updateSettings: (payload) => request('/settings', { method: 'PUT', body: payload }),
};

export default api;
