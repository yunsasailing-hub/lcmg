import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
  AlertTriangle, Bell, Info, CheckCheck, X, Archive, Eye, EyeOff,
  Filter, ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  useNotifications,
  useMarkAsRead,
  useMarkAsUnread,
  useMarkAllAsRead,
  useArchiveNotification,
  useArchiveAllRead,
  type AppNotification,
} from '@/hooks/useNotifications';

/* ─── Visual config per type ─── */
const TYPE_STYLES: Record<string, { icon: typeof Info; bg: string; iconColor: string; label: string }> = {
  notice: {
    icon: Info,
    bg: 'bg-warning/10 border-l-4 border-l-warning',
    iconColor: 'text-warning-foreground',
    label: 'Notice',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'bg-destructive/8 border-l-4 border-l-destructive/60',
    iconColor: 'text-destructive/80',
    label: 'Warning',
  },
  escalation: {
    icon: AlertTriangle,
    bg: 'bg-destructive/15 border-l-4 border-l-destructive',
    iconColor: 'text-destructive',
    label: 'Escalation',
  },
};

const PRIORITY_BADGE: Record<string, string> = {
  critical: 'bg-destructive text-destructive-foreground',
  high: 'bg-warning text-warning-foreground',
  normal: 'bg-muted text-muted-foreground',
};

/* ─── Notification Card ─── */
function NotificationCard({
  notification,
  onMarkRead,
  onMarkUnread,
  onArchive,
}: {
  notification: AppNotification;
  onMarkRead: (id: string) => void;
  onMarkUnread: (id: string) => void;
  onArchive: (id: string) => void;
}) {
  const style = TYPE_STYLES[notification.notification_type] || TYPE_STYLES.notice;
  const Icon = style.icon;
  const isUnread = notification.status === 'unread';

  // Extract branch/department from message if present
  const messageParts = notification.message;

  return (
    <div
      className={cn(
        'relative p-4 transition-colors',
        style.bg,
        isUnread ? 'bg-opacity-100' : 'opacity-70',
      )}
    >
      <div className="flex gap-3">
        {/* Icon */}
        <div className="shrink-0 mt-0.5">
          <Icon className={cn('h-5 w-5', style.iconColor)} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className={cn('text-sm', isUnread ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground')}>
                {notification.title}
              </h4>
              <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', PRIORITY_BADGE[notification.priority])}>
                {notification.priority}
              </Badge>
              {isUnread && (
                <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
              )}
            </div>

            {/* Actions dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 -mt-1 -mr-1">
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                {isUnread ? (
                  <DropdownMenuItem onClick={() => onMarkRead(notification.id)}>
                    <Eye className="h-3.5 w-3.5 mr-2" />
                    Mark as read
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => onMarkUnread(notification.id)}>
                    <EyeOff className="h-3.5 w-3.5 mr-2" />
                    Mark as unread
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onArchive(notification.id)}>
                  <Archive className="h-3.5 w-3.5 mr-2" />
                  Archive
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <p className={cn('text-sm mt-1', isUnread ? 'text-foreground' : 'text-muted-foreground')}>
            {messageParts}
          </p>

          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="text-[11px] text-muted-foreground">
              {format(new Date(notification.created_at), 'MMM d, yyyy · h:mm a')}
            </span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {style.label}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Notification Center ─── */
export default function NotificationCenter({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'all' | 'unread' | 'read'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  const statusFilter = tab === 'all' ? 'all' : tab;
  const { data: notifications = [], isLoading } = useNotifications(statusFilter as any);

  const markAsRead = useMarkAsRead();
  const markAsUnread = useMarkAsUnread();
  const markAllAsRead = useMarkAllAsRead();
  const archiveNotification = useArchiveNotification();
  const archiveAllRead = useArchiveAllRead();

  const unreadCount = useMemo(
    () => notifications.filter(n => n.status === 'unread').length,
    [notifications]
  );
  const readCount = useMemo(
    () => notifications.filter(n => n.status === 'read').length,
    [notifications]
  );

  // Apply client-side filters
  const filtered = useMemo(() => {
    let result = notifications;
    if (typeFilter !== 'all') {
      result = result.filter(n => n.notification_type === typeFilter);
    }
    if (priorityFilter !== 'all') {
      result = result.filter(n => n.priority === priorityFilter);
    }
    return result;
  }, [notifications, typeFilter, priorityFilter]);

  return (
    <div className="flex flex-col h-full max-h-[80vh] sm:max-h-[85vh] w-full sm:w-[420px] bg-card rounded-lg border shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card shrink-0">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-foreground" />
          <h3 className="text-sm font-heading font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-5">
              {unreadCount}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setShowFilters(!showFilters)}
            title="Filters"
          >
            <Filter className={cn('h-3.5 w-3.5', showFilters && 'text-primary')} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 pt-2 pb-1 border-b shrink-0">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="w-full h-8">
            <TabsTrigger value="all" className="flex-1 text-xs h-7">All</TabsTrigger>
            <TabsTrigger value="unread" className="flex-1 text-xs h-7">
              Unread{unreadCount > 0 ? ` (${unreadCount})` : ''}
            </TabsTrigger>
            <TabsTrigger value="read" className="flex-1 text-xs h-7">Read</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="px-4 py-2 border-b bg-muted/30 flex flex-wrap gap-2 shrink-0">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-7 w-[120px] text-xs">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="notice">Notice</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="escalation">Escalation</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="h-7 w-[120px] text-xs">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
          {(typeFilter !== 'all' || priorityFilter !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => { setTypeFilter('all'); setPriorityFilter('all'); }}
            >
              Clear
            </Button>
          )}
        </div>
      )}

      {/* Bulk actions */}
      <div className="flex items-center justify-end gap-1 px-4 py-1.5 border-b shrink-0">
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
        {readCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => archiveAllRead.mutate()}
            disabled={archiveAllRead.isPending}
          >
            <Archive className="h-3.5 w-3.5 mr-1" />
            Archive read
          </Button>
        )}
      </div>

      {/* Notification list */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-8 text-center">
            <p className="text-sm text-muted-foreground">Loading notifications...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <Bell className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium text-muted-foreground">No notifications</p>
            <p className="text-xs text-muted-foreground mt-1">
              {tab === 'unread' ? "You're all caught up!" : 'Nothing to show here.'}
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map(n => (
              <NotificationCard
                key={n.id}
                notification={n}
                onMarkRead={(id) => markAsRead.mutate(id)}
                onMarkUnread={(id) => markAsUnread.mutate(id)}
                onArchive={(id) => archiveNotification.mutate(id)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
