#!/bin/bash
# Configurador do assistente. Uso: sudo assistente-config
set -e
[ "$(id -u)" = 0 ] || exec sudo "$0" "$@"
cd /opt/assistente
ENV=/opt/assistente/.env
touch "$ENV"; chmod 600 "$ENV"
get(){ grep "^$1=" "$ENV" | head -1 | cut -d= -f2- | sed "s/^'//; s/'\$//"; }
setv(){ grep -v "^$1=" "$ENV" > "$ENV.tmp" || true; printf "%s='%s'\n" "$1" "$2" >> "$ENV.tmp"; mv "$ENV.tmp" "$ENV"; chmod 600 "$ENV"; }
ask(){ local k=$1 msg=$2 secret=$3 v cur; cur=$(get "$k")
  while true; do
    [ -n "$cur" ] && hint=" [Enter mantém o atual]" || hint=""
    if [ "$secret" = 1 ]; then read -rsp "$msg$hint: " v; echo; else read -rp "$msg$hint: " v; fi
    v=$(printf '%s' "$v" | tr -d '\r' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
    case "$v" in *"'"*) echo "  O valor não pode conter aspas simples ('). Tente de novo."; continue;; esac
    [ -z "$v" ] && [ -n "$cur" ] && return
    [ -n "$v" ] && { setv "$k" "$v"; return; }
    echo "  Este campo é obrigatório."
  done; }

[ "$1" = "--auto" ] || git pull -q || true
# Banco de dados (gerado automaticamente)
[ -n "$(get POSTGRES_PASSWORD)" ] || setv POSTGRES_PASSWORD "$(openssl rand -hex 24)"
setv POSTGRES_DB assistente
setv DATABASE_URL "postgres://postgres:$(get POSTGRES_PASSWORD)@db:5432/assistente"
# Endereço público com HTTPS automático
IP=$(curl -fsS https://checkip.amazonaws.com | tr -d '[:space:]')
setv DOMAIN "${IP//./-}.sslip.io"
setv PUBLIC_URL "https://$(get DOMAIN)"
[ -n "$(get APP_USER)" ] || setv APP_USER admin
[ -n "$(get TZ_NAME)" ] || setv TZ_NAME America/Sao_Paulo
[ -n "$(get TWILIO_FROM)" ] || setv TWILIO_FROM +14155238886

if [ "$1" != "--auto" ]; then
  echo "=== Configuração do Assistente (cole cada valor e tecle Enter) ==="
  ask APP_PASSWORD "Senha para entrar no app (escolha uma forte)" 1
  ask ANTHROPIC_API_KEY "Chave da Anthropic (sk-ant-...)" 1
  ask TWILIO_SID "Twilio Account SID (AC...)" 0
  ask TWILIO_TOKEN "Twilio Auth Token" 1
  ask TWILIO_FROM "Número do sandbox Twilio, com + (padrão +14155238886)" 0
  ask WHATSAPP_TO "Seu WhatsApp, ex.: +5515999999999" 0
fi

docker compose -f deploy/docker-compose.aws.yml up -d --build
echo
echo "Pronto! App:     $(get PUBLIC_URL)"
echo "Webhook Twilio:  $(get PUBLIC_URL)/whatsapp"
