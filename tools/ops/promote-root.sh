#!/usr/bin/env bash
# Promove um usuário a administrador raiz (roteiro do dono da implantação).
#
# O gatilho do banco só aceita criar, apagar ou mudar o papel de/para ROOT dentro de uma transação com
# `SET LOCAL gefinc.allow_root_change = 'on'`; o painel nunca faz isso. Este script é a conveniência
# desse roteiro: confere o e-mail, mostra o que será alterado, pede confirmação e roda
# BEGIN; SET LOCAL ...; UPDATE ...; COMMIT;
#
# O e-mail vai como variável do psql (`-v email=...`, lida com :'email'), nunca concatenado ao SQL, e o
# roteiro segue pela entrada padrão (o psql não interpola variáveis em `-c`).
#
# Uso:   tools/ops/promote-root.sh [--yes] <email>
# Ambiente (opcionais): DB_USER (padrão gefinc), POSTGRES_DB (padrão gefinc), COMPOSE_FILE.
set -euo pipefail

usage() {
  echo "Uso: $0 [--yes] <email>" >&2
  exit 2
}

assume_yes=false
if [[ "${1:-}" == "--yes" ]]; then
  assume_yes=true
  shift
fi
[[ $# -eq 1 ]] || usage
email="$1"

if [[ ! "$email" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$ ]]; then
  echo "E-mail inválido." >&2
  exit 2
fi

cd "$(dirname "${BASH_SOURCE[0]}")/../.."
db_user="${DB_USER:-gefinc}"
db_name="${POSTGRES_DB:-gefinc}"

psql_run() {
  docker compose exec -T postgres psql -U "$db_user" -d "$db_name" -X -q -tA \
    -v ON_ERROR_STOP=1 -v "email=$email" "$@"
}

current="$(psql_run <<'SQL'
SELECT id || ' ' || role FROM users WHERE lower(email) = lower(:'email');
SQL
)"
if [[ -z "$current" ]]; then
  echo "Nenhum usuário com esse e-mail. Cadastre a conta primeiro." >&2
  exit 1
fi
read -r user_id current_role <<<"$current"
if [[ "$current_role" == "ROOT" ]]; then
  echo "O usuário $user_id já é administrador raiz. Nada a fazer."
  exit 0
fi

echo "Usuário $user_id (papel atual: $current_role) será promovido a administrador raiz."
if [[ "$assume_yes" != true ]]; then
  read -r -p "Confirmar? [s/N] " answer
  [[ "$answer" == "s" || "$answer" == "S" ]] || { echo "Cancelado."; exit 1; }
fi

updated="$(psql_run <<'SQL'
BEGIN;
SET LOCAL gefinc.allow_root_change = 'on';
UPDATE users SET role = 'ROOT' WHERE lower(email) = lower(:'email') RETURNING id;
COMMIT;
SQL
)"
if [[ ! "$updated" =~ ^[0-9]+$ ]]; then
  echo "A promoção não foi aplicada." >&2
  exit 1
fi
echo "Pronto: o usuário $updated é administrador raiz. Vale na próxima requisição dele."
