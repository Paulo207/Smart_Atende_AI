#!/bin/sh

echo "🚀 Iniciando ambiente Docker do SmartAtende AI..."

# Força sincronização do banco de dados (Cria tabelas se não existirem)
echo "📦 Rodando Prisma DB Push..."
npx prisma db push

# Inicia a aplicação
echo "🌐 Iniciando servidor Node.js..."
node server.js
