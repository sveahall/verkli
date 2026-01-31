-- Rename role value from 'writer' to 'author' everywhere
-- 1. Update existing data
UPDATE public.profiles SET role = 'author' WHERE role = 'writer';

-- 2. Drop existing check constraint (name from 00004_create_profiles)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- 3. Add new check constraint with 'author' instead of 'writer'
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('author', 'reader'));

-- 4. Update default for new rows
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'author';
