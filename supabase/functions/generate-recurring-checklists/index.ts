import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function getNextDates(
  periodicity: string,
  startDate: Date,
  lastGenerated: Date | null,
  endDate: Date | null,
  today: Date
): string[] {
  if (periodicity === "once") {
    if (!lastGenerated) {
      const d = startDate > today ? startDate : today;
      const iso = d.toISOString().split("T")[0];
      return endDate && d > endDate ? [] : [iso];
    }
    return [];
  }

  const intervalDays: Record<string, number | null> = {
    daily: 1,
    weekly: 7,
    biweekly: 14,
    monthly: null,
  };

  const dates: string[] = [];
  let cursor = lastGenerated ? new Date(lastGenerated) : new Date(startDate);

  if (lastGenerated) {
    cursor =
      periodicity === "monthly"
        ? addMonths(cursor, 1)
        : addDays(cursor, intervalDays[periodicity]!);
  }

  let safety = 0;
  while (cursor <= today && safety < 90) {
    if (endDate && cursor > endDate) break;
    dates.push(cursor.toISOString().split("T")[0]);
    cursor =
      periodicity === "monthly"
        ? addMonths(cursor, 1)
        : addDays(cursor, intervalDays[periodicity]!);
    safety++;
  }

  return dates;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Only fetch active assignments (skip paused and ended)
    const { data: assignments, error: fetchErr } = await supabaseAdmin
      .from("checklist_assignments")
      .select("*, template:checklist_templates(checklist_type, department)")
      .eq("status", "active");

    if (fetchErr) throw fetchErr;
    if (!assignments?.length) {
      return new Response(
        JSON.stringify({ created: 0, skipped: 0, ended: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalCreated = 0;
    let totalSkipped = 0;
    let totalEnded = 0;

    for (const assignment of assignments) {
      // Auto-end expired assignments
      if (assignment.end_date && new Date(assignment.end_date) < today) {
        await supabaseAdmin
          .from("checklist_assignments")
          .update({ status: "ended" })
          .eq("id", assignment.id);
        totalEnded++;
        continue;
      }

      const dates = getNextDates(
        assignment.periodicity,
        new Date(assignment.start_date),
        assignment.last_generated_date
          ? new Date(assignment.last_generated_date)
          : null,
        assignment.end_date ? new Date(assignment.end_date) : null,
        today
      );

      if (!dates.length) continue;

      const template = assignment.template as any;

      // Insert one at a time to handle duplicates gracefully
      let createdCount = 0;
      for (const d of dates) {
        // Check for existing instance (duplicate prevention)
        const { data: existing } = await supabaseAdmin
          .from("checklist_instances")
          .select("id")
          .eq("template_id", assignment.template_id)
          .eq("assigned_to", assignment.assigned_to)
          .eq("scheduled_date", d)
          .maybeSingle();

        if (existing) {
          totalSkipped++;
          continue;
        }

        const { error: insertErr } = await supabaseAdmin
          .from("checklist_instances")
          .insert({
            template_id: assignment.template_id,
            assignment_id: assignment.id,
            checklist_type: template?.checklist_type || "opening",
            department: template?.department || "kitchen",
            branch_id: assignment.branch_id,
            assigned_to: assignment.assigned_to,
            scheduled_date: d,
            notes: assignment.notes,
          });

        if (insertErr) {
          // Unique constraint violation = duplicate, skip silently
          if (insertErr.code === "23505") {
            totalSkipped++;
            continue;
          }
          console.error(
            `Failed to create instance for assignment ${assignment.id} date ${d}:`,
            insertErr
          );
          continue;
        }

        createdCount++;
      }

      totalCreated += createdCount;

      // Update last_generated_date to the latest date we processed
      if (dates.length > 0) {
        await supabaseAdmin
          .from("checklist_assignments")
          .update({ last_generated_date: dates[dates.length - 1] })
          .eq("id", assignment.id);
      }
    }

    return new Response(
      JSON.stringify({ created: totalCreated, skipped: totalSkipped, ended: totalEnded }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
