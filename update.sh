#!/usr/bin/env bash
# Atualiza a instalação via código-fonte para a branch principal do repositório remoto.
# Uso: ./update.sh [--backup]   (--backup faz stash das alterações locais antes de atualizar)
set -euo pipefail

BACKUP_LOCAL=0
if [ "${1:-}" = "--backup" ]; then
  BACKUP_LOCAL=1
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

log()  { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
fail() { printf 'ERRO: %s\n' "$*" >&2; exit 1; }

on_error() {
  printf '\nA atualização falhou.\n' >&2
  printf 'Nada foi perdido: use "git status" para ver o estado e ' >&2
  printf '"git stash list" para os backups locais (git stash pop restaura).\n' >&2
}
trap on_error ERR

echo "=========================================================="
echo "  Atualizando Lenovo & Moto Firmware Downloader"
echo "=========================================================="

# [1/5] Pré-requisitos
log "Verificando pré-requisitos..."
command -v git >/dev/null 2>&1 || fail "git não encontrado. Instale o git e tente novamente."
command -v bun >/dev/null 2>&1 || fail "bun não encontrado. Instale o Bun (bun.sh) e tente novamente."
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "esta pasta não é um repositório git."

# [2/5] Credenciais e estado remoto
log "Validando acesso ao repositório remoto (credenciais)..."
git ls-remote --heads origin main >/dev/null 2>&1 \
  || fail "sem acesso ao remoto 'origin'. Configure suas credenciais git (token HTTPS ou chave SSH)."

log "Buscando atualizações..."
git fetch origin main

BEHIND=$(git rev-list --count HEAD..origin/main)
if [ "$BEHIND" -eq 0 ]; then
  log "Projeto já está atualizado."
else
  log "$BEHIND commit(s) recebido(s):"
  git log --oneline HEAD..origin/main | head -20
fi

# [3/5] Alterações locais
if [ -n "$(git status --porcelain)" ]; then
  if [ "$BACKUP_LOCAL" -eq 1 ]; then
    log "Criando backup das alterações locais (git stash)..."
    git stash push -u -m "update.sh backup $(date -Iseconds)"
    log "Backup criado. Restaure com 'git stash pop' se necessário."
  else
    fail "há alterações locais não commitadas. Rode './update.sh --backup' (faz stash seguro) ou commite antes."
  fi
fi

# [4/5] Sincronização (apenas fast-forward — nunca sobrescreve histórico local)
if [ "$BEHIND" -gt 0 ]; then
  log "Aplicando atualizações (fast-forward)..."
  git merge --ff-only origin/main
fi

# [5/5] Dependências e build da interface
log "Instalando dependências (raiz)..."
bun install --frozen-lockfile
log "Instalando dependências (web)..."
(cd web && bun install --frozen-lockfile)

log "Compilando e sincronizando a interface web..."
bun run web:build
bun run tooling/build/sync-frontend.ts

trap - ERR
echo "=========================================================="
echo "  ✓ Atualização concluída com sucesso!"
echo "  Para iniciar: bun run start"
echo "=========================================================="
