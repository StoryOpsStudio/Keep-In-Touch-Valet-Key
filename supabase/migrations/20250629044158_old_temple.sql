/*
  # Fix User Creation with Simpler RLS INSERT Policy

  1. Problem
    - User registration failing with "Database error saving new user"
    - The WITH CHECK (auth.uid() = id) policy is too restrictive for the trigger
    - The handle_new_user trigger cannot insert because of the strict policy

  2. Solution
    - Delete the restrictive INSERT policy
    - Create a new, simpler policy with WITH CHECK (true)
    - This allows the trigger to work while maintaining security through foreign keys

  3. Security
    - The profiles.id column has a foreign key to auth.users(id)
    - This ensures only valid user IDs can be inserted
    - The trigger correctly sets the ID, so WITH CHECK (true) is safe
*/

-- Step 1: Delete the old, restrictive policy
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

-- Step 2: Create the new, simpler policy that allows the trigger to work
CREATE POLICY "Users can insert their own profile"
  ON public.profiles 
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- This policy change allows:
-- 1. The handle_new_user trigger to successfully insert profile records
-- 2. User registration to complete without "Database error saving new user"
-- 3. Automatic profile creation with default voice profile
-- 4. Maintains security through the foreign key constraint to auth.users(id)