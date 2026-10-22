# Assistente Pessoal
Teste local: copie `.env.example` para `.env`, preencha e rode `docker compose up --build`; abra http://localhost:3000
Nuvem (Render): suba esta pasta no GitHub, crie um PostgreSQL e um Web Service (Docker) no Render,
copie a URL do banco para a variável DATABASE_URL e cole as demais variáveis do .env.

## Conversar pelo WhatsApp
1. Defina PUBLIC_URL com o endereço do app (sem barra no final).
2. Twilio > Messaging > Try it out > WhatsApp Sandbox settings > "When a message comes in":
   cole PUBLIC_URL/whatsapp, método POST. Salve.
3. Mande uma mensagem pelo WhatsApp para o número da Twilio.
