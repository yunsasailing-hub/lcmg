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

    const { instanceId } = await req.json();
    if (!instanceId || typeof instanceId !== "string") {
      return jsonResponse({ error: "A valid instance id is required." }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      console.error("delete-checklist-instance auth failed", userError);
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // Only owners can delete checklist instances
    const { data: ownerRole, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "owner")
      .maybeSingle();

    if (roleError) {
      throw roleError;
    }

    if (!ownerRole) {
      return jsonResponse({ error: "Permission denied. Only owners can delete checklist records." }, 403);
    }

    // Verify instance exists
    const { data: instance, error: instanceError } = await supabaseAdmin
      .from("checklist_instances")
      .select("id")
      .eq("id", instanceId)
      .maybeSingle();

    if (instanceError) throw instanceError;
    if (!instance) return jsonResponse({ error: "Checklist not found." }, 404);

    // Delete task completions first
    const { error: deleteCompletionsError } = await supabaseAdmin
      .from("checklist_task_completions")
      .delete()
      .eq("instance_id", instanceId);

    if (deleteCompletionsError) throw deleteCompletionsError;

    // Delete the instance
    const { error: deleteInstanceError } = await supabaseAdmin
      .from("checklist_instances")
      .delete()
      .eq("id", instanceId);

    if (deleteInstanceError) throw deleteInstanceError;

    return jsonResponse({ success: true, instanceId });
  } catch (error) {
    console.error("delete-checklist-instance failed", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unexpected error while deleting checklist." },
      500,
    );
  }
});
