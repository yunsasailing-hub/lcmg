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
  let createdEscalations = 0;

  // ─── Read notification settings ───
  const { data: settingsRow } = await supabase
    .from("notification_settings")
    .select("checklist_notices_enabled, checklist_warnings_enabled, notice_delay_hours, warning_delay_hours")
    .limit(1)
    .single();

  const noticesEnabled = settingsRow?.checklist_notices_enabled ?? true;
  const warningsEnabled = settingsRow?.checklist_warnings_enabled ?? true;
  const noticeDelayHours = settingsRow?.notice_delay_hours ?? 2;
  const warningDelayHours = settingsRow?.warning_delay_hours ?? 4;

  // If both channels are disabled, skip entirely
  if (!noticesEnabled && !warningsEnabled) {
    return new Response(
      JSON.stringify({ ok: true, notices: 0, warnings: 0, escalations: 0, message: "Notifications disabled" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  }

  // Fetch all pending/late checklists with due_datetime set
  const { data: pendingInstances, error: fetchErr } = await supabase
    .from("checklist_instances")
    .select("id, assigned_to, assigned_manager_user_id, checklist_type, department, scheduled_date, branch_id, template_id, due_datetime, status, notice_sent_at, warning_sent_at, completed_at, warning_recipient_user_ids")
    .in("status", ["pending", "late"])
    .not("assigned_to", "is", null)
    .not("due_datetime", "is", null)
    .is("completed_at", null);

  if (fetchErr) {
    return new Response(JSON.stringify({ ok: false, error: fetchErr.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }

  if (!pendingInstances || pendingInstances.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, notices: 0, warnings: 0, escalations: 0, message: "No pending instances" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  }

  // Fetch branch names for messages
  const branchIds = [...new Set(pendingInstances.map(i => i.branch_id).filter(Boolean))];
  let branchMap: Record<string, string> = {};
  if (branchIds.length > 0) {
    const { data: branches } = await supabase
      .from("branches")
      .select("id, name")
      .in("id", branchIds);
    if (branches) {
      branchMap = Object.fromEntries(branches.map(b => [b.id, b.name]));
    }
  }

  // Fetch staff profiles for escalation messages
  const staffIds = [...new Set(pendingInstances.map(i => i.assigned_to).filter(Boolean))];
  let profileMap: Record<string, string> = {};
  if (staffIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", staffIds);
    if (profiles) {
      profileMap = Object.fromEntries(profiles.map(p => [p.user_id, p.full_name || "Unknown"]));
    }
  }

  // Fetch all owners + managers, with their branch via profiles, for fallback escalation logic.
  const { data: managerRoles } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["owner", "manager"]);
  const ownerIds = (managerRoles || []).filter(r => r.role === "owner").map(r => r.user_id);
  const managerIds = (managerRoles || []).filter(r => r.role === "manager").map(r => r.user_id);

  // Map managers → branch_id via profiles, so branch fallback works
  let managerBranchMap: Record<string, string | null> = {};
  if (managerIds.length > 0) {
    const { data: managerProfiles } = await supabase
      .from("profiles")
      .select("user_id, branch_id")
      .in("user_id", managerIds);
    if (managerProfiles) {
      managerBranchMap = Object.fromEntries(managerProfiles.map(p => [p.user_id, p.branch_id]));
    }
  }

  // Process each pending instance
  for (const instance of pendingInstances) {
    const dueTime = new Date(instance.due_datetime);
    const hoursSinceDue = (now.getTime() - dueTime.getTime()) / (1000 * 60 * 60);

    // Skip if not yet past the earliest threshold
    const minThreshold = Math.min(noticeDelayHours, warningDelayHours);
    if (hoursSinceDue < minThreshold) continue;

    const branchName = instance.branch_id ? (branchMap[instance.branch_id] || "the branch") : "the branch";
    const staffName = profileMap[instance.assigned_to] || "Unknown";
    const typeLabel = instance.checklist_type;

    // ─── Rule 1: Notice (configurable delay, only if enabled) ───
    if (noticesEnabled && hoursSinceDue >= noticeDelayHours && !instance.notice_sent_at) {
      const { error } = await supabase
        .from("in_app_notifications")
        .upsert({
          instance_id: instance.id,
          user_id: instance.assigned_to,
          notification_type: "notice",
          title: "Checklist Notice",
          message: `Notice: Your ${typeLabel} checklist for ${branchName} has not been completed yet.`,
          sender_type: "system",
          related_module: "checklist",
          related_entity_type: "checklist_occurrence",
          priority: "high",
          status: "unread",
        }, { onConflict: "instance_id,user_id,notification_type" });

      if (!error) createdNotices++;

      await supabase
        .from("checklist_instances")
        .update({ status: "late", notice_sent_at: now.toISOString() })
        .eq("id", instance.id);
    }

    // ─── Rule 2: Warning + Escalation (configurable delay, only if enabled) ───
    if (warningsEnabled && hoursSinceDue >= warningDelayHours && !instance.warning_sent_at) {
      // Staff warning
      const { error: staffErr } = await supabase
        .from("in_app_notifications")
        .upsert({
          instance_id: instance.id,
          user_id: instance.assigned_to,
          notification_type: "warning",
          title: "Checklist Warning",
          message: `Warning: Your ${typeLabel} checklist for ${branchName} is still incomplete ${warningDelayHours} hours after the due time. Please complete it immediately.`,
          sender_type: "system",
          related_module: "checklist",
          related_entity_type: "checklist_occurrence",
          priority: "critical",
          status: "unread",
        }, { onConflict: "instance_id,user_id,notification_type" });

      if (!staffErr) createdWarnings++;

      // Manager escalation
      const escalationTargets = instance.assigned_manager_user_id
        ? [instance.assigned_manager_user_id]
        : allManagerIds;

      for (const managerId of escalationTargets) {
        if (managerId === instance.assigned_to) continue;

        const { error: escErr } = await supabase
          .from("in_app_notifications")
          .upsert({
            instance_id: instance.id,
            user_id: managerId,
            notification_type: "escalation",
            title: "Checklist Escalation",
            message: `Warning: The ${typeLabel} checklist for ${branchName}, assigned to ${staffName}, is still incomplete ${warningDelayHours} hours after the due time.`,
            sender_type: "system",
            related_module: "checklist",
            related_entity_type: "checklist_occurrence",
            priority: "critical",
            status: "unread",
          }, { onConflict: "instance_id,user_id,notification_type" });

        if (!escErr) createdEscalations++;
      }

      // Ensure notice is also set if somehow missed
      if (noticesEnabled && !instance.notice_sent_at) {
        await supabase
          .from("in_app_notifications")
          .upsert({
            instance_id: instance.id,
            user_id: instance.assigned_to,
            notification_type: "notice",
            title: "Checklist Notice",
            message: `Notice: Your ${typeLabel} checklist for ${branchName} has not been completed yet.`,
            sender_type: "system",
            related_module: "checklist",
            related_entity_type: "checklist_occurrence",
            priority: "high",
            status: "unread",
          }, { onConflict: "instance_id,user_id,notification_type" });
      }

      await supabase
        .from("checklist_instances")
        .update({
          status: "escalated",
          warning_sent_at: now.toISOString(),
          notice_sent_at: instance.notice_sent_at || now.toISOString(),
        })
        .eq("id", instance.id);
    }
  }

  return new Response(
    JSON.stringify({ ok: true, notices: createdNotices, warnings: createdWarnings, escalations: createdEscalations, processed: pendingInstances.length }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
  );
});
