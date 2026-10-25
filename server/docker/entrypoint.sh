#!/bin/sh
set -e

# Caminho do arquivo SQLite a partir de DATABASE_URL (file:/data/fogo.db).
db_file="${DATABASE_URL#file:}"
first_run=false
if [ ! -f "$db_file" ]; then
  first_run=true
fi

npx prisma migrate deploy

# O seed apaga e recria todos os dados: roda só na criação do banco,
# ou sempre que SEED_ON_START=true.
if [ "$first_run" = true ] || [ "$SEED_ON_START" = "true" ]; then
  echo "Populando o banco com dados de exemplo..."
  npx prisma db seed
fi

exec "$@"
