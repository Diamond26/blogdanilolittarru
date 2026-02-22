#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !process.env[key]) process.env[key] = val;
  });
} else {
  console.error('❌ File .env non trovato. Crea il file .env partendo da .env.example');
  process.exit(1);
}

const bcrypt = require('bcryptjs');
const { callProc, callProcOne } = require('./utils/db');

async function setup() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('❌ ADMIN_EMAIL e ADMIN_PASSWORD devono essere definiti nel file .env');
    process.exit(1);
  }

  if (password.length < 1) {
    console.error('❌ La password deve avere almeno 10 caratteri.');
    process.exit(1);
  }

  console.log('⏳ Hashing della password...');
  const hash = await bcrypt.hash(password, 12);

  console.log('⏳ Verifica esistenza admin...');
  const existing = await callProcOne('sp_find_user_by_email', [email]);

  if (existing) {
    await callProc('sp_update_admin_password', [email, hash]);
    console.log(`✅ Password aggiornata per admin: ${email}`);
  } else {
    await callProc('sp_create_admin', [email, hash]);
    console.log(`✅ Admin creato: ${email}`);
  }

  console.log('\n🎉 Setup completato!');
  console.log(`📍 Accedi al pannello admin: /gestione-privata`);
  process.exit(0);
}

setup().catch(err => {
  console.error('❌ Errore durante il setup:', err.message);
  process.exit(1);
});
