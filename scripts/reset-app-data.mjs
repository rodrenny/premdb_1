import { createClient } from '@supabase/supabase-js'

function env(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

function hasArg(flag) {
  return process.argv.includes(flag)
}

async function wipeTable(supabase, table, idCol = 'id') {
  const { error } = await supabase.from(table).delete().not(idCol, 'is', null)
  if (error) {
    throw new Error(`${table}: ${error.message}`)
  }
}

async function main() {
  if (!hasArg('--yes')) {
    console.error(
      'Refusing to run without --yes. This command permanently deletes app data.',
    )
    process.exit(1)
  }

  const keepProfiles = hasArg('--keep-profiles')
  const url = env('NEXT_PUBLIC_SUPABASE_URL')
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Dependency-safe order (children first, parents last).
  await wipeTable(supabase, 'score_events')
  await wipeTable(supabase, 'settlements')
  await wipeTable(supabase, 'predictions')
  await wipeTable(supabase, 'movies')

  if (!keepProfiles) {
    await wipeTable(supabase, 'profiles')
  }

  console.log(
    keepProfiles
      ? 'Reset complete: score_events, settlements, predictions, movies wiped (profiles kept).'
      : 'Reset complete: score_events, settlements, predictions, movies, profiles wiped.',
  )
}

main().catch((err) => {
  console.error(`Reset failed: ${err.message}`)
  process.exit(1)
})
