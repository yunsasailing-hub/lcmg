import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Clock, MessageSquare, Smartphone, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

interface NotificationSettings {
  id: string;
  checklist_notices_enabled: boolean;
  checklist_warnings_enabled: boolean;
  notice_delay_hours: number;
  warning_delay_hours: number;
  push_enabled: boolean;
  whatsapp_enabled: boolean;
}

function useNotificationSettings() {
  return useQuery<NotificationSettings>({
    queryKey: ['notification-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_settings')
        .select('*')
        .limit(1)
        .single();
      if (error) throw error;
      return data as NotificationSettings;
    },
  });
}

function useUpdateSettings() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async (updates: Partial<NotificationSettings>) => {
      const { error } = await supabase
        .from('notification_settings')
        .update(updates)
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-settings'] });
      toast.success(t('management.notif.saved'));
    },
    onError: () => {
      toast.error(t('management.notif.saveFailed'));
    },
  });
}

export default function NotificationSettingsPanel() {
  const { t } = useTranslation();
  const { data: settings, isLoading } = useNotificationSettings();
  const updateSettings = useUpdateSettings();

  const [noticesEnabled, setNoticesEnabled] = useState(true);
  const [warningsEnabled, setWarningsEnabled] = useState(true);
  const [noticeDelay, setNoticeDelay] = useState(2);
  const [warningDelay, setWarningDelay] = useState(4);

  // Sync local state with fetched data
  useEffect(() => {
    if (settings) {
      setNoticesEnabled(settings.checklist_notices_enabled);
      setWarningsEnabled(settings.checklist_warnings_enabled);
      setNoticeDelay(settings.notice_delay_hours);
      setWarningDelay(settings.warning_delay_hours);
    }
  }, [settings]);

  const hasChanges = settings && (
    noticesEnabled !== settings.checklist_notices_enabled ||
    warningsEnabled !== settings.checklist_warnings_enabled ||
    noticeDelay !== settings.notice_delay_hours ||
    warningDelay !== settings.warning_delay_hours
  );

  const handleSave = () => {
    updateSettings.mutate({
      checklist_notices_enabled: noticesEnabled,
      checklist_warnings_enabled: warningsEnabled,
      notice_delay_hours: noticeDelay,
      warning_delay_hours: warningDelay,
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">{t('management.notif.loadingSettings')}</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* In-App Notifications Section */}
      <div className="stat-card p-0 overflow-hidden">
        <div className="flex items-center gap-2 px-5 pt-5 pb-3">
          <Bell className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-heading font-semibold text-foreground">{t('management.notif.sectionTitle')}</h3>
        </div>

        <div className="px-5 pb-5 space-y-5">
          {/* Notice settings */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">{t('management.notif.noticesLabel')}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('management.notif.noticesDesc')}
                </p>
              </div>
              <Switch checked={noticesEnabled} onCheckedChange={setNoticesEnabled} />
            </div>

            {noticesEnabled && (
              <div className="flex items-center gap-3 pl-4 border-l-2 border-warning/30">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <Label className="text-xs text-muted-foreground whitespace-nowrap">{t('management.notif.delay')}</Label>
                <Input
                  type="number"
                  min={1}
                  max={24}
                  value={noticeDelay}
                  onChange={(e) => setNoticeDelay(Math.max(1, Math.min(24, parseInt(e.target.value) || 1)))}
                  className="h-8 w-20 text-sm"
                />
                <span className="text-xs text-muted-foreground">{t('management.notif.hoursAfterDue')}</span>
              </div>
            )}
          </div>

          <Separator />

          {/* Warning settings */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">{t('management.notif.warningsLabel')}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('management.notif.warningsDesc')}
                </p>
              </div>
              <Switch checked={warningsEnabled} onCheckedChange={setWarningsEnabled} />
            </div>

            {warningsEnabled && (
              <div className="flex items-center gap-3 pl-4 border-l-2 border-destructive/30">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <Label className="text-xs text-muted-foreground whitespace-nowrap">{t('management.notif.delay')}</Label>
                <Input
                  type="number"
                  min={1}
                  max={48}
                  value={warningDelay}
                  onChange={(e) => setWarningDelay(Math.max(1, Math.min(48, parseInt(e.target.value) || 1)))}
                  className="h-8 w-20 text-sm"
                />
                <span className="text-xs text-muted-foreground">{t('management.notif.hoursAfterDue')}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Future channels (disabled) */}
      <div className="stat-card p-0 overflow-hidden opacity-60">
        <div className="flex items-center gap-2 px-5 pt-5 pb-3">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-heading font-semibold text-muted-foreground">{t('management.notif.additionalChannels')}</h3>
          <Badge variant="secondary" className="text-[10px] ml-1">{t('management.notif.comingSoon')}</Badge>
        </div>
        <div className="px-5 pb-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm text-muted-foreground">{t('management.notif.pushTitle')}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t('management.notif.pushDesc')}</p>
            </div>
            <Switch disabled checked={false} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm text-muted-foreground">{t('management.notif.whatsappTitle')}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t('management.notif.whatsappDesc')}</p>
            </div>
            <Switch disabled checked={false} />
          </div>
        </div>
      </div>

      {/* Save */}
      {hasChanges && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={updateSettings.isPending} className="gap-2">
            <Save className="h-4 w-4" />
            {updateSettings.isPending ? t('management.notif.savingChanges') : t('management.notif.saveChanges')}
          </Button>
        </div>
      )}
    </div>
  );
}
