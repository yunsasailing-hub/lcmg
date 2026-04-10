import { format } from 'date-fns';
import { AlertTriangle, Bell, Info, CheckCheck, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useNotifications,
  useMarkAsRead,
  useMarkAllAsRead,
  type AppNotification,
} from '@/hooks/useNotifications';

function NotificationItem({ notification, onMarkRead }: {
  notification: AppNotification;
  onMarkRead: (id: string) => void;
}) {
  const isWarning = notification.notification_type === 'warning';

  return (
    <div
      className={cn(
        'flex gap-3 p-3 border-b last:border-b-0 transition-colors cursor-pointer',
        notification.is_read
          ? 'bg-card opacity-60'
          : isWarning
            ? 'bg-destructive/5'
            : 'bg-accent/30'
      )}
      onClick={() => !notification.is_read && onMarkRead(notification.id)}
    >
      <div className="shrink-0 mt-0.5">
        {isWarning ? (
          <AlertTriangle className="h-4 w-4 text-destructive" />
        ) : (
          <Info className="h-4 w-4 text-warning-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('text-sm font-medium truncate', !notification.is_read && 'font-semibold')}>
            {notification.title}
          </p>
          {!notification.is_read && (
            <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
          {notification.message}
        </p>
        <p className="text-[10px] text-muted-foreground mt-1">
          {format(new Date(notification.created_at), 'MMM d, h:mm a')}
        </p>
      </div>
    </div>
  );
}

export default function NotificationCenter({ onClose }: { onClose: () => void }) {
  const { data: notifications = [], isLoading } = useNotifications();
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div
      className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-lg border bg-card shadow-lg z-50"
      style={{ maxHeight: '80vh' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <h3 className="text-sm font-heading font-semibold">Notifications</h3>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => markAllAsRead.mutate()}
              disabled={markAllAsRead.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              Mark all read
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* List */}
      <ScrollArea className="max-h-[60vh]">
        {isLoading ? (
          <div className="p-6 text-center">
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-8 text-center">
            <Bell className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
            <p className="text-sm text-muted-foreground">No notifications yet</p>
          </div>
        ) : (
          notifications.map(n => (
            <NotificationItem
              key={n.id}
              notification={n}
              onMarkRead={(id) => markAsRead.mutate(id)}
            />
          ))
        )}
      </ScrollArea>
    </div>
  );
}

