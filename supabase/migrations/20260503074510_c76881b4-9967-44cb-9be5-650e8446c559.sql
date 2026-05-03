-- 1. Add nullable username column
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text;

-- 2. Case-insensitive unique index (only when filled)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique_idx
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

-- 3. Validation trigger (force lowercase, format check)
CREATE OR REPLACE FUNCTION public.validate_profile_username()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.username IS NULL OR length(btrim(NEW.username)) = 0 THEN
    NEW.username := NULL;
    RETURN NEW;
  END IF;

  -- Normalize to lowercase, trim
  NEW.username := lower(btrim(NEW.username));

  -- No spaces & allowed character set, length 3–32
  IF NEW.username !~ '^[a-z0-9_-]{3,32}$' THEN
    RAISE EXCEPTION 'invalid_username: only lowercase letters, numbers, dash, underscore (3–32 chars)';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_profile_username_trg ON public.profiles;
CREATE TRIGGER validate_profile_username_trg
  BEFORE INSERT OR UPDATE OF username ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_profile_username();