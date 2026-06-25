#!/usr/bin/env bash
#
# Backup local sob demanda do banco (mesma lógica do workflow de CI).
# Gera um dump criptografado (GPG/AES-256) — nunca grava o dump em claro.
#
# Uso:
#   export DB_URL="postgresql://...session-pooler..."   # Session pooler (IPv4)
#   export BACKUP_PASSPHRASE="sua-senha-forte"
#   ./scripts/backup-db.sh [pasta-de-saida]
#
# Requisitos: docker (usa a imagem postgres:17-alpine) e gpg.
# Restauração: ver docs/06-QUALIDADE-FASE8.md.

set -euo pipefail

OUT_DIR="${1:-backups}"

if [ -z "${DB_URL:-}" ]; then
  echo "Erro: defina a variável DB_URL (connection string do Session pooler)." >&2
  exit 1
fi
if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
  echo "Erro: defina a variável BACKUP_PASSPHRASE." >&2
  exit 1
fi

mkdir -p "${OUT_DIR}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
plain="${OUT_DIR}/gaveta-${stamp}.sql.gz"
enc="${plain}.gpg"

echo "→ Gerando dump (pg_dump via Postgres 17)…"
docker run --rm -e DB_URL postgres:17-alpine \
  sh -c 'pg_dump --no-owner --no-privileges --format=plain "$DB_URL"' \
  | gzip -9 > "${plain}"

echo "→ Criptografando (AES-256)…"
gpg --batch --yes --pinentry-mode loopback \
  --passphrase "${BACKUP_PASSPHRASE}" \
  --cipher-algo AES256 --symmetric \
  --output "${enc}" "${plain}"

rm -f "${plain}"
echo "✓ Backup criptografado em: ${enc}"
