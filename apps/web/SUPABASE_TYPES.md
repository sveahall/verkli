# Supabase Type Generation Guide

## Overview

This project uses **auto-generated TypeScript types** from your Supabase database schema instead of manually maintained types. This ensures your types are always in sync with your database.

## Quick Start

### Option 1: Generate from Remote Project (Recommended)

1. **Get your Supabase Project ID:**
   - Go to [Supabase Dashboard](https://supabase.com/dashboard)
   - Select your project
   - Go to Settings → General
   - Copy the "Reference ID" (this is your project ID)

2. **Generate types:**
   ```bash
   SUPABASE_PROJECT_ID=your-project-id npm run generate:types
   ```

3. **Replace the old types file:**
   ```bash
   mv src/lib/supabase/types-generated.ts src/lib/supabase/types.ts
   ```

### Option 2: Generate from Local Database

If you're running Supabase locally:

```bash
npx supabase gen types typescript --local > src/lib/supabase/types-generated.ts
mv src/lib/supabase/types-generated.ts src/lib/supabase/types.ts
```

### Option 3: Direct CLI Command

```bash
npx supabase gen types typescript --project-id your-project-id > src/lib/supabase/types.ts
```

## When to Regenerate

Regenerate types whenever you:
- ✅ Add/modify/remove database tables
- ✅ Change column types or constraints
- ✅ Add new migrations
- ✅ Update your database schema in any way

## Best Practices

1. **Never edit `types.ts` manually** - it will be overwritten on next generation
2. **Commit generated types** to git - they're part of your codebase
3. **Regenerate after migrations** - keep types in sync with schema
4. **Use the script** (`npm run generate:types`) for consistency

## Troubleshooting

### "Not logged in" error
```bash
npx supabase login
```

### "Project not found" error
- Double-check your project ID from the dashboard
- Make sure you're logged in to the correct Supabase account

### Local generation fails
- Make sure Supabase is running locally: `npx supabase start`
- Or use remote generation instead (Option 1)

## Migration from Manual Types

The old manual `types.ts` has been replaced with this auto-generation workflow. The generated types will have the same structure, so your existing code should work without changes.
