// Questo file non è più il server Express.
// Le API sono ora gestite come serverless functions nei sotto-file di /api/.
// Questo handler gestisce solo la route /api (health check).

const { createHandler } = require('./_lib/handler');

module.exports = createHandler({
  GET: async (req, res) => {
    return res.json({ ok: true, message: 'Danilo Littarru Blog API — Serverless' });
  },
});
