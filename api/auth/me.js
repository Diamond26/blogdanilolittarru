const { createHandler } = require('../_lib/handler');
const { requireAdmin } = require('../_lib/auth');

module.exports = createHandler({
  GET: async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return;
    return res.json({ id: user.id, email: user.email, role: user.role });
  },
});
