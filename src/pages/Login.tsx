import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, EyeOff } from 'lucide-react';
import LanguageSwitcher from '@/components/shared/LanguageSwitcher';

const DEPARTMENTS = [
  { value: 'management', label: 'Management' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'pizza', label: 'Pizza' },
  { value: 'service', label: 'Service' },
  { value: 'bar', label: 'Bar' },
  { value: 'office', label: 'Office' },
] as const;

export default function Login() {
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form fields
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, navigate]);

  const resetForm = () => {
    setError('');
    setSuccess('');
    setEmail('');
    setUsername('');
    setPassword('');
  };

  const GENERIC_ERROR = 'Username or password is incorrect.';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const u = username.trim().toLowerCase();
      if (!u || !password) {
        setError(GENERIC_ERROR);
        return;
      }
      // Resolve username → email via edge function (uses service role to bypass RLS).
      const { data, error: lookupErr } = await supabase.functions.invoke('lookup-username-email', {
        body: { username: u },
      });
      if (lookupErr || !data?.ok || !data?.email) {
        setError(GENERIC_ERROR);
        return;
      }
      const { error: err } = await supabase.auth.signInWithPassword({
        email: (data.email as string).trim(),
        password,
      });
      if (err) {
        setError(GENERIC_ERROR);
        return;
      }
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  };

  const handleRecoveryLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const trimmedEmail = email.trim();
      if (!trimmedEmail || !password) {
        setError(GENERIC_ERROR);
        return;
      }
      const { data: signInData, error: err } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (err || !signInData?.user) {
        setError(GENERIC_ERROR);
        return;
      }
      // Verify Administrator role; otherwise sign out + block.
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', signInData.user.id);
      const isAdmin = (roles || []).some((r: { role: string }) => r.role === 'administrator');
      if (!isAdmin) {
        await supabase.auth.signOut();
        setError('Recovery login is only available for Administrator.');
        return;
      }
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  };

  if (isAuthenticated) return null;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 bg-nav">
      <div className="w-full max-w-md space-y-8">
        {/* Language switch */}
        <div className="flex justify-end">
          <LanguageSwitcher />
        </div>

        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-heading font-bold text-primary-foreground">LCMG Management System</h1>
          <p className="mt-2 text-nav-muted text-sm">{t('common.appTagline')}</p>
        </div>

        {/* Card */}
        <div className="rounded-xl bg-card p-6 shadow-lg space-y-5">
          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}
          {success && (
            <div className="rounded-lg bg-success/10 p-3 text-sm" style={{ color: 'var(--success)' }}>{success}</div>
          )}

          {recoveryMode ? (
              <form onSubmit={handleRecoveryLogin} className="space-y-4">
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-800 dark:text-amber-200">
                  Admin recovery login — Administrator accounts only.
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recovery-email">Email</Label>
                  <Input id="recovery-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@example.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recovery-password">Password</Label>
                  <div className="relative">
                    <Input id="recovery-password" type={showPassword ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="pr-10" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? t('login.loggingIn') : 'Login'}
                </Button>
                <button
                  type="button"
                  onClick={() => { setRecoveryMode(false); resetForm(); }}
                  className="block w-full text-center text-xs text-muted-foreground hover:text-foreground underline"
                >
                  Back to username login
                </button>
              </form>
          ) : (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-username">Username</Label>
                  <Input
                    id="login-username"
                    type="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="username"
                    spellCheck={false}
                    required
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <div className="relative">
                    <Input id="login-password" type={showPassword ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="pr-10" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? t('login.loggingIn') : 'Login'}
                </Button>
                <button
                  type="button"
                  onClick={() => { setRecoveryMode(true); setError(''); setPassword(''); }}
                  className="block w-full text-center text-xs text-muted-foreground/70 hover:text-foreground underline"
                >
                  Admin recovery login
                </button>
              </form>
          )}
        </div>
      </div>
    </div>
  );
}
