const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

async function setup() {
  try {
    // Leggi .env e carica variabili d'ambiente
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split('\n');
      lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const idx = trimmed.indexOf('=');
        if (idx === -1) return;
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^"|"$/g, '');
        if (key && !process.env[key]) process.env[key] = val;
      });
    }

    const db = require('./utils/db').getPool();

    console.log('⏳ Eliminazione di tutti gli utenti...');
    await db.execute('DELETE FROM users');
    console.log('✅ Tutti gli utenti eliminati');

    const email = 'admin';
    const password = 'admin';
    const hash = await bcrypt.hash(password, 12);

    console.log('⏳ Creazione utente admin...');
    await db.execute(
      'INSERT INTO users (email, password, role) VALUES (?, ?, ?)',
      [email, hash, 'admin']
    );
    console.log(`✅ Admin creato: ${email} / ${password}`);

    console.log('\n🎉 Setup completato!');
    console.log('📍 Accedi al pannello admin: /gestione-privata');
    process.exit(0);
  } catch (error) {
    console.error('❌ Errore durante il setup:', error.message);
    process.exit(1);
  }
}

setup().catch(err => {
  console.error('❌ Errore durante il setup:', err.message);
  process.exit(1);
});