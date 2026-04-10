import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { instanceIds } = await req.json();
    if (!Array.isArray(instanceIds) || instanceIds.length === 0 || !instanceIds.every((id: unknown) => typeof id === "string")) {
      return jsonResponse({ error: "A valid array of instance IDs is required." }, 400);
    }

    if (instanceIds.length > 100) {
      return jsonResponse({ error: "Cannot delete more than 100 records at once." }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // Only owners can delete checklist instances
    const { data: ownerRole, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "owner")
      .maybeSingle();

    if (roleError) throw roleError;
    if (!ownerRole) {
      return jsonResponse({ error: "Permission denied. Only owners can delete checklist records." }, 403);
    }

    // Delete task completions for all instances
    const { error: deleteCompletionsError } = await supabaseAdmin
      .from("checklist_task_completions")
      .delete()
      .in("instance_id", instanceIds);

    if (deleteCompletionsError) throw deleteCompletionsError;

    // Delete the instances
    const { error: deleteInstancesError } = await supabaseAdmin
      .from("checklist_instances")
      .delete()
      .in("id", instanceIds);

    if (deleteInstancesError) throw deleteInstancesError;

    return jsonResponse({ success: true, deletedCount: instanceIds.length });
  } catch (error) {
    console.error("bulk-delete-checklist-instances failed", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unexpected error while deleting checklists." },
      500,
    );
  }
});
