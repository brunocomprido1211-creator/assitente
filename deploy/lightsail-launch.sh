#!/bin/bash
# Script de inicialização do Lightsail: instala Docker e sobe o assistente.
set -e
export DEBIAN_FRONTEND=noninteractive
apt-get update -y && apt-get install -y git curl
curl -fsSL https://get.docker.com | sh
git clone https://github.com/brunocomprido1211-creator/assitente /opt/assistente
install -m 755 /opt/assistente/deploy/assistente-config.sh /usr/local/bin/assistente-config
/usr/local/bin/assistente-config --auto > /var/log/assistente-setup.log 2>&1
