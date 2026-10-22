# Assistente Pessoal
Teste local: copie `.env.example` para `.env`, preencha e rode `docker compose up --build`; abra http://localhost:3000
Nuvem (Render): suba esta pasta no GitHub, crie um PostgreSQL e um Web Service (Docker) no Render,
copie a URL do banco para a variável DATABASE_URL e cole as demais variáveis do .env.

## Conversar pelo WhatsApp
1. Defina PUBLIC_URL com o endereço do app (sem barra no final).
2. Twilio > Messaging > Try it out > WhatsApp Sandbox settings > "When a message comes in":
   cole PUBLIC_URL/whatsapp, método POST. Salve.
3. Mande uma mensagem pelo WhatsApp para o número da Twilio.

## Hospedagem na AWS (Lightsail)
1. Lightsail > Create instance > Linux/Unix > OS Only > Ubuntu 24.04.
2. "Add launch script": cole o conteúdo de `deploy/lightsail-launch.sh`.
3. Plano Micro (1 GB). Crie a instância.
4. Networking: crie e anexe um Static IP; em IPv4 Firewall adicione a regra HTTPS (443).
5. Connect using SSH e rode: `sudo assistente-config` (pergunta os valores secretos).
6. Na Twilio, use o endereço "Webhook Twilio" mostrado no final.
