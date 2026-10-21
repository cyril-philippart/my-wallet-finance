CREATE TABLE app_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CHECK(expires_at > created_at)
);
CREATE INDEX app_sessions_active_user ON app_sessions(user_id,expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE auth_login_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  login text NOT NULL,
  ip_hash char(64) NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  succeeded boolean NOT NULL
);
CREATE INDEX auth_login_attempts_window ON auth_login_attempts(login,ip_hash,attempted_at DESC);
