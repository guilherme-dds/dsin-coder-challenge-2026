#!/bin/sh
set -e

db_file="${DATABASE_URL#file:}"
first_run=false
if [ ! -f "$db_file" ]; then
  first_run=true
fi

npx prisma migrate deploy

if [ "$first_run" = true ] || [ "$SEED_ON_START" = "true" ]; then
  echo "Populando o banco com dados de exemplo..."
  npx prisma db seed
fi

exec "$@"
