import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const now = new Date();
  let createdNotices = 0;
  let createdWarnings = 0;

  // Fetch all pending/late checklists with due_datetime set
  const { data: pendingInstances, error: fetchErr } = await supabase
    .from("checklist_instances")
    .select("id, assigned_to, checklist_type, department, scheduled_date, branch_id, template_id, assignment_id, due_datetime, status")
    .in("status", ["pending", "late"])
    .not("assigned_to", "is", null)
    .not("due_datetime", "is", null);

  if (fetchErr) {
    return new Response(JSON.stringify({ ok: false, error: fetchErr.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }

  if (!pendingInstances || pendingInstances.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, notices: 0, warnings: 0, message: "No pending instances" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  }

  // Fetch template titles for notification messages
  const templateIds = [...new Set(pendingInstances.map(i => i.template_id).filter(Boolean))];
  let templateMap: Record<string, string> = {};
  if (templateIds.length > 0) {
    const { data: templates } = await supabase
      .from("checklist_templates")
      .select("id, title")
      .in("id", templateIds);
    if (templates) {
      templateMap = Object.fromEntries(templates.map(t => [t.id, t.title]));
    }
  }

  // Fetch managers/owners for warning escalation
  const { data: managerRoles } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["owner", "manager"]);

  const managerUserIds = managerRoles?.map(r => r.user_id) || [];

  // Process each pending instance
  for (const instance of pendingInstances) {
    const dueTime = new Date(instance.due_datetime);
    const hoursSinceDue = (now.getTime() - dueTime.getTime()) / (1000 * 60 * 60);

    if (hoursSinceDue < 2) continue;

    const templateTitle = instance.template_id ? (templateMap[instance.template_id] || "Checklist") : "Checklist";
    const typeLabel = instance.checklist_type.charAt(0).toUpperCase() + instance.checklist_type.slice(1);
    const dateLabel = instance.scheduled_date;

    // 2h+ overdue → Notice (late status)
    if (hoursSinceDue >= 2) {
      const { error } = await supabase
        .from("in_app_notifications")
        .upsert({
          instance_id: instance.id,
          user_id: instance.assigned_to,
          notification_type: "notice",
          title: `Overdue: ${templateTitle}`,
          message: `${typeLabel} checklist "${templateTitle}" for ${dateLabel} is overdue. Please complete it as soon as possible.`,
        }, { onConflict: "instance_id,user_id,notification_type" });

      if (!error) createdNotices++;

      // Update instance status to 'late' and record notice_sent_at
      await supabase
        .from("checklist_instances")
        .update({ status: "late", notice_sent_at: now.toISOString() })
        .eq("id", instance.id)
        .in("status", ["pending"]);
    }

    // 4h+ overdue → Warning (escalated status)
    if (hoursSinceDue >= 4) {
      const { error: staffErr } = await supabase
        .from("in_app_notifications")
        .upsert({
          instance_id: instance.id,
          user_id: instance.assigned_to,
          notification_type: "warning",
          title: `Urgent: ${templateTitle}`,
          message: `${typeLabel} checklist "${templateTitle}" for ${dateLabel} is critically overdue (4+ hours). Immediate action required.`,
        }, { onConflict: "instance_id,user_id,notification_type" });

      if (!staffErr) createdWarnings++;

      for (const managerId of managerUserIds) {
        if (managerId === instance.assigned_to) continue;

        await supabase
          .from("in_app_notifications")
          .upsert({
            instance_id: instance.id,
            user_id: managerId,
            notification_type: "escalation",
            title: `Escalation: ${templateTitle}`,
            message: `${typeLabel} checklist "${templateTitle}" for ${dateLabel} has not been completed by the assigned staff (4+ hours overdue).`,
          }, { onConflict: "instance_id,user_id,notification_type" });
      }

      // Update instance status to 'escalated' and record warning_sent_at
      await supabase
        .from("checklist_instances")
        .update({ status: "escalated", warning_sent_at: now.toISOString() })
        .eq("id", instance.id)
        .in("status", ["pending", "late"]);
    }
  }

  return new Response(
    JSON.stringify({ ok: true, notices: createdNotices, warnings: createdWarnings, processed: pendingInstances.length }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
  );
});
