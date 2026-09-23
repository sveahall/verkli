#!/bin/sh
# Startar den lokala förhandsvisningen av /apply och /admin/beta-applications.
# Kör:  sh /Users/admin/verkli-apply/preview.sh
set -e
cd /Users/admin/verkli-web && . ./.env.local
cd /Users/admin/verkli-apply/apps/web
NEXT_PUBLIC_WAITLIST_ONLY=true \
NEXT_PUBLIC_SITE_URL=http://localhost:3112 \
NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY" \
SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
ADMIN_BASIC_AUTH_USER=verkli \
ADMIN_BASIC_AUTH_PASSWORD=testpass123 \
exec npx next start -p 3112
