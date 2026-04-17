import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface Props {
  className?: string;
  variant?: 'nav' | 'plain';
}

const LANGS = [
  { code: 'en', label: 'EN' },
  { code: 'vi', label: 'VI' },
] as const;

export default function LanguageSwitcher({ className, variant = 'nav' }: Props) {
  const { i18n } = useTranslation();
  const current = i18n.resolvedLanguage?.startsWith('vi') ? 'vi' : 'en';

  const handleChange = (code: 'en' | 'vi') => {
    if (code !== current) void i18n.changeLanguage(code);
  };

  return (
    <div
      role="group"
      aria-label="Language"
      className={cn(
        'inline-flex items-center rounded-md border text-xs font-semibold overflow-hidden',
        variant === 'nav' && 'border-white/20',
        className,
      )}
    >
      {LANGS.map((l, i) => {
        const active = current === l.code;
        return (
          <button
            key={l.code}
            type="button"
            onClick={() => handleChange(l.code)}
            className={cn(
              'px-2 py-1 transition-colors',
              i > 0 && (variant === 'nav' ? 'border-l border-white/20' : 'border-l'),
              active
                ? variant === 'nav'
                  ? 'bg-white/15 text-primary-foreground'
                  : 'bg-primary text-primary-foreground'
                : variant === 'nav'
                  ? 'text-nav-muted hover:text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
            )}
            aria-pressed={active}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}
