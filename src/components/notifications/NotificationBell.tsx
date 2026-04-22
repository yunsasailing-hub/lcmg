import { useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useUnreadCount } from '@/hooks/useNotifications';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import NotificationCenter from './NotificationCenter';
import { useNotificationPanel } from './NotificationPanelContext';

export default function NotificationBell({ collapsed }: { collapsed?: boolean }) {
  const { data: unreadCount = 0 } = useUnreadCount();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { open, setOpen } = useNotificationPanel();

  const bellButton = (
    <button
      onClick={() => setOpen(!open)}
      className={cn(
        'flex items-center justify-center rounded-md transition-colors hover:bg-nav-active relative',
        collapsed ? 'h-10 w-10' : 'h-9 w-9'
      )}
      style={{ color: 'var(--nav-foreground)' }}
      title={t('notifications.bellTitle')}
    >
      <Bell className="h-5 w-5" />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );

  if (isMobile) {
    return (
      <>
        {bellButton}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="right" className="p-0 w-full sm:w-[420px]">
            <SheetTitle className="sr-only">{t('notifications.bellTitle')}</SheetTitle>
            <NotificationCenter onClose={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      </>
    );
  }

  // Desktop/tablet: panel is rendered by AppShell as a side panel that pushes content.
  return bellButton;
}
