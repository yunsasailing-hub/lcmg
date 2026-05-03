import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ ok: false, error: "Unauthorized" });
    }
    const token = authHeader.replace("Bearer ", "").trim();

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify caller
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    const callerId = userData?.user?.id;
    if (userError || !callerId) return json({ ok: false, error: "Unauthorized" });

    // Caller must be administrator
    const { data: callerRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const isAdministrator = (callerRoles || []).some((r: any) => r.role === "administrator");
    if (!isAdministrator) return json({ ok: false, error: "Administrator access required" });

    const body = await req.json();
    const { member_id, new_email, reason } = body || {};

    if (!member_id || typeof member_id !== "string") return json({ ok: false, error: "member_id required" });
    if (!new_email || typeof new_email !== "string") return json({ ok: false, error: "new_email required" });
    if (!reason || typeof reason !== "string" || !reason.trim()) return json({ ok: false, error: "reason required" });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(new_email)) return json({ ok: false, error: "Invalid email format" });
    const normalizedEmail = new_email.trim().toLowerCase();

    // Get target profile
    const { data: targetProfile, error: profileErr } = await admin
      .from("profiles")
      .select("user_id, full_name, email")
      .eq("user_id", member_id)
      .maybeSingle();
    if (profileErr || !targetProfile) return json({ ok: false, error: "Member not found" });

    if ((targetProfile.email || "").toLowerCase() === normalizedEmail) {
      return json({ ok: false, error: "New email must be different from current email" });
    }

    // Uniqueness: check profiles + auth users
    const { data: dupProfile } = await admin
      .from("profiles")
      .select("user_id")
      .ilike("email", normalizedEmail)
      .neq("user_id", member_id)
      .maybeSingle();
    if (dupProfile) return json({ ok: false, error: "Email already in use" });

    // Caller name for log
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("user_id", callerId)
      .maybeSingle();

    const baseLog = {
      member_id,
      member_name: targetProfile.full_name,
      old_email: targetProfile.email,
      new_email: normalizedEmail,
      changed_by_user_id: callerId,
      changed_by_name: callerProfile?.full_name || null,
      reason: reason.trim(),
    };

    // 1. Update auth email
    const { error: authErr } = await admin.auth.admin.updateUserById(member_id, {
      email: normalizedEmail,
      email_confirm: true,
    });

    if (authErr) {
      await admin.from("admin_email_change_log").insert({
        ...baseLog,
        status: "failed",
        error_message: authErr.message,
      });
      return json({ ok: false, error: `Auth update failed: ${authErr.message}` });
    }

    // 2. Update profile email
    const { error: profErr } = await admin
      .from("profiles")
      .update({ email: normalizedEmail })
      .eq("user_id", member_id);

    if (profErr) {
      await admin.from("admin_email_change_log").insert({
        ...baseLog,
        status: "partial_failed",
        error_message: `Profile sync failed: ${profErr.message}`,
      });
      return json({
        ok: false,
        partial: true,
        error: "Auth email changed but profile email did not sync. Stop and repair before changing more accounts.",
      });
    }

    await admin.from("admin_email_change_log").insert({
      ...baseLog,
      status: "success",
    });

    return json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: message });
  }
});