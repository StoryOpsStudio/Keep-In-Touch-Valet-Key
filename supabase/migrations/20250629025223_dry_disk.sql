/*
  # Fix Profile Insert Policy for User Registration

  1. Problem
    - User registration fails with "Database error saving new user"
    - The handle_new_user() trigger cannot insert into profiles table
    - Missing RLS policy prevents new users from creating their profile

  2. Solution
    - Add INSERT policy that allows authenticated users to create their own profile
    - Policy uses auth.uid() = id to ensure users can only create their own record

  3. Security
    - Maintains data isolation between users
    - Only allows users to insert records with their own user ID
*/

-- Add the missing INSERT policy for profiles table
CREATE POLICY "Users can insert their own profile"
  ON public.profiles 
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Verify all required policies exist for profiles table
-- (This is informational - the policies should already exist from previous migration)

-- Expected policies for profiles:
-- 1. "Users can read own profile" - FOR SELECT
-- 2. "Users can update own profile" - FOR UPDATE  
-- 3. "Users can insert own profile" - FOR INSERT (existing, but may need the new one above)
-- 4. "Users can insert their own profile" - FOR INSERT (this new one fixes the trigger)

-- The trigger function handle_new_user() will now be able to successfully
-- insert new profile records when users register.