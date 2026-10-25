import { createClient, type User } from "npm:@supabase/supabase-js@2";

/** Return the verified Supabase user, or null when the request has no valid user token. */
export async function getAuthenticatedUser(req: Request): Promise<User | null> {
  const authorization = req.headers.get("Authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") ??
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase Auth environment is not configured");
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await supabase.auth.getUser(match[1]);
  return error ? null : data.user;
}
