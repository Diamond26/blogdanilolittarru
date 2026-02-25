const { sql } = require('./_lib/db');
const { createHandler } = require('./_lib/handler');
const { requireAdmin } = require('./_lib/auth');
const { sanitizeText } = require('./_lib/security');
const nodemailer = require('nodemailer');

async function sendNotificationEmail(name, phone, subject, message) {
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.ethereal.email',
        port: parseInt(process.env.SMTP_PORT, 10) || 587,
        auth: {
            user: process.env.SMTP_USER || 'placeholder',
            pass: process.env.SMTP_PASS || 'placeholder',
        },
    });

    return transporter.sendMail({
        from: `"Sito Danilo Littarru" <noreply@danilolittarru.it>`,
        to: process.env.NOTIFICATION_EMAIL || 'davide.secci26@gmail.com',
        subject: `Nuovo Messaggio da ${name}: ${subject || 'Nessun Oggetto'}`,
        text: `Hai ricevuto un nuovo messaggio dal sito.\n\nNome: ${name}\nTelefono: ${phone}\nOggetto: ${subject}\nMessaggio: ${message}`,
        html: `
      <h3>Nuovo messaggio di contatto</h3>
      <p><strong>Nome:</strong> ${sanitizeText(name)}</p>
      <p><strong>Telefono:</strong> ${sanitizeText(phone)}</p>
      <p><strong>Oggetto:</strong> ${sanitizeText(subject || 'Nessuno')}</p>
      <p><strong>Messaggio:</strong></p>
      <div style="padding:1rem;background:#f5f5f5;border-radius:4px">${sanitizeText(message).replace(/\n/g, '<br>')}</div>
    `,
    });
}

module.exports = createHandler({
    POST: async (req, res) => {
        const { name, phone, subject, message } = req.body || {};
        if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Nome obbligatorio.' });
        if (!phone || typeof phone !== 'string' || !phone.trim()) return res.status(400).json({ error: 'Telefono obbligatorio.' });
        if (!message || typeof message !== 'string' || !message.trim()) return res.status(400).json({ error: 'Messaggio obbligatorio.' });

        const cleanName = sanitizeText(name);
        const cleanPhone = sanitizeText(phone);
        const cleanSubject = sanitizeText(subject || '');
        const cleanMessage = sanitizeText(message);

        const { rows } = await sql`
      INSERT INTO contacts (name, phone, subject, message)
      VALUES (${cleanName}, ${cleanPhone}, ${cleanSubject}, ${cleanMessage})
      RETURNING id
    `;
        sendNotificationEmail(cleanName, cleanPhone, cleanSubject, cleanMessage).catch(console.error);
        return res.json({ success: true, id: rows[0].id });
    },

    GET: async (req, res) => {
        const user = await requireAdmin(req, res);
        if (!user) return;
        const { rows: contacts } = await sql`SELECT * FROM contacts ORDER BY created_at DESC`;
        return res.json({ contacts });
    },

    PATCH: async (req, res) => {
        const user = await requireAdmin(req, res);
        if (!user) return;
        const url = req.url || '';
        const urlObj = new URL(url, 'http://localhost');
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        if (pathParts.length >= 3) {
            const id = parseInt(pathParts[2], 10);
            if (isNaN(id)) return res.status(400).json({ error: 'ID non valido.' });
            await sql`UPDATE contacts SET is_read = true WHERE id = ${id}`;
            return res.json({ success: true });
        }
        return res.status(404).json({ error: 'Endpoint non trovato.' });
    },

    DELETE: async (req, res) => {
        const user = await requireAdmin(req, res);
        if (!user) return;
        const url = req.url || '';
        const urlObj = new URL(url, 'http://localhost');
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        if (pathParts.length >= 3) {
            const id = parseInt(pathParts[2], 10);
            if (isNaN(id)) return res.status(400).json({ error: 'ID non valido.' });
            await sql`DELETE FROM contacts WHERE id = ${id}`;
            return res.json({ success: true });
        }
        return res.status(404).json({ error: 'Endpoint non trovato.' });
    }
});
