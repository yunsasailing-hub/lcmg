import { supabase } from '@/integrations/supabase/client';

export async function invokeManageRoles(action: string, params: Record<string, unknown> = {}) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error('Not authenticated');

  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('Not authenticated');

  const res = await supabase.functions.invoke('manage-roles', {
    body: { action, ...params },
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (res.error) throw new Error(res.error.message || 'Permission denied');
  if (res.data?.error) throw new Error(res.data.error);

  return res.data;
}
