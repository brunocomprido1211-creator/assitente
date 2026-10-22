import express from 'express';
import pg from 'pg';
import cron from 'node-cron';
import crypto from 'crypto';

const { DATABASE_URL, ANTHROPIC_API_KEY, APP_USER = 'admin', APP_PASSWORD,
  TZ_NAME = 'America/Sao_Paulo', TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM, WHATSAPP_TO, PUBLIC_URL = '',
  PORT = 3000 } = process.env;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const db = new pg.Pool({ connectionString: DATABASE_URL });

await db.query(`
  create table if not exists events (
    id serial primary key, title text not null,
    starts_at timestamptz not null, created_at timestamptz default now());
  create table if not exists reminders (
    id serial primary key, event_id int references events(id) on delete cascade,
    remind_at timestamptz not null, sent boolean default false);
  create table if not exists wa_history (
    id serial primary key, role text not null, content text not null, created_at timestamptz default now());
  create index if not exists reminders_due on reminders (sent, remind_at);`);

const fmt = (d) => new Date(d).toLocaleString('pt-BR',
  { timeZone: TZ_NAME, dateStyle: 'full', timeStyle: 'short' });

const app = express();
app.use(express.json());
// Webhook do WhatsApp (Twilio): validado por assinatura, sem login básico
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
app.post('/whatsapp', express.urlencoded({ extended: false }), async (req, res) => {
  const sig = String(req.headers['x-twilio-signature'] || '');
  const data = PUBLIC_URL + '/whatsapp' + Object.keys(req.body).sort().map(k => k + req.body[k]).join('');
  const exp = crypto.createHmac('sha1', TWILIO_TOKEN || '').update(data).digest('base64');
  const ok = sig.length === exp.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp));
  if (!ok || req.body.From !== `whatsapp:${WHATSAPP_TO}`) return res.sendStatus(403);
  let reply;
  try {
    const text = String(req.body.Body || '').slice(0, 1000).trim();
    if (!text) reply = 'Por enquanto só entendo mensagens de texto.';
    else {
      const h = await db.query("select role, content from wa_history where created_at > now() - interval '2 hours' order by id desc limit 6");
      reply = await runChat(text, h.rows.reverse());
      await db.query('insert into wa_history (role, content) values ($1,$2),($3,$4)', ['user', text, 'assistant', reply]);
    }
  } catch (e) { console.error(e); reply = 'Ops, tive um problema técnico. Tente de novo.'; }
  res.type('text/xml').send(`<Response><Message>${esc(reply)}</Message></Response>`);
});

// Login obrigatório (fecha tudo se APP_PASSWORD não estiver definida)
app.use((req, res, next) => {
  const raw = Buffer.from((req.headers.authorization || '').slice(6), 'base64').toString();
  const i = raw.indexOf(':');
  if (APP_PASSWORD && raw.slice(0, i) === APP_USER && raw.slice(i + 1) === APP_PASSWORD) return next();
  res.set('WWW-Authenticate', 'Basic realm="Assistente"').status(401).send('Login necessário');
});
app.use(express.static('public'));

app.get('/api/events', async (_req, res) => {
  const { rows } = await db.query('select id, title, starts_at from events order by starts_at');
  res.json(rows);
});

async function runChat(message, history) {
    const { rows } = await db.query(
      "select id, title, starts_at from events where starts_at > now() - interval '1 day' order by starts_at limit 50");
    const list = rows.map(e => `#${e.id} ${e.title} - ${fmt(e.starts_at)}`).join('\n') || '(nenhum)';
    const system = `Você é um assistente pessoal brasileiro, simpático e objetivo.
Agora: ${fmt(new Date())} (fuso ${TZ_NAME}, UTC-03:00).
Compromissos atuais:
${list}

Responda APENAS com JSON válido, sem texto fora dele:
{"reply":"resposta curta em português","actions":[
 {"type":"create","title":"...","start":"YYYY-MM-DDTHH:mm:00-03:00","remind_minutes_before":[1440,60]},
 {"type":"cancel","id":0}]}
Regras: se faltar data ou hora, pergunte em "reply" e use "actions":[]. Se o usuário não pedir
lembretes específicos, use [1440,60]. Para remarcar, faça cancel + create. Datas relativas ("terça") são sempre futuras.`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 800, system,
        messages: [...history, { role: 'user', content: message }] }),
    });
    if (!r.ok) throw new Error(await r.text());
    const text = (await r.json()).content.map(c => c.text || '').join('')
      .replace(/```json|```/g, '').trim();
    const out = JSON.parse(text);

    for (const a of out.actions || []) {
      if (a.type === 'create') {
        const start = new Date(a.start);
        if (isNaN(start)) continue;
        const ev = await db.query('insert into events (title, starts_at) values ($1,$2) returning id', [a.title, start]);
        for (const min of a.remind_minutes_before || [1440, 60]) {
          const at = new Date(start.getTime() - min * 60000);
          if (at > new Date()) await db.query('insert into reminders (event_id, remind_at) values ($1,$2)', [ev.rows[0].id, at]);
        }
      } else if (a.type === 'cancel') {
        await db.query('delete from events where id = $1', [a.id]);
      }
    }
    return out.reply;
}

app.post('/api/chat', async (req, res) => {
  try {
    const history = (req.body.history || []).slice(-6)
      .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.content).slice(0, 1000) }));
    res.json({ reply: await runChat(String(req.body.message || '').slice(0, 1000), history) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ reply: 'Ops, tive um problema técnico. Tente de novo.' });
  }
});

async function sendWhatsApp(body) {
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: `whatsapp:${TWILIO_FROM}`, To: `whatsapp:${WHATSAPP_TO}`, Body: body }),
  });
  if (!r.ok) throw new Error(await r.text());
}

// A cada minuto: envia lembretes vencidos
cron.schedule('* * * * *', async () => {
  const { rows } = await db.query(
    `select r.id, e.title, e.starts_at from reminders r join events e on e.id = r.event_id
     where not r.sent and r.remind_at <= now() order by r.remind_at limit 20`);
  for (const r of rows) {
    try {
      await sendWhatsApp(`⏰ Lembrete: ${r.title}\n${fmt(r.starts_at)}`);
      await db.query('update reminders set sent = true where id = $1', [r.id]);
    } catch (e) { console.error('Falha ao enviar lembrete', r.id, e.message); }
  }
});

app.listen(PORT, () => console.log('Rodando na porta', PORT));
