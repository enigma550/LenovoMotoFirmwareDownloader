#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "  Atualizando Lenovo & Moto Firmware Downloader"
echo "=========================================================="

echo "[1/3] Baixando atualizações do GitHub..."
git fetch origin
git checkout main
git pull origin main

echo "[2/3] Verificando dependências..."
bun install

echo "[3/3] Compilando e sincronizando a interface web..."
bun run web:build
bun run tooling/build/sync-frontend.ts

echo "=========================================================="
echo "  ✓ Atualização concluída com sucesso!"
echo "  Para iniciar: bun run start"
echo "=========================================================="
