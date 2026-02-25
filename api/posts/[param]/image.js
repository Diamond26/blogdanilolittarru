const { createHandler } = require('../../_lib/handler');
const { requireAdmin } = require('../../_lib/auth');
const { parseFormData, uploadToBlob } = require('../../_lib/upload');

module.exports = createHandler({
  POST: async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return;

    const { files } = await parseFormData(req);
    if (!files.image) return res.status(400).json({ error: 'Nessun file caricato.' });

    const url = await uploadToBlob(files.image);
    return res.json({ url });
  },
});

module.exports.config = { api: { bodyParser: false } };
