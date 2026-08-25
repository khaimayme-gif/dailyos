import { createContext, useContext, useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { supabase } from './supabaseClient';
import Logo from './Logo';

// Maps the two Supabase Auth accounts (one per person) to the app's
// internal personId. Set these in your .env.local / Vercel env vars to
// match the two accounts you create in Supabase Authentication → Users.
const MIKI_EMAIL = (import.meta.env.VITE_MIKI_EMAIL || '').toLowerCase();
const ALEX_EMAIL = (import.meta.env.VITE_ALEX_EMAIL || '').toLowerCase();
const PERSON_NAMES = { miki: 'Miki', alex: 'Alex' };

function personIdForEmail(email) {
  const e = (email || '').toLowerCase();
  if (MIKI_EMAIL && e === MIKI_EMAIL) return 'miki';
  if (ALEX_EMAIL && e === ALEX_EMAIL) return 'alex';
  return null;
}

const CurrentUserContext = createContext({ personId: null, personName: null, email: null });

/** Read who's currently signed in anywhere inside <LoginGate>. */
export function useCurrentUser() {
  return useContext(CurrentUserContext);
}

const FONT_IMPORT =
  "@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;1,9..144,500&family=Inter:wght@400;500;600&display=swap');";

const colors = {
  bg: '#F5F4F0',
  surface: '#FFFFFF',
  textPrimary: '#20241F',
  textSecondary: '#6C7369',
  textFaint: '#9A9F94',
  border: '#E6E2D8',
  accent: '#2F6F62',
  urgent: '#C24A3B',
  urgentSoft: '#FBEAE6',
};

function LoginForm({ onSignedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError('Incorrect email or password.');
      return;
    }
    onSignedIn();
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        width: '100%',
        background: colors.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, sans-serif',
        padding: 20,
      }}
    >
      <style>{FONT_IMPORT}</style>
      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: 360,
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: 16,
          padding: '30px 28px',
        }}
      >
        <div style={{ marginBottom: 4 }}>
          <Logo height={26} />
        </div>
        <p style={{ color: colors.textSecondary, fontSize: 13, margin: '0 0 24px' }}>
          Sign in to your household dashboard.
        </p>

        <label style={{ display: 'block', fontSize: 12, color: colors.textSecondary, marginBottom: 4 }}>
          Email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          style={inputStyle}
        />

        <label style={{ display: 'block', fontSize: 12, color: colors.textSecondary, margin: '14px 0 4px' }}>
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={inputStyle}
        />

        {error && (
          <div
            style={{
              marginTop: 12,
              background: colors.urgentSoft,
              color: colors.urgent,
              fontSize: 12.5,
              borderRadius: 8,
              padding: '8px 10px',
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: 18,
            width: '100%',
            padding: '11px 0',
            borderRadius: 9,
            border: 'none',
            background: colors.textPrimary,
            color: colors.bg,
            fontSize: 13.5,
            fontWeight: 600,
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

const inputStyle = {
  display: 'block',
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: `1px solid ${colors.border}`,
  background: colors.bg,
  color: colors.textPrimary,
  fontSize: 14,
  boxSizing: 'border-box',
  fontFamily: 'Inter, sans-serif',
};

export function SignOutButton({ style }) {
  return (
    <button
      onClick={() => supabase.auth.signOut()}
      aria-label="Sign out"
      style={{
        width: 38,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 9,
        border: `1px solid ${colors.border}`,
        background: colors.surface,
        color: colors.textSecondary,
        cursor: 'pointer',
        ...style,
      }}
    >
      <LogOut size={15} />
    </button>
  );
}

/** Wraps the app: renders children only once a Supabase session exists. */
export default function LoginGate({ children }) {
  const [session, setSession] = useState(undefined); // undefined = still checking

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: colors.bg, color: colors.textFaint, fontFamily: 'Inter, sans-serif', fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  if (!session) {
    return <LoginForm onSignedIn={() => {}} />;
  }

  const email = session.user?.email || '';
  const personId = personIdForEmail(email);

  if (!personId) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: colors.bg, fontFamily: 'Inter, sans-serif', padding: 20 }}>
        <div style={{ maxWidth: 380, textAlign: 'center' }}>
          <div style={{ color: colors.urgent, fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>
            This account isn't recognized
          </div>
          <p style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 1.6 }}>
            Signed in as {email}, but this doesn't match VITE_MIKI_EMAIL or VITE_ALEX_EMAIL in your environment variables. Update those to match this account, or sign out and use the correct one.
          </p>
          <SignOutButton style={{ width: 'auto', padding: '9px 16px', marginTop: 14 }} />
        </div>
      </div>
    );
  }

  return (
    <CurrentUserContext.Provider value={{ personId, personName: PERSON_NAMES[personId], email }}>
      {children}
    </CurrentUserContext.Provider>
  );
}
