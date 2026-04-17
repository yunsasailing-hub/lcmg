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
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('');
  const [position, setPosition] = useState('');

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, navigate]);

  const resetForm = () => {
    setError('');
    setSuccess('');
    setEmail('');
    setPassword('');
    setFullName('');
    setPhone('');
    setDepartment('');
    setPosition('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err) throw err;
    } catch (err: any) {
      setError(err.message || t('login.loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim() || undefined,
            phone: phone.trim() || undefined,
            department: department || undefined,
            position: position.trim() || undefined,
          },
        },
      });
      if (err) throw err;
      setSuccess(t('login.confirmEmail'));
    } catch (err: any) {
      setError(err.message || t('login.signupFailed'));
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
          <h1 className="text-4xl font-heading font-bold text-primary-foreground">{t('common.appName')}</h1>
          <p className="mt-2 text-nav-muted text-sm">{t('common.appTagline')}</p>
        </div>

        {/* Card */}
        <div className="rounded-xl bg-card p-6 shadow-lg space-y-5">
          {/* Toggle */}
          <div className="flex rounded-lg bg-secondary p-1">
            <button
              type="button"
              onClick={() => { setMode('login'); resetForm(); }}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                mode === 'login' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('login.logIn')}
            </button>
            <button
              type="button"
              onClick={() => { setMode('signup'); resetForm(); }}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                mode === 'signup' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('login.signUp')}
            </button>
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}
          {success && (
            <div className="rounded-lg bg-success/10 p-3 text-sm" style={{ color: 'var(--success)' }}>{success}</div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">{t('login.email')}</Label>
                <Input id="login-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">{t('login.password')}</Label>
                <div className="relative">
                  <Input id="login-password" type={showPassword ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="pr-10" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t('login.loggingIn') : t('login.logIn')}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-name">{t('login.fullName')}</Label>
                <Input id="signup-name" type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="John Doe" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="signup-phone">{t('login.phone')}</Label>
                  <Input id="signup-phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+34..." />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-dept">{t('login.department')}</Label>
                  <Select value={department} onValueChange={setDepartment}>
                    <SelectTrigger id="signup-dept"><SelectValue placeholder={t('login.selectPlaceholder')} /></SelectTrigger>
                    <SelectContent>
                      {DEPARTMENTS.map(d => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-position">{t('login.position')}</Label>
                <Input id="signup-position" type="text" value={position} onChange={e => setPosition(e.target.value)} placeholder={t('login.positionPlaceholder')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-email">{t('login.email')}</Label>
                <Input id="signup-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password">{t('login.password')}</Label>
                <div className="relative">
                  <Input id="signup-password" type={showPassword ? 'text' : 'password'} required minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder={t('login.passwordPlaceholder')} className="pr-10" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t('login.creatingAccount') : t('login.signUp')}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
