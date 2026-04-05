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

  // If lastGenerated exists, move one step forward; otherwise start from startDate
  if (lastGenerated) {
    cursor =
      periodicity === "monthly"
        ? addMonths(cursor, 1)
        : addDays(cursor, intervalDays[periodicity]!);
  }

  // Generate all dates up to today (max 90 to prevent runaway)
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

    // Fetch active recurring assignments
    const { data: assignments, error: fetchErr } = await supabaseAdmin
      .from("checklist_assignments")
      .select("*, template:checklist_templates(checklist_type, department)")
      .eq("status", "active");

    if (fetchErr) throw fetchErr;
    if (!assignments?.length) {
      return new Response(JSON.stringify({ created: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalCreated = 0;

    for (const assignment of assignments) {
      // Check end date
      if (assignment.end_date && new Date(assignment.end_date) < today) {
        // Auto-end expired assignments
        await supabaseAdmin
          .from("checklist_assignments")
          .update({ status: "ended" })
          .eq("id", assignment.id);
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
      const instances = dates.map((d) => ({
        template_id: assignment.template_id,
        checklist_type: template?.checklist_type || "opening",
        department: template?.department || "kitchen",
        branch_id: assignment.branch_id,
        assigned_to: assignment.assigned_to,
        scheduled_date: d,
        notes: assignment.notes,
      }));

      const { error: insertErr } = await supabaseAdmin
        .from("checklist_instances")
        .insert(instances);

      if (insertErr) {
        console.error(
          `Failed to create instances for assignment ${assignment.id}:`,
          insertErr
        );
        continue;
      }

      totalCreated += instances.length;

      // Update last_generated_date
      await supabaseAdmin
        .from("checklist_assignments")
        .update({ last_generated_date: dates[dates.length - 1] })
        .eq("id", assignment.id);
    }

    return new Response(JSON.stringify({ created: totalCreated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
