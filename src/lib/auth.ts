import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type StaffRole = "admin" | "manager" | "attendant" | "kitchen" | "bar";

export async function requireStaff(allowed?: StaffRole[]) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, active")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!profile || !profile.active) redirect("/login?erro=sem-acesso");
  if (allowed && !allowed.includes(profile.role as StaffRole)) redirect("/admin?erro=permissao");
  return { supabase, user: auth.user, profile: profile as { full_name: string; role: StaffRole; active: boolean } };
}
