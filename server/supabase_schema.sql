-- ============================================================
--  The Hybrid Engine — Supabase Database Schema
--  Supabase Dashboard → SQL Editor → এই পুরো স্ক্রিপ্ট রান করো
-- ============================================================

-- ──────────────────────────────────────────────
--  1. PROFILES TABLE
--  (auth.users এর সাথে linked — auto created on signup)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username        TEXT UNIQUE NOT NULL,
  display_name    TEXT NOT NULL,
  avatar_url      TEXT DEFAULT NULL,        -- ImgBB লিংক
  fcm_token       TEXT DEFAULT NULL,        -- Push notification token
  role            TEXT DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
  badge_id        TEXT DEFAULT NULL,        -- Assigned badge ID
  is_banned       BOOLEAN DEFAULT FALSE,
  bio             TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  last_seen       TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────
--  2. BADGES TABLE
--  Admin প্যানেল থেকে badge তৈরি করবে
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.badges (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT DEFAULT '',
  svg_code        TEXT NOT NULL,            -- SVG badge কোড
  color           TEXT DEFAULT '#4F46E5',   -- Badge accent color
  permissions     JSONB DEFAULT '{
    "max_file_size_mb": 100,
    "can_create_group": false,
    "can_moderate": false,
    "priority_support": false,
    "verified": false
  }'::JSONB,
  created_by      UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────
--  3. OFFLINE MESSAGES TABLE (lightweight tracker)
--  মূল ডেটা file.io + HF local fs তে থাকে
--  এই টেবিল শুধু metadata রাখে (optional)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.offline_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id       UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id     UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  entry_id        TEXT NOT NULL,            -- HF buffer entry ID
  type            TEXT DEFAULT 'text',      -- 'text' | 'file'
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'lost')),
  original_timestamp TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────
--  4. AUTO-CREATE PROFILE ON SIGNUP
--  auth.users তে নতুন ইউজার এলে profile auto তৈরি হয়
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || LEFT(NEW.id::TEXT, 8)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', 'New User'),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NULL)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ──────────────────────────────────────────────
--  5. AUTO-UPDATE updated_at
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

-- ──────────────────────────────────────────────
--  6. ROW LEVEL SECURITY (RLS)
-- ──────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offline_messages ENABLE ROW LEVEL SECURITY;

-- Profiles: সবাই পড়তে পারবে, শুধু নিজেরটা লিখতে পারবে
CREATE POLICY "profiles_select_all" ON public.profiles
  FOR SELECT USING (TRUE);

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Badges: সবাই পড়তে পারবে, শুধু admin লিখতে পারবে
CREATE POLICY "badges_select_all" ON public.badges
  FOR SELECT USING (TRUE);

CREATE POLICY "badges_admin_only" ON public.badges
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Offline messages: শুধু sender ও receiver দেখতে পারবে
CREATE POLICY "offline_messages_own" ON public.offline_messages
  FOR SELECT USING (
    auth.uid() = sender_id OR auth.uid() = receiver_id
  );

CREATE POLICY "offline_messages_insert" ON public.offline_messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- ──────────────────────────────────────────────
--  7. INDEXES (Performance)
-- ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_badge_id ON public.profiles(badge_id);
CREATE INDEX IF NOT EXISTS idx_offline_messages_receiver ON public.offline_messages(receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_offline_messages_sender ON public.offline_messages(sender_id);

-- ──────────────────────────────────────────────
--  8. DEFAULT BADGES (Seed Data)
-- ──────────────────────────────────────────────
INSERT INTO public.badges (id, name, description, svg_code, color, permissions) VALUES
(
  'verified',
  'Verified',
  'Verified user badge',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#4F46E5"><path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/></svg>',
  '#4F46E5',
  '{"max_file_size_mb": 500, "can_create_group": true, "can_moderate": false, "priority_support": true, "verified": true}'
),
(
  'moderator',
  'Moderator',
  'Community moderator badge',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#059669"><path fill-rule="evenodd" d="M11.484 2.17a.75.75 0 011.032 0 11.209 11.209 0 007.877 3.08.75.75 0 01.722.515 12.74 12.74 0 01.635 3.985c0 5.942-4.064 10.933-9.563 12.348a.749.749 0 01-.374 0C6.314 20.683 2.25 15.692 2.25 9.75c0-1.39.223-2.73.635-3.985a.75.75 0 01.722-.516l.143.001c2.996 0 5.718-1.17 7.734-3.08zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zM12 15a.75.75 0 000 1.5.75.75 0 000-1.5z" clip-rule="evenodd"/></svg>',
  '#059669',
  '{"max_file_size_mb": 2000, "can_create_group": true, "can_moderate": true, "priority_support": true, "verified": false}'
),
(
  'admin',
  'Admin',
  'System administrator badge',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#DC2626"><path fill-rule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-2.625 6c-.54 0-.828.419-.936.634a1.96 1.96 0 00-.189.866c0 .298.059.605.189.866.108.215.395.634.936.634.54 0 .828-.419.936-.634.13-.26.189-.568.189-.866 0-.298-.059-.605-.189-.866-.108-.215-.395-.634-.936-.634zm4.314.634c.108-.215.395-.634.936-.634.54 0 .828.419.936.634.13.26.189.568.189.866 0 .298-.059.605-.189.866-.108.215-.395.634-.936.634-.54 0-.828-.419-.936-.634a1.96 1.96 0 01-.189-.866c0-.298.059-.605.189-.866zm2.023 6.828a.75.75 0 10-1.06-1.06 3.75 3.75 0 01-5.304 0 .75.75 0 00-1.06 1.06 5.25 5.25 0 007.424 0z" clip-rule="evenodd"/></svg>',
  '#DC2626',
  '{"max_file_size_mb": 10000, "can_create_group": true, "can_moderate": true, "priority_support": true, "verified": true}'
)
ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────
--  স্কিমা তৈরি সম্পন্ন!
-- ──────────────────────────────────────────────
SELECT 'Schema created successfully! ✅' AS status;
