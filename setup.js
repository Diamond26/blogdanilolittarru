#!/usr/bin/env node
/**
 * setup.js — Script iniziale per creare l'utente admin
 * 
 * Utilizzo:
 *   node setup.js
 * 
 * Richiede le variabili d'ambiente nel file .env
 */

// Carica .env manualmente (senza dipendenza da dotenv)
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
const { query, queryOne } = require('./utils/db');

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
  const existing = await queryOne('SELECT id FROM users WHERE email = ?', [email]);

  if (existing) {
    await query('UPDATE users SET password = ? WHERE email = ?', [hash, email]);
    console.log(`✅ Password aggiornata per admin: ${email}`);
  } else {
    await query(
      'INSERT INTO users (email, password, role) VALUES (?, ?, ?)',
      [email, hash, 'admin']
    );
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
