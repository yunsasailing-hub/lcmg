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
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No auth header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "").trim();

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
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    let userId = claimsData?.claims?.sub as string | undefined;

    if (claimsError || !userId) {
      const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
      userId = userData?.user?.id;
      if (userError || !userId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!userId) {
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
      .eq("user_id", userId);

    const roles_list = (callerRoles || []).map((r: any) => r.role);
    const isAdministrator = roles_list.includes("administrator");
    // Administrator implicitly has Owner-level access
    const isOwner = roles_list.includes("owner") || isAdministrator;
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
      const { user_id, full_name, phone, email, department, branch_id, position, username } = params;
      if (!user_id) throw new Error("user_id required");

      const updateData: Record<string, any> = {};
      if (full_name !== undefined) updateData.full_name = full_name;
      if (phone !== undefined) updateData.phone = phone;
      if (email !== undefined) updateData.email = email;
      if (department !== undefined) updateData.department = department;
      if (branch_id !== undefined) updateData.branch_id = branch_id || null;
      if (position !== undefined) updateData.position = position;
      if (username !== undefined) {
        const u = (username ?? "").toString().trim().toLowerCase();
        // Lock: once a username exists, it cannot be changed — UNLESS caller is administrator.
        const { data: existing } = await supabaseAdmin
          .from("profiles")
          .select("username")
          .eq("user_id", user_id)
          .maybeSingle();
        const currentUsername = (existing?.username ?? "").toString().trim();
        if (currentUsername !== "") {
          if (u !== currentUsername.toLowerCase() && !isAdministrator) {
            return new Response(JSON.stringify({ ok: false, error: "Username cannot be changed after creation." }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          // Administrator override (or same value): write through (validation trigger enforces format/uniqueness)
          updateData.username = u === "" ? null : u;
        } else {
          updateData.username = u === "" ? null : u;
        }
      }

      const { data, error } = await supabaseAdmin
        .from("profiles")
        .update(updateData)
        .eq("user_id", user_id)
        .select()
        .single();
      if (error) {
        const msg = (error.message || "").toLowerCase();
        if (msg.includes("profiles_username_unique") || (error as any).code === "23505") {
          return new Response(JSON.stringify({ ok: false, error: "This username already exists." }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (msg.includes("invalid_username")) {
          return new Response(JSON.stringify({ ok: false, error: "Username must be 3–32 chars: lowercase letters, numbers, dash, underscore only." }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw error;
      }

      return new Response(JSON.stringify({ ok: true, profile: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── TOGGLE_ACTIVE: activate/deactivate user ───
    if (action === "toggle_active") {
      const { user_id, is_active } = params;
      if (!user_id) throw new Error("user_id required");
      if (user_id === userId) throw new Error("Cannot deactivate yourself");

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
      if (role === "administrator" && !isAdministrator) {
        return new Response(JSON.stringify({ ok: false, error: "Only an Administrator can assign the Administrator role" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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
      if (user_id === userId && role === "owner") {
        return new Response(JSON.stringify({ error: "Cannot remove your own owner role" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (role === "administrator" && !isAdministrator) {
        return new Response(JSON.stringify({ ok: false, error: "Only an Administrator can remove the Administrator role" }), {
          status: 200,
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
      if (user_id === userId) throw new Error("Cannot change your own role");
      if (role === "administrator" && !isAdministrator) {
        return new Response(JSON.stringify({ ok: false, error: "Only an Administrator can assign the Administrator role" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Prevent non-administrators from demoting an existing administrator
      if (!isAdministrator) {
        const { data: targetRoles } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", user_id);
        if ((targetRoles || []).some((r: any) => r.role === "administrator")) {
          return new Response(JSON.stringify({ ok: false, error: "Only an Administrator can change an Administrator's role" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

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