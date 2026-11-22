import { useCallback, useState } from 'react';
import { KeyRound, Link2, LogOut, Moon, Sun, Unlink, UserRound } from 'lucide-react';
import api, { authentikLoginUrl } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import useQuery from '../hooks/useQuery';
import Button from '../components/ui/Button';
import Card, { SectionTitle } from '../components/ui/Card';
import { TextField } from '../components/ui/Field';
import { Page } from '../components/ui/Motion';
import { initials } from '../lib/format';

/**
 * You, your preferences, and how you sign in.
 *
 * The Authentik section is the one part worth reading. Linking never creates or
 * replaces an account: you sign in with your password first, and linking adds an
 * identity row to the account you are already in. That is what makes it safe to
 * offer at all.
 */
export default function Profile() {
  const { user, setUser, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const settings = useQuery(useCallback(() => api.settings(), []));
  const authentik = useQuery(useCallback(() => api.authentikStatus(), []));

  return (
    <Page className="space-y-5 py-2">
      <header className="flex items-center gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand/20 font-display text-lg font-bold uppercase text-brand-glow">
          {initials(user?.display_name || user?.username)}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-2xl leading-tight">{user?.display_name}</h1>
          <p className="truncate text-sm text-ink-3">@{user?.username}</p>
        </div>
      </header>

      <ProfileCard user={user} onSaved={setUser} />
      <PreferencesCard settings={settings} theme={theme} toggleTheme={toggleTheme} />
      <PasswordCard />
      <AuthentikCard status={authentik} onChanged={authentik.reload} />

      <Card className="p-4">
        <Button variant="danger" icon={LogOut} onClick={logout}>
          Sign out
        </Button>
      </Card>
    </Page>
  );
}

function ProfileCard({ user, onSaved }) {
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const updated = await api.updateProfile(displayName.trim());
      onSaved(updated);
      toast('Saved.', 'success');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-4 p-4">
      <SectionTitle icon={UserRound}>Profile</SectionTitle>
      <TextField
        label="Display name"
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
      />
      <Button
        loading={busy}
        onClick={save}
        disabled={!displayName.trim() || displayName.trim() === user?.display_name}
      >
        Save
      </Button>
    </Card>
  );
}

function PreferencesCard({ settings, theme, toggleTheme }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const data = settings.data;

  const update = async (patch) => {
    setBusy(true);
    try {
      await api.updateSettings(patch);
      settings.reload();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-4 p-4">
      <SectionTitle>Preferences</SectionTitle>

      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-ink">Theme</p>
          <p className="text-xs text-ink-3">
            {theme === 'dark' ? 'Warm charcoal' : 'Unbleached paper'}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          icon={theme === 'dark' ? Sun : Moon}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? 'Light' : 'Dark'}
        </Button>
      </div>

      <div className="hairline" />

      <div>
        <p className="text-sm font-semibold text-ink">Don&apos;t suggest what I just ate</p>
        <p className="mt-0.5 text-xs text-ink-3">
          The wheel skips anything cooked in the last few days. It ignores this rather than come
          back empty-handed, so a short book still gets an answer.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[0, 1, 2, 3, 7].map((days) => (
            <button
              key={days}
              type="button"
              disabled={busy}
              onClick={() => update({ avoid_recent_days: days })}
              aria-pressed={data?.avoid_recent_days === days}
              className={`h-9 rounded-full border px-3.5 text-[0.8125rem] font-semibold transition-colors ${
                data?.avoid_recent_days === days
                  ? 'border-saffron-dim bg-saffron text-saffron-ink'
                  : 'border-line bg-surface-2/70 text-ink-2 hover:border-line-strong hover:text-ink'
              }`}
              style={
                data?.avoid_recent_days === days ? { color: 'var(--accent-ink)' } : undefined
              }
            >
              {days === 0 ? 'Off' : days === 1 ? '1 day' : `${days} days`}
            </button>
          ))}
        </div>
      </div>

      <div className="hairline" />

      <TextField
        label="Default servings"
        hint="pre-filled on a new dish"
        type="number"
        inputMode="numeric"
        min="1"
        max="99"
        defaultValue={data?.default_servings ?? 2}
        onBlur={(event) => {
          const value = Number(event.target.value);
          if (value >= 1 && value <= 99 && value !== data?.default_servings) {
            update({ default_servings: value });
          }
        }}
      />
    </Card>
  );
}

function PasswordCard() {
  const { toast } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await api.changePassword(current, next);
      setCurrent('');
      setNext('');
      // Every session is revoked server-side, so this one is dead too. Saying
      // so is better than the next request silently bouncing to the login page.
      toast('Password changed. You will need to sign in again.', 'success');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card as="form" onSubmit={submit} className="space-y-4 p-4">
      <SectionTitle icon={KeyRound}>Password</SectionTitle>
      <TextField
        label="Current password"
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={(event) => setCurrent(event.target.value)}
      />
      <TextField
        label="New password"
        type="password"
        autoComplete="new-password"
        value={next}
        onChange={(event) => setNext(event.target.value)}
      />
      <Button type="submit" loading={busy} disabled={!current || !next}>
        Change password
      </Button>
    </Card>
  );
}

function AuthentikCard({ status, onChanged }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const linked = status.data?.linked;

  const link = async () => {
    setBusy(true);
    try {
      await api.linkAuthentik();
      toast('Authentik linked.', 'success');
      onChanged();
    } catch (error) {
      // Not signed in to the gateway yet, so send them through it. The return
      // trip lands back here with a session in hand.
      if (error.status === 401) {
        window.location.href = authentikLoginUrl('/profile?authentik=1');
        return;
      }
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    setBusy(true);
    try {
      await api.unlinkAuthentik();
      toast('Authentik unlinked.', 'info');
      onChanged();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3 p-4">
      <SectionTitle icon={Link2}>Sign-in methods</SectionTitle>

      <p className="text-sm text-ink-2">
        Your username and password always work. Authentik is an extra way in, and linking it
        changes nothing else about this account.
      </p>

      {status.loading && !status.data ? (
        <p className="text-sm text-ink-3">Checking...</p>
      ) : linked ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-good/30 bg-good/5 p-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-good">Authentik linked</p>
            {(status.data.name || status.data.email) && (
              <p className="truncate text-xs text-ink-3">
                {status.data.name}
                {status.data.name && status.data.email && ' - '}
                {status.data.email}
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" icon={Unlink} loading={busy} onClick={unlink}>
            Unlink
          </Button>
        </div>
      ) : (
        <Button variant="outline" icon={Link2} loading={busy} onClick={link}>
          Link Authentik
        </Button>
      )}
    </Card>
  );
}
