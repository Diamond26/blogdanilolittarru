const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sql } = require('./_lib/db');
const { createHandler, getClientIp } = require('./_lib/handler');
const { setAuthCookie, clearAuthCookie, requireAdmin } = require('./_lib/auth');
const { checkRateLimit } = require('./_lib/rate-limit');

module.exports = createHandler({
    POST: async (req, res) => {
        const url = req.url || '';

        if (url.includes('/login')) {
            const ip = getClientIp(req);
            const { allowed, retryAfter } = checkRateLimit(`login:${ip}`, 5, 15 * 60 * 1000);
            if (!allowed) {
                return res.status(429).json({ error: `Troppi tentativi di accesso. Riprova tra ${retryAfter} secondi.` });
            }

            const { email, password } = req.body || {};
            if (!email || typeof email !== 'string' || !email.trim()) {
                return res.status(400).json({ error: 'Inserisci username/email.' });
            }
            if (!password || typeof password !== 'string' || password.length < 5) {
                return res.status(400).json({ error: 'Password troppo corta.' });
            }

            const trimmedEmail = email.trim();
            const { rows } = await sql`SELECT * FROM users WHERE email = ${trimmedEmail} LIMIT 1`;
            const user = rows[0];

            const fakeHash = '$2a$12$invalidhashfortimingprotection1234567890';
            const isValid = await bcrypt.compare(password, user ? user.password : fakeHash);

            if (!user || !isValid || user.role !== 'admin') {
                await sql`
          INSERT INTO admin_logs (user_id, action, entity_type, ip_address, details)
          VALUES (${null}, 'LOGIN_FAILED', 'auth', ${ip}, ${JSON.stringify({ email: trimmedEmail })})
        `;
                return res.status(401).json({ error: 'Credenziali non valide.' });
            }

            const token = jwt.sign(
                { id: user.id, email: user.email, role: user.role },
                process.env.JWT_SECRET,
                { expiresIn: '8h' }
            );
            setAuthCookie(res, token);

            await sql`
        INSERT INTO admin_logs (user_id, action, entity_type, ip_address)
        VALUES (${user.id}, 'LOGIN_SUCCESS', 'auth', ${ip})
      `;

            return res.json({ ok: true, message: 'Accesso effettuato.' });
        }

        if (url.includes('/logout')) {
            const user = await requireAdmin(req, res);
            if (!user) return;

            const ip = getClientIp(req);
            await sql`
        INSERT INTO admin_logs (user_id, action, entity_type, ip_address)
        VALUES (${user.id}, 'LOGOUT', 'auth', ${ip})
      `;

            clearAuthCookie(res);
            return res.json({ ok: true, message: 'Disconnesso.' });
        }

        return res.status(404).json({ error: 'Endpoint non trovato.' });
    },

    GET: async (req, res) => {
        const url = req.url || '';

        if (url.includes('/me')) {
            const user = await requireAdmin(req, res);
            if (!user) return;
            return res.json({ id: user.id, email: user.email, role: user.role });
        }

        return res.status(404).json({ error: 'Endpoint non trovato.' });
    }
});
