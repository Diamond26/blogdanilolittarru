'use strict';

const express = require('express');
const router = express.Router();
const { callProc } = require('../utils/db');
const { requireAdmin } = require('../middleware/auth');
const nodemailer = require('nodemailer');

// POST /api/contacts - Sottomissione pubblica
router.post('/', async (req, res) => {
    const { name, phone, subject, message } = req.body;

    if (!name || !phone || !message) {
        return res.status(400).json({ error: 'Nome, telefono e messaggio sono obbligatori.' });
    }

    try {
        const { insertId } = await callProc('sp_insert_contact', [name, phone, subject, message]);

        // Invio Email di notifica (Asincrono, non blocca la risposta)
        sendNotificationEmail(name, phone, subject, message).catch(console.error);

        res.json({ success: true, id: insertId });
    } catch (err) {
        console.error('Contact error:', err);
        res.status(500).json({ error: 'Errore nel salvataggio del messaggio.' });
    }
});

// GET /api/contacts - Lista admin
router.get('/', requireAdmin, async (req, res) => {
    try {
        const contacts = await callProc('sp_get_contacts');
        res.json({ contacts });
    } catch (err) {
        res.status(500).json({ error: 'Errore nel recupero dei messaggi.' });
    }
});

// PATCH /api/contacts/:id/read - Segna come letto
router.patch('/:id/read', requireAdmin, async (req, res) => {
    try {
        await callProc('sp_mark_contact_read', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Errore nell\'aggiornamento del messaggio.' });
    }
});

// DELETE /api/contacts/:id - Elimina
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        await callProc('sp_delete_contact', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Errore nell\'eliminazione del messaggio.' });
    }
});

async function sendNotificationEmail(name, phone, subject, message) {
    // Configurazione temporanea (Placeholder)
    // In produzione usare variabili d'ambiente per SMTP
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.ethereal.email',
        port: process.env.SMTP_PORT || 587,
        auth: {
            user: process.env.SMTP_USER || 'placeholder',
            pass: process.env.SMTP_PASS || 'placeholder',
        },
    });

    const mailOptions = {
        from: `"Sito Danilo Littarru" <noreply@danilolittarru.it>`,
        to: 'davide.secci26@gmail.com', // Come richiesto
        subject: `Nuovo Messaggio da ${name}: ${subject || 'Nessun Oggetto'}`,
        text: `Hai ricevuto un nuovo messaggio dal sito.\n\nNome: ${name}\nTelefono: ${phone}\nOggetto: ${subject}\nMessaggio: ${message}`,
        html: `
      <h3>Nuovo messaggio di contatto</h3>
      <p><strong>Nome:</strong> ${name}</p>
      <p><strong>Telefono:</strong> ${phone}</p>
      <p><strong>Oggetto:</strong> ${subject || 'Nessuno'}</p>
      <p><strong>Messaggio:</strong></p>
      <div style="padding: 1rem; background: #f5f5f5; border-radius: 4px;">${message.replace(/\n/g, '<br>')}</div>
    `,
    };

    return transporter.sendMail(mailOptions);
}

module.exports = router;
