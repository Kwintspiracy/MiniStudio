-- Run this in the Supabase Dashboard SQL Editor

-- 1. Ensure the user exists in the entitlements table and set them to unlimited
INSERT INTO public.user_entitlements (user_id, is_unlimited)
SELECT id, true 
FROM auth.users 
WHERE email = 'quentinbeau@gmail.com'
ON CONFLICT (user_id) DO UPDATE 
SET is_unlimited = true;

-- 2. Verify the change
SELECT e.is_unlimited, u.email 
FROM public.user_entitlements e
JOIN auth.users u ON e.user_id = u.id
WHERE u.email = 'quentinbeau@gmail.com';
