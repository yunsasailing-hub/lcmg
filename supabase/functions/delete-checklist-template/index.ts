import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { templateId } = await req.json();

    if (!templateId || typeof templateId !== "string") {
      return jsonResponse({ error: "A valid template id is required." }, 400);
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
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { data: roles, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["owner", "manager"]);

    if (roleError) {
      throw roleError;
    }

    if (!roles?.length) {
      return jsonResponse({ error: "Only managers or owners can delete templates." }, 403);
    }

    const { data: template, error: templateError } = await supabaseAdmin
      .from("checklist_templates")
      .select("id, title")
      .eq("id", templateId)
      .maybeSingle();

    if (templateError) {
      throw templateError;
    }

    if (!template) {
      return jsonResponse({ error: "Template not found." }, 404);
    }

    const { count: instanceCount, error: instanceError } = await supabaseAdmin
      .from("checklist_instances")
      .select("id", { count: "exact", head: true })
      .eq("template_id", templateId);

    if (instanceError) {
      throw instanceError;
    }

    if ((instanceCount ?? 0) > 0) {
      return jsonResponse(
        {
          error: `This template can't be deleted because it is already linked to ${instanceCount} checklist${instanceCount === 1 ? "" : "s"}. Delete those checklist records first if you want to remove it permanently.`,
        },
        409,
      );
    }

    const { error: deleteTasksError } = await supabaseAdmin
      .from("checklist_template_tasks")
      .delete()
      .eq("template_id", templateId);

    if (deleteTasksError) {
      throw deleteTasksError;
    }

    const { data: deletedTemplate, error: deleteTemplateError } = await supabaseAdmin
      .from("checklist_templates")
      .delete()
      .eq("id", templateId)
      .select("id")
      .maybeSingle();

    if (deleteTemplateError) {
      throw deleteTemplateError;
    }

    if (!deletedTemplate) {
      return jsonResponse({ error: "Template could not be deleted." }, 500);
    }

    return jsonResponse({ success: true, templateId: deletedTemplate.id, title: template.title });
  } catch (error) {
    console.error("delete-checklist-template failed", error);

    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Unexpected error while deleting template.",
      },
      500,
    );
  }
});