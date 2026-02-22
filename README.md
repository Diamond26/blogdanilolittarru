# Danilo Littarru — Sito Professionale & Blog
## Guida al Deploy su Vercel

---

## 📁 Struttura del Progetto

```
danilo-littarru/
├── api/
│   └── index.js             ← Entry point Express (serverless Vercel)
├── database/
│   └── schema.sql           ← Schema completo MySQL
├── middleware/
│   ├── auth.js              ← JWT + cookie HTTPOnly
│   └── security.js          ← Sanitizzazione, slug, fingerprint
├── routes/
│   ├── auth.js              ← Login, logout, /me
│   ├── posts.js             ← CRUD articoli + upload immagini
│   ├── comments.js          ← Commenti threaded + moderazione
│   ├── likes.js             ← Sistema like fingerprint
│   └── admin.js             ← Dashboard statistiche
├── utils/
│   └── db.js                ← Pool MySQL con query parametrizzate
├── public/
│   ├── index.html           ← SPA principale
│   ├── admin.html           ← Pannello admin (nascosto)
│   ├── css/
│   │   ├── main.css         ← Stile sito pubblico
│   │   └── admin.css        ← Stile pannello admin
│   ├── js/
│   │   ├── app.js           ← JavaScript SPA pubblica
│   │   └── admin.js         ← JavaScript dashboard admin
│   └── uploads/             ← Immagini caricate (gitignored)
├── setup.js                 ← Script creazione admin
├── package.json
├── vercel.json
├── .env.example
└── .gitignore
```

---

## 🔒 Sicurezza Implementata

| Protezione | Implementazione |
|---|---|
| SQL Injection | Query parametrizzate mysql2 |
| XSS | DOMPurify server-side + CSP headers |
| CSRF | SameSite=Strict cookies + CORS |
| Brute Force | Rate limiting: 5 tentativi / 15 minuti |
| Auth | JWT + HTTPOnly cookies (non accessibili da JS) |
| Password | bcrypt (cost factor 12) |
| Sessioni | 8 ore, invalidazione logout |
| Headers | Helmet.js (CSP, HSTS, X-Frame-Options...) |
| Admin | Route nascosta, non indicizzata |
| Upload | Whitelist estensioni, limite 5MB |

---

## 🚀 Deploy Step-by-Step

### Step 1 — Database MySQL

Scegli un provider MySQL esterno compatibile con Vercel:

**Opzione A: PlanetScale (consigliato)**
1. Vai su [planetscale.com](https://planetscale.com)
2. Crea account e database `littarru_db`
3. Ottieni la connection string
4. Esegui `schema.sql` dal browser PlanetScale

**Opzione B: Railway**
1. Vai su [railway.app](https://railway.app)
2. New Project → MySQL
3. Copia le credenziali
4. Connettiti con un client (DBeaver, TablePlus) e importa `schema.sql`

**Opzione C: Clever Cloud**
1. Vai su [clever-cloud.com](https://clever-cloud.com)
2. Crea addon MySQL
3. Importa `schema.sql` via phpMyAdmin integrato

### Step 2 — Repository GitHub

```bash
# Nella cartella del progetto
git init
git add .
git commit -m "Initial commit: Danilo Littarru website"
git remote add origin https://github.com/TUO_USERNAME/danilo-littarru.git
git push -u origin main
```

> ⚠️ Verifica che `.env` sia nel `.gitignore` prima di fare push!

### Step 3 — Vercel Setup

1. Vai su [vercel.com](https://vercel.com) e accedi
2. **Add New Project** → importa il repository GitHub
3. **Framework Preset**: Other
4. **Root Directory**: lascia vuoto (root)
5. **Build Command**: lascia vuoto
6. **Output Directory**: lascia vuoto

### Step 4 — Variabili d'Ambiente su Vercel

Nel pannello Vercel → Settings → Environment Variables, aggiungi:

```
DB_HOST          = <host dal provider MySQL>
DB_PORT          = 3306
DB_USER          = <username>
DB_PASSWORD      = <password>
DB_NAME          = littarru_db
JWT_SECRET       = <stringa casuale 64+ caratteri>
ADMIN_EMAIL      = admin@danilolittarru.it
ADMIN_PASSWORD   = <password sicura>
FRONTEND_URL     = https://danilolittarru.vercel.app
NODE_ENV         = production
```

> 💡 Per generare JWT_SECRET sicuro:
> ```bash
> node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
> ```

### Step 5 — Deploy

Clicca **Deploy** su Vercel. Il deploy avviene automaticamente.

### Step 6 — Crea l'Admin

Dopo il primo deploy, esegui lo script di setup in locale:

```bash
# Installa dipendenze
npm install

# Crea il file .env con le tue credenziali di produzione
cp .env.example .env
# → Modifica .env con le credenziali del database di produzione

# Esegui lo script di setup
node setup.js
```

Questo creerà l'utente admin con password hashata nel database.

### Step 7 — Accesso Admin

L'URL del pannello admin è:
```
https://tuodominio.vercel.app/gestione-privata
```

> 🔒 La pagina NON è indicizzata dai motori di ricerca (X-Robots-Tag: noindex).
> Non compare in nessuna navigazione pubblica.

---

## 🌐 Dominio Personalizzato

In Vercel → Settings → Domains:
1. Aggiungi il dominio (es. `danilolittarru.it`)
2. Configura i DNS del tuo registrar secondo le istruzioni Vercel
3. Aggiorna `FRONTEND_URL` nelle env var

---

## 📧 Email di Contatto

Il form contatti attualmente simula l'invio. Per attivare l'invio reale:

**Opzione Resend (consigliata, gratuita fino a 3.000/mese):**

```bash
npm install resend
```

In `api/index.js`, aggiungi un endpoint `/api/contact`:

```javascript
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

app.post('/api/contact', async (req, res) => {
  const { name, email, message, subject } = req.body;
  await resend.emails.send({
    from: 'noreply@danilolittarru.it',
    to: 'danilo@danilolittarru.it',
    subject: `Nuovo messaggio: ${subject}`,
    text: `Da: ${name} (${email})\n\n${message}`,
  });
  res.json({ ok: true });
});
```

---

## 📸 Immagini Upload (Produzione)

Su Vercel le immagini caricate (`/uploads`) **non persistono** tra deployment.

**Soluzione: Cloudinary (gratuita fino a 25GB)**

```bash
npm install cloudinary
```

Nel file `.env`:
```
CLOUDINARY_CLOUD_NAME=xxx
CLOUDINARY_API_KEY=xxx
CLOUDINARY_API_SECRET=xxx
```

In `routes/posts.js`, sostituisci `multer.diskStorage` con `multer-storage-cloudinary`.

---

## 🔧 Sviluppo Locale

```bash
# 1. Clona e installa
git clone https://github.com/TUO_USERNAME/danilo-littarru.git
cd danilo-littarru
npm install

# 2. Configura .env
cp .env.example .env
# → Compila con i dati del database locale

# 3. Importa schema nel database locale
mysql -u root -p < database/schema.sql

# 4. Crea l'admin
node setup.js

# 5. Avvia il server
npm run dev
# → http://localhost:3000
# → http://localhost:3000/gestione-privata
```

---

## 📊 API Reference

| Endpoint | Metodo | Auth | Descrizione |
|---|---|---|---|
| `/api/auth/login` | POST | — | Login admin |
| `/api/auth/logout` | POST | Admin | Logout |
| `/api/auth/me` | GET | Admin | Utente corrente |
| `/api/posts` | GET | — | Lista post pubblicati |
| `/api/posts/:slug` | GET | — | Singolo post + commenti |
| `/api/posts` | POST | Admin | Crea articolo |
| `/api/posts/:id` | PUT | Admin | Modifica articolo |
| `/api/posts/:id` | DELETE | Admin | Elimina articolo |
| `/api/posts/:id/image` | POST | Admin | Upload immagine |
| `/api/comments` | POST | — | Invia commento |
| `/api/comments/:id/approve` | PATCH | Admin | Approva commento |
| `/api/comments/:id` | DELETE | Admin | Elimina commento |
| `/api/likes/:postId` | POST | — | Toggle like |
| `/api/likes/:postId/status` | GET | — | Stato like utente |
| `/api/admin/stats` | GET | Admin | Statistiche dashboard |
| `/api/admin/posts` | GET | Admin | Tutti i post (bozze incluse) |
| `/api/admin/comments` | GET | Admin | Tutti i commenti |

---

## 🎨 Personalizzazione

### Palette colori (css/main.css, righe 1-30)
```css
--c-accent: #8B6F52;      /* colore principale */
--c-ivory: #F7F4EF;        /* sfondo */
--c-charcoal: #2C2A27;    /* testo */
```

### Testo sezioni (public/index.html)
- **Chi sono**: sezione `#chi-sono`
- **Qualifiche**: blocchi `.qualifica`
- **Competenze**: blocchi `.competenza-card`
- **Servizi**: blocchi `.servizio`

### Foto profilo (hero)
Sostituisci il placeholder nella sezione `.hero-image-frame` con un tag `<img>`.

---

## 📝 Note Importanti

- Il pannello admin è su `/gestione-privata` (URL non ovvio, non indicizzato)
- Le password sono hashate con bcrypt cost factor 12
- I commenti richiedono approvazione manuale prima di essere visibili
- Le visite sono conteggiate per IP anonimo (nessun cookie tracking)
- I like usano fingerprinting IP+UserAgent (nessun account richiesto)
