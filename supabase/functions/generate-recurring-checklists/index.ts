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

  // "Today" must be evaluated in Vietnam local time (UTC+7), not server UTC.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());

  // Fetch all active assignments that need generation
  const { data: assignments, error: fetchErr } = await supabase
    .from("checklist_assignments")
    .select("*, template:checklist_templates(checklist_type, department, default_due_time, warning_recipient_user_ids)")
    .eq("status", "active")
    .lte("start_date", today);

  if (fetchErr) {
    return new Response(JSON.stringify({ ok: false, error: fetchErr.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }

  let created = 0;
  let skipped = 0;

  for (const a of assignments || []) {
    if (!a.template) { skipped++; continue; }
    if (a.end_date && a.end_date < today) { skipped++; continue; }

    const datesToGenerate = getDatesToGenerate(a, today);

    for (const date of datesToGenerate) {
      if (a.end_date && date > a.end_date) continue;

      // Compute due_datetime: template due time is Vietnam local time (Asia/Ho_Chi_Minh, UTC+7)
      // Convert to UTC ISO for storage so timestamptz comparisons are correct.
      const dueTime = a.template.default_due_time || "10:00:00";
      const dueDatetime = new Date(`${date}T${dueTime}+07:00`).toISOString();

      // Recipient resolution: assignment override → template default → empty (notification fn fallback)
      const recipientIds =
        (Array.isArray(a.warning_recipient_user_ids) && a.warning_recipient_user_ids.length > 0)
          ? a.warning_recipient_user_ids
          : (Array.isArray(a.template.warning_recipient_user_ids) ? a.template.warning_recipient_user_ids : []);

      const { error: insErr } = await supabase
        .from("checklist_instances")
        .insert({
          template_id: a.template_id,
          assignment_id: a.id,
          assigned_to: a.assigned_to,
          checklist_type: a.template.checklist_type,
          department: a.template.department,
          branch_id: a.branch_id,
          scheduled_date: date,
          due_datetime: dueDatetime,
          warning_recipient_user_ids: recipientIds,
        });

      if (insErr) {
        if (insErr.code === "23505") { skipped++; continue; }
        console.error(`Insert error for assignment ${a.id}, date ${date}:`, insErr.message);
        skipped++;
        continue;
      }
      created++;
    }

    if (datesToGenerate.length > 0) {
      const maxDate = datesToGenerate.sort().pop()!;
      await supabase
        .from("checklist_assignments")
        .update({ last_generated_date: maxDate })
        .eq("id", a.id);
    }
  }

  return new Response(
    JSON.stringify({ ok: true, created, skipped, date: today }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
  );
});

function getDatesToGenerate(
  assignment: { periodicity: string; start_date: string; last_generated_date: string | null },
  today: string
): string[] {
  const { periodicity, start_date, last_generated_date } = assignment;

  if (periodicity === "once") {
    if (!last_generated_date) return [start_date];
    return [];
  }

  let cursor = last_generated_date
    ? getNextOccurrence(last_generated_date, periodicity)
    : start_date;

  if (cursor > today) return [];

  const dates: string[] = [];
  let safety = 0;
  while (cursor <= today && safety < 90) {
    dates.push(cursor);
    cursor = getNextOccurrence(cursor, periodicity);
    safety++;
  }

  return dates;
}

function getNextOccurrence(dateStr: string, periodicity: string): string {
  switch (periodicity) {
    case "daily": return addDays(dateStr, 1);
    case "weekly": return addDays(dateStr, 7);
    case "biweekly": return addDays(dateStr, 14);
    case "monthly": return addMonths(dateStr, 1);
    default: return addDays(dateStr, 1);
  }
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().split("T")[0];
}
