#!/bin/bash
# Script de deploy para OCI Free Tier
# Uso: ./deploy.sh
set -e

echo "==> Buildando e subindo os containers de produção..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

echo "==> Aguardando backend inicializar..."
sleep 5

echo "==> Status dos containers:"
docker compose ps

echo ""
echo "Portal disponível em http://$(curl -s ifconfig.me)"
