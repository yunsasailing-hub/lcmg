import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, EyeOff, Globe } from 'lucide-react';
import { useEffect } from 'react';

const DEPT_KEYS = ['management', 'kitchen', 'pizza', 'service', 'bar', 'office'] as const;

export default function Login() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
    setError(''); setSuccess(''); setEmail(''); setPassword('');
    setFullName(''); setPhone(''); setDepartment(''); setPosition('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err) throw err;
    } catch (err: any) { setError(err.message || 'Login failed'); }
    finally { setLoading(false); }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const { error: err } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: { data: {
          full_name: fullName.trim() || undefined, phone: phone.trim() || undefined,
          department: department || undefined, position: position.trim() || undefined,
        }},
      });
      if (err) throw err;
      setSuccess(t('login.checkEmail'));
    } catch (err: any) { setError(err.message || 'Signup failed'); }
    finally { setLoading(false); }
  };

  if (isAuthenticated) return null;

  const isVi = i18n.language === 'vi';

  return (
    <div className="flex min-h-screen items-center justify-center px-4 bg-nav">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center relative">
          <button
            onClick={() => i18n.changeLanguage(isVi ? 'en' : 'vi')}
            className="absolute right-0 top-0 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-white/10"
            style={{ color: 'var(--nav-foreground)' }}
          >
            <Globe className="h-3.5 w-3.5" />
            {isVi ? 'EN' : 'VI'}
          </button>
          <h1 className="text-4xl font-heading font-bold text-primary-foreground">{t('login.title')}</h1>
          <p className="mt-2 text-nav-muted text-sm">{t('login.subtitle')}</p>
        </div>

        <div className="rounded-xl bg-card p-6 shadow-lg space-y-5">
          <div className="flex rounded-lg bg-secondary p-1">
            <button type="button" onClick={() => { setMode('login'); resetForm(); }}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${mode === 'login' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {t('login.logIn')}
            </button>
            <button type="button" onClick={() => { setMode('signup'); resetForm(); }}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${mode === 'signup' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {t('login.signUp')}
            </button>
          </div>

          {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          {success && <div className="rounded-lg bg-success/10 p-3 text-sm" style={{ color: 'var(--success)' }}>{success}</div>}

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">{t('login.email')}</Label>
                <Input id="login-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder={t('login.emailPlaceholder')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">{t('login.password')}</Label>
                <div className="relative">
                  <Input id="login-password" type={showPassword ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)} placeholder={t('login.passwordPlaceholder')} className="pr-10" />
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
                <Input id="signup-name" type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder={t('login.namePlaceholder')} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="signup-phone">{t('login.phone')}</Label>
                  <Input id="signup-phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder={t('login.phonePlaceholder')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-dept">{t('login.department')}</Label>
                  <Select value={department} onValueChange={setDepartment}>
                    <SelectTrigger id="signup-dept"><SelectValue placeholder={t('login.selectDept')} /></SelectTrigger>
                    <SelectContent>
                      {DEPT_KEYS.map(d => (
                        <SelectItem key={d} value={d}>{t(`departments.${d}`)}</SelectItem>
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
                <Input id="signup-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder={t('login.emailPlaceholder')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password">{t('login.password')}</Label>
                <div className="relative">
                  <Input id="signup-password" type={showPassword ? 'text' : 'password'} required minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder={t('login.minChars')} className="pr-10" />
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
