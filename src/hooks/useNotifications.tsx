import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const PAGE_SIZE = 20;

export interface AppNotification {
  id: string;
  user_id: string;
  instance_id: string | null;
  notification_type: 'notice' | 'warning' | 'escalation';
  sender_type: string;
  related_module: string;
  related_entity_type: string;
  priority: 'normal' | 'high' | 'critical';
  status: 'unread' | 'read' | 'archived';
  title: string;
  message: string;
  is_read: boolean;
  read_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useNotifications(statusFilter?: 'unread' | 'read' | 'all') {
  const { user } = useAuth();

  return useInfiniteQuery<AppNotification[]>({
    queryKey: ['notifications', statusFilter || 'active'],
    queryFn: async ({ pageParam = 0 }) => {
      let query = supabase
        .from('in_app_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .range(pageParam as number, (pageParam as number) + PAGE_SIZE - 1);

      if (statusFilter === 'unread') {
        query = query.eq('status', 'unread');
      } else if (statusFilter === 'read') {
        query = query.eq('status', 'read');
      } else {
        query = query.in('status', ['unread', 'read']);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as AppNotification[];
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.flat().length;
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });
}

export function useUnreadCount() {
  const { user } = useAuth();

  return useQuery<number>({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('in_app_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'unread');
      if (error) throw error;
      return count || 0;
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('in_app_notifications')
        .update({ status: 'read' as any, is_read: true, read_at: new Date().toISOString() })
        .eq('id', notificationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAsUnread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('in_app_notifications')
        .update({ status: 'unread' as any, is_read: false, read_at: null })
        .eq('id', notificationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAllAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('in_app_notifications')
        .update({ status: 'read' as any, is_read: true, read_at: new Date().toISOString() })
        .eq('status', 'unread');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useArchiveNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('in_app_notifications')
        .update({ status: 'archived' as any, archived_at: new Date().toISOString() })
        .eq('id', notificationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useArchiveAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('in_app_notifications')
        .update({ status: 'archived' as any, archived_at: new Date().toISOString() })
        .eq('status', 'read');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useOverdueWarnings() {
  const { user } = useAuth();
  return useQuery<AppNotification[]>({
    queryKey: ['notifications', 'warnings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('in_app_notifications')
        .select('*')
        .in('notification_type', ['warning', 'escalation'])
        .eq('status', 'unread')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as AppNotification[];
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });
}
