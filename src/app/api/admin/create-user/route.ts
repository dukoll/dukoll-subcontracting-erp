import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const ALLOWED_ROLES = ['admin', 'accounting', 'store', 'production', 'viewer'];

export async function POST(request: Request) {
  // 1) Caller must be a signed-in admin.
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can create users' }, { status: 403 });
  }

  // 2) Validate input.
  const body = await request.json().catch(() => null);
  const username = (body?.username ?? '').trim();
  const email = (body?.email ?? '').trim().toLowerCase();
  const password = body?.password ?? '';
  const full_name = (body?.full_name ?? '').trim();
  const role = body?.role;

  if (!username || !email || !password) {
    return NextResponse.json({ error: 'Username, email and password are required' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  // 3) Create the auth user + profile with the service role.
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it in the Vercel project settings and .env.local, then redeploy.' },
      { status: 500 }
    );
  }

  // Reject duplicate username up front (nicer message than a raw index error).
  const { data: existing } = await admin
    .from('profiles').select('id').ilike('username', username).maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'That username is already taken' }, { status: 409 });
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,               // no confirmation email needed
    user_metadata: { full_name },
  });
  if (createErr || !created?.user) {
    const msg = createErr?.message ?? 'Failed to create user';
    return NextResponse.json({ error: /already/i.test(msg) ? 'A user with this email already exists' : msg }, { status: 400 });
  }

  // The handle_new_user trigger creates the profile row; set its fields.
  const { error: profErr } = await admin.from('profiles').update({
    username,
    full_name: full_name || username,
    role,
    is_active: true,
  }).eq('id', created.user.id);

  if (profErr) {
    // Roll back the auth user so the admin can retry cleanly.
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: profErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
