import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const today = new Date().toISOString().split("T")[0];

  // Fetch all active assignments that need generation
  const { data: assignments, error: fetchErr } = await supabase
    .from("checklist_assignments")
    .select("*, template:checklist_templates(checklist_type, department)")
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
    // Skip if no template info
    if (!a.template) { skipped++; continue; }

    // Skip if past end_date
    if (a.end_date && a.end_date < today) { skipped++; continue; }

    // Calculate dates to generate
    const datesToGenerate = getDatesToGenerate(a, today);

    for (const date of datesToGenerate) {
      // Skip if past end_date
      if (a.end_date && date > a.end_date) continue;

      // Insert instance, ON CONFLICT do nothing (unique index handles duplicates)
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
        });

      if (insErr) {
        // Duplicate = unique constraint violation, skip silently
        if (insErr.code === "23505") { skipped++; continue; }
        console.error(`Insert error for assignment ${a.id}, date ${date}:`, insErr.message);
        skipped++;
        continue;
      }
      created++;
    }

    // Update last_generated_date
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

  // Start from next occurrence after last generated, or from start_date
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
