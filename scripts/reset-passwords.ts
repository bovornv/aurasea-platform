import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env') })
config({ path: resolve(process.cwd(), 'apps/web/.env.local') })

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error('Missing Supabase env. Set in .env or apps/web/.env.local:')
  console.error('  NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL')
  console.error('  SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

const users = [
  "accmanager@crystalresort.com",
  "fbmanager@crystalresort.com",
  "accstaff@crystalresort.com",
  "fbstaff@crystalresort.com",
  "manager@crystalresort.com",
  "viewer@crystalresort.com",
  "bovorn@gmail.com"
]

async function resetPasswords() {
  for (const email of users) {
    const { data: userData } = await supabase.auth.admin.listUsers()

    const user = userData.users.find(u => u.email === email)

    if (!user) {
      console.log("User not found:", email)
      continue
    }

    await supabase.auth.admin.updateUserById(user.id, {
      password: "Test1234!"
    })

    console.log("Password reset:", email)
  }
}

resetPasswords()