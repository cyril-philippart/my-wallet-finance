#!/bin/sh
set -eu

psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  migration_name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
SQL

for migration in /migrations/*.sql; do
  name="$(basename "$migration")"
  applied="$(psql -Atqc "SELECT 1 FROM schema_migrations WHERE migration_name = '$name'")"
  if [ "$applied" = "1" ]; then
    echo "Migration déjà appliquée : $name"
    continue
  fi

  echo "Application de la migration : $name"
  {
    echo "BEGIN;"
    cat "$migration"
    printf "\nINSERT INTO schema_migrations(migration_name) VALUES ('%s');\n" "$name"
    echo "COMMIT;"
  } | psql -v ON_ERROR_STOP=1
done

