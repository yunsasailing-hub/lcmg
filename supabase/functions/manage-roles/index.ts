import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify the caller
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse body FIRST so action is available for all checks
    const { action, ...params } = await req.json();

    // Check caller roles
    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const roles_list = (callerRoles || []).map((r: any) => r.role);
    const isOwner = roles_list.includes("owner");
    const isManager = roles_list.includes("manager");

    // ─── LIST_ACTIVE_USERS: available to owner + manager for assignment dropdowns ───
    if (action === "list_active_users") {
      if (!isOwner && !isManager) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: profiles, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("user_id, full_name, email, department, position, branch_id, is_active")
        .eq("is_active", true)
        .order("full_name", { ascending: true });
      if (pErr) throw pErr;

      const { data: allRoles, error: rErr } = await supabaseAdmin
        .from("user_roles")
        .select("user_id, role");
      if (rErr) throw rErr;

      const rolesMap: Record<string, string[]> = {};
      (allRoles || []).forEach((r: any) => {
        if (!rolesMap[r.user_id]) rolesMap[r.user_id] = [];
        rolesMap[r.user_id].push(r.role);
      });

      const enriched = (profiles || []).map((p: any) => ({
        ...p,
        roles: rolesMap[p.user_id] || [],
      }));

      return new Response(JSON.stringify({ users: enriched }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // All remaining actions require owner role
    if (!isOwner) {
      return new Response(JSON.stringify({ error: "Only owners can manage roles" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── LIST: roles + basic profiles ───
    if (action === "list") {
      const { data: roles, error } = await supabaseAdmin
        .from("user_roles")
        .select("id, user_id, role");
      if (error) throw error;

      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("user_id, full_name, email, avatar_url");

      return new Response(JSON.stringify({ roles, profiles }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── LIST_FULL: all profiles with full details + roles ───
    if (action === "list_full") {
      const { data: profiles, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .order("full_name", { ascending: true });
      if (pErr) throw pErr;

      const { data: roles, error: rErr } = await supabaseAdmin
        .from("user_roles")
        .select("user_id, role");
      if (rErr) throw rErr;

      const { data: branches } = await supabaseAdmin
        .from("branches")
        .select("id, name")
        .eq("is_active", true)
        .order("name");

      const rolesMap: Record<string, string[]> = {};
      (roles || []).forEach((r: any) => {
        if (!rolesMap[r.user_id]) rolesMap[r.user_id] = [];
        rolesMap[r.user_id].push(r.role);
      });

      const enriched = (profiles || []).map((p: any) => ({
        ...p,
        roles: rolesMap[p.user_id] || [],
      }));

      return new Response(JSON.stringify({ profiles: enriched, branches: branches || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── UPDATE_PROFILE: edit user details ───
    if (action === "update_profile") {
      const { user_id, full_name, phone, email, department, branch_id, position } = params;
      if (!user_id) throw new Error("user_id required");

      const updateData: Record<string, any> = {};
      if (full_name !== undefined) updateData.full_name = full_name;
      if (phone !== undefined) updateData.phone = phone;
      if (email !== undefined) updateData.email = email;
      if (department !== undefined) updateData.department = department;
      if (branch_id !== undefined) updateData.branch_id = branch_id || null;
      if (position !== undefined) updateData.position = position;

      const { data, error } = await supabaseAdmin
        .from("profiles")
        .update(updateData)
        .eq("user_id", user_id)
        .select()
        .single();
      if (error) throw error;

      return new Response(JSON.stringify({ ok: true, profile: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── TOGGLE_ACTIVE: activate/deactivate user ───
    if (action === "toggle_active") {
      const { user_id, is_active } = params;
      if (!user_id) throw new Error("user_id required");
      if (user_id === user.id) throw new Error("Cannot deactivate yourself");

      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ is_active })
        .eq("user_id", user_id);
      if (error) throw error;

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ASSIGN role ───
    if (action === "assign") {
      const { user_id, role } = params;
      const { data, error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id, role }, { onConflict: "user_id,role" })
        .select()
        .single();
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── REMOVE role ───
    if (action === "remove") {
      const { user_id, role } = params;
      if (user_id === user.id && role === "owner") {
        return new Response(JSON.stringify({ error: "Cannot remove your own owner role" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", user_id)
        .eq("role", role);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── SET_ROLE: replace all roles with a single one ───
    if (action === "set_role") {
      const { user_id, role } = params;
      if (!user_id || !role) throw new Error("user_id and role required");
      if (user_id === user.id) throw new Error("Cannot change your own role");

      await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", user_id);

      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id, role });
      if (error) throw error;

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});