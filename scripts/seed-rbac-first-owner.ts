/**
 * Seed RBAC: Assign first owner to organizations that have none.
 * Run once after rbac-schema.sql so existing orgs have an owner and RLS allows access.
 *
 * Usage:
 *   FIRST_OWNER_EMAIL=owner@example.com npx ts-node --project scripts/tsconfig.json scripts/seed-rbac-first-owner.ts
 *
 * Env:
 *   FIRST_OWNER_EMAIL - Email of the user to make owner (must exist in auth.users)
 *   NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

const { config } = require('dotenv');
const { resolve } = require('path');
config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), 'apps/web/.env.local') });

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const firstOwnerEmail = process.env.FIRST_OWNER_EMAIL;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!firstOwnerEmail) {
  console.error('Missing FIRST_OWNER_EMAIL. Example: FIRST_OWNER_EMAIL=you@example.com npx ts-node scripts/seed-rbac-first-owner.ts');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

async function main() {
  const { data: listData, error: usersError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (usersError) {
    console.error('Failed to list users:', usersError.message);
    process.exit(1);
  }
  const userList = listData?.users ?? [];
  const email = (firstOwnerEmail ?? '').trim().toLowerCase();
  const user = userList.find((u: { email?: string }) => (u.email || '').toLowerCase() === email);
  if (!user) {
    console.error(`No auth user found with email: ${email}. Create the user in Supabase Auth first.`);
    process.exit(1);
  }

  const { data: orgs, error: orgsError } = await supabase.from('organizations').select('id, name');
  if (orgsError) {
    console.error('Failed to list organizations:', orgsError.message);
    process.exit(1);
  }
  if (!orgs || orgs.length === 0) {
    console.log('No organizations found. Nothing to do.');
    return;
  }

  let added = 0;
  for (const org of orgs) {
    const { data: existing } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (existing) {
      console.log(`Already member: ${org.name} (${org.id})`);
      continue;
    }
    const { error: insertErr } = await supabase.from('organization_members').insert({
      organization_id: org.id,
      user_id: user.id,
      role: 'owner',
    });
    if (insertErr) {
      console.error(`Failed to add owner to ${org.name}:`, insertErr.message);
      continue;
    }
    console.log(`Added owner to: ${org.name} (${org.id})`);
    added++;
  }
  console.log(`Done. Added as owner to ${added} organization(s).`);
}

main();
