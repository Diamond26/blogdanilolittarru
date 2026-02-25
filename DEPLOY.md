# Deploy su Vercel — Blog Danilo Littarru

## Prerequisiti

- Account Vercel (https://vercel.com)
- Vercel CLI installata: `npm i -g vercel`
- Repository Git collegato a Vercel

---

## 1. Creare il Database (Vercel Postgres)

1. Vai su **Vercel Dashboard** → Il tuo progetto → **Storage** → **Create Database**
2. Seleziona **Postgres** (Neon)
3. Scegli una regione vicina ai tuoi utenti (es. `fra1` per Europa)
4. Una volta creato, Vercel aggiungerà automaticamente le variabili:
   - `POSTGRES_URL`
   - `POSTGRES_PRISMA_URL`
   - `POSTGRES_URL_NON_POOLING`
   - `POSTGRES_USER`
   - `POSTGRES_HOST`
   - `POSTGRES_PASSWORD`
   - `POSTGRES_DATABASE`

### Eseguire lo Schema SQL

1. Vai nella tab **Data** del database su Vercel
2. Apri la **Query Console**
3. Copia e incolla il contenuto di `database/schema-vercel.sql`
4. Esegui la query

### Creare l'utente Admin

Nella Query Console, esegui:

```sql
INSERT INTO users (email, password, role)
VALUES ('tuaemail@esempio.com', '$2a$12$HASH_BCRYPT_QUI', 'admin');
```

Per generare l'hash bcrypt della password:
```bash
node -e "const b=require('bcryptjs');console.log(b.hashSync('LA_TUA_PASSWORD',12))"
```

---

## 2. Configurare Vercel Blob (per upload immagini)

1. Vai su **Storage** → **Create Database** → **Blob**
2. Una volta creato, Vercel aggiungerà:
   - `BLOB_READ_WRITE_TOKEN`

---

## 3. Variabili d'Ambiente

Vai su **Settings** → **Environment Variables** e aggiungi:

| Variabile | Valore | Note |
|-----------|--------|------|
| `JWT_SECRET` | Stringa casuale di 64+ caratteri | **Obbligatorio** |
| `FRONTEND_URL` | `https://tuodominio.it` | Per CORS |
| `NODE_ENV` | `production` | Già impostato in vercel.json |
| `SMTP_HOST` | Host SMTP (es. `smtp.gmail.com`) | Per notifiche email |
| `SMTP_PORT` | `587` | Porta SMTP |
| `SMTP_USER` | Email SMTP | Account SMTP |
| `SMTP_PASS` | Password SMTP | Password o App Password |
| `NOTIFICATION_EMAIL` | `tuaemail@esempio.com` | Destinatario notifiche contatto |

Per generare un JWT_SECRET sicuro:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## 4. Deploy

### Prima volta:
```bash
cd blogdanilolittarru
vercel
```

### Deploy successivi:
```bash
vercel --prod
```

### Oppure collega il repo Git:
1. Vai su vercel.com → **New Project**
2. Importa il repository GitHub/GitLab
3. I deploy saranno automatici ad ogni push

---

## 5. File da Eliminare (non più necessari)

Dopo il deploy, puoi rimuovere questi file legacy:

```
routes/           → Vecchie route Express (sostituiti da api/)
middleware/       → Vecchi middleware Express (sostituiti da api/_lib/)
utils/            → Vecchia connessione MySQL (sostituita da @vercel/postgres)
setup.js          → Script setup MySQL
database/db.sql   → Schema MySQL (usa schema-vercel.sql)
.env              → Non necessario su Vercel (usa Environment Variables)
```

---

## 6. Struttura API Serverless

```
api/
├── _lib/               (utility condivise, NON esposti come endpoint)
│   ├── auth.js         JWT + cookie auth
│   ├── db.js           Vercel Postgres
│   ├── handler.js      CORS + routing metodi
│   ├── rate-limit.js   Rate limiting base
│   ├── security.js     Sanitizzazione + fingerprint
│   └── upload.js       Upload immagini via Vercel Blob
├── auth/
│   ├── login.js        POST /api/auth/login
│   ├── logout.js       POST /api/auth/logout
│   └── me.js           GET  /api/auth/me
├── posts/
│   ├── index.js        GET/POST /api/posts
│   ├── [param].js      GET/PUT/DELETE /api/posts/:slug_o_id
│   ├── [param]/
│   │   └── image.js    POST /api/posts/:id/image
│   └── youtube/
│       └── preview.js  GET /api/posts/youtube/preview
├── comments/
│   ├── index.js        POST /api/comments
│   ├── pending.js      GET  /api/comments/pending
│   └── [id]/
│       ├── approve.js  PATCH  /api/comments/:id/approve
│       └── index.js    DELETE /api/comments/:id
├── likes/
│   └── [postId]/
│       ├── index.js    POST /api/likes/:postId
│       └── status.js   GET  /api/likes/:postId/status
├── contacts/
│   ├── index.js        GET/POST /api/contacts
│   └── [id]/
│       ├── read.js     PATCH  /api/contacts/:id/read
│       └── index.js    DELETE /api/contacts/:id
├── admin/
│   ├── stats.js        GET /api/admin/stats
│   ├── comments.js     GET /api/admin/comments
│   ├── logs.js         GET /api/admin/logs
│   └── posts/
│       ├── index.js    GET /api/admin/posts
│       └── [id].js     GET /api/admin/posts/:id
├── visits.js           POST /api/visits
└── index.js            GET  /api (health check)
```

---

## Note sulla Sicurezza

- **CSRF**: Rimosso il meccanismo double-submit cookie. La protezione è garantita da:
  - Cookie `SameSite=Strict` (impedisce richieste cross-site)
  - CORS con origin whitelist
- **Rate Limiting**: Implementato in-memory (si resetta ad ogni cold start). Per produzione con molto traffico, considera Vercel KV
- **File Upload**: Le immagini vengono caricate su Vercel Blob (non più su filesystem locale)
- **Query SQL**: Tutte parametrizzate tramite tagged template `sql\`...\`` di @vercel/postgres
