const { sql } = require('@vercel/postgres');
const { createHandler } = require('./_lib/handler');

module.exports = createHandler({
  POST: async (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    await sql`
      INSERT INTO site_visits (visit_date, count)
      VALUES (${today}, 1)
      ON CONFLICT (visit_date) DO UPDATE SET count = site_visits.count + 1
    `;
    return res.json({ ok: true });
  },
});
