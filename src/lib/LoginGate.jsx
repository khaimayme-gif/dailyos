import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { supabase } from './supabaseClient';

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
        <div
          style={{
            fontFamily: 'Fraunces, serif',
            fontStyle: 'italic',
            fontWeight: 500,
            fontSize: 26,
            color: colors.textPrimary,
            marginBottom: 4,
          }}
        >
          DailyOS
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

  return children;
}
