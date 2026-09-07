#!/usr/bin/env tsx
/**
 * Generate Supabase TypeScript types from your remote project
 * 
 * Usage:
 *   npm run generate:types
 *
 * The project id comes from SUPABASE_PROJECT_ID, or is read out of
 * NEXT_PUBLIC_SUPABASE_URL.
 *
 * This writes src/lib/supabase/types.ts directly. It used to write a
 * types-generated.ts beside it and print "next step: replace types.ts with the
 * generated file" — a manual copy nobody performs, which is how types.ts came
 * to sit behind the live schema while looking authoritative.
 *
 * `--schema public,graphql_public` is not optional. The CLI defaults to
 * `public` alone and drops the graphql_public block with no warning, so
 * omitting it silently shrinks the file. That happened, which is why the
 * generated output is verified below before anything is overwritten.
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local if it exists
config({ path: resolve(process.cwd(), '.env.local') });

// Try to get project ID from env variable first
let projectId = process.env.SUPABASE_PROJECT_ID;

// If not set, try to extract from NEXT_PUBLIC_SUPABASE_URL
if (!projectId) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) {
    // Supabase URL format: https://xxxxx.supabase.co
    // Extract the project reference ID (the part before .supabase.co)
    const match = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/);
    if (match && match[1]) {
      projectId = match[1];
      console.log(`📋 Extracted project ID from NEXT_PUBLIC_SUPABASE_URL: ${projectId}`);
    }
  }
}

const outputPath = join(process.cwd(), 'src/lib/supabase/types.ts');

if (!projectId) {
  console.error(`
❌ Could not find Supabase Project ID.

Tried to find it from:
  - SUPABASE_PROJECT_ID environment variable
  - NEXT_PUBLIC_SUPABASE_URL (extracting from URL)

To generate types from your remote Supabase project:

1. Get your project ID from Supabase Dashboard:
   https://supabase.com/dashboard/project/_/settings/general
   (It's the "Reference ID" in the project settings)

2. Run one of these commands:
   
   Option A: Set env variable and run script
     SUPABASE_PROJECT_ID=your-project-id npm run generate:types
   
   Option B: Use Supabase CLI directly
     npx supabase gen types typescript --project-id your-project-id > src/lib/supabase/types-generated.ts

3. After generation, replace src/lib/supabase/types.ts with types-generated.ts
`);
  process.exit(1);
}

try {
  console.log(`🔄 Generating types from project: ${projectId}...`);
  
  const types = execSync(
    `npx supabase gen types typescript --project-id ${projectId} --schema public,graphql_public`,
    { encoding: 'utf-8', stdio: 'pipe', maxBuffer: 32 * 1024 * 1024 }
  );

  // Refuse to overwrite on a partial or failed generation. An empty or
  // truncated file typechecks as "no tables", so every `as never` cast in the
  // codebase keeps compiling and the loss shows up as runtime 400s instead.
  if (!types.includes('export type Json')) {
    throw new Error('output does not contain `export type Json` — refusing to overwrite types.ts');
  }
  if (!types.includes('graphql_public:')) {
    throw new Error('output is missing the graphql_public schema — refusing to overwrite types.ts');
  }

  const header = `// GENERATED FILE — DO NOT EDIT.
//
// Regenerate:
//   cd apps/web && npm run generate:types
//
// Two things that make this fail quietly:
//   - \`--schema\` is not optional. The default is \`public\` alone, which silently
//     drops the graphql_public block below. The script passes it; a hand-run
//     command must too.
//   - The CLI must be authenticated as the account that owns the verkli project.
//     A token for the other account returns "your account does not have the
//     necessary privileges" from the type-generation endpoint. Pass one via
//     SUPABASE_ACCESS_TOKEN rather than re-running \`supabase login\`, so the
//     existing login is left alone.
//
// Manual edits will be overwritten on the next regeneration.

`;

  writeFileSync(outputPath, header + types);

  console.log(`✅ types.ts regenerated from project ${projectId} (public + graphql_public)`);
  console.log(`   Review the diff before committing: git diff ${outputPath}`);
  
} catch (error) {
  console.error('❌ Failed to generate types:', error);
  console.error('\n💡 Make sure you are logged in to Supabase CLI:');
  console.error('   npx supabase login');
  process.exit(1);
}
