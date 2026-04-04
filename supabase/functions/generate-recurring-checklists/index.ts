import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const today = new Date().toISOString().split("T")[0];
    const dayOfWeek = new Date().getDay(); // 0=Sun
    const dayOfMonth = new Date().getDate();

    // Fetch active templates with frequency settings
    const { data: templates, error: tErr } = await supabase
      .from("checklist_templates")
      .select("*")
      .eq("is_active", true)
      .not("default_assigned_to", "is", null);

    if (tErr) throw tErr;

    let created = 0;

    for (const tpl of templates || []) {
      // Skip if already generated for today
      if (tpl.last_generated_date === today) continue;

      let shouldGenerate = false;

      switch (tpl.frequency) {
        case "daily":
          shouldGenerate = true;
          break;
        case "weekly":
          // Generate on Mondays (day 1)
          shouldGenerate = dayOfWeek === 1;
          break;
        case "monthly":
          // Generate on the 1st of each month
          shouldGenerate = dayOfMonth === 1;
          break;
        case "determinate_date":
          shouldGenerate = tpl.specific_date === today;
          break;
        default:
          break;
      }

      if (!shouldGenerate) continue;

      // Check if instance already exists for this template+date+assignee
      const { data: existing } = await supabase
        .from("checklist_instances")
        .select("id")
        .eq("template_id", tpl.id)
        .eq("scheduled_date", today)
        .eq("assigned_to", tpl.default_assigned_to)
        .limit(1);

      if (existing && existing.length > 0) continue;

      // Create instance
      const { error: insertErr } = await supabase
        .from("checklist_instances")
        .insert({
          template_id: tpl.id,
          checklist_type: tpl.checklist_type,
          department: tpl.department,
          branch_id: tpl.branch_id,
          assigned_to: tpl.default_assigned_to,
          scheduled_date: today,
          status: "pending",
        });

      if (insertErr) {
        console.error(`Failed to create instance for template ${tpl.id}:`, insertErr);
        continue;
      }

      // Update last_generated_date
      await supabase
        .from("checklist_templates")
        .update({ last_generated_date: today })
        .eq("id", tpl.id);

      created++;
    }

    return new Response(
      JSON.stringify({ success: true, created, date: today }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error generating recurring checklists:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
