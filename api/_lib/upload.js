const formidable = require('formidable');
const { put } = require('@vercel/blob');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

async function parseFormData(req) {
  const form = formidable({
    maxFileSize: MAX_FILE_SIZE,
    keepExtensions: true,
  });
  const [fields, files] = await form.parse(req);

  const flat = {};
  for (const [key, value] of Object.entries(fields)) {
    flat[key] = Array.isArray(value) ? value[0] : value;
  }

  const flatFiles = {};
  for (const [key, value] of Object.entries(files)) {
    flatFiles[key] = Array.isArray(value) ? value[0] : value;
  }

  return { fields: flat, files: flatFiles };
}

async function uploadToBlob(file) {
  if (!file) return null;

  const ext = path.extname(file.originalFilename || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error('Formato immagine non supportato. Usa: jpg, png, webp, gif.');
  }

  const fileBuffer = fs.readFileSync(file.filepath);
  const filename = `${uuidv4()}${ext}`;

  const blob = await put(`uploads/${filename}`, fileBuffer, {
    access: 'public',
    contentType: file.mimetype || 'image/jpeg',
  });

  return blob.url;
}

module.exports = { parseFormData, uploadToBlob, ALLOWED_EXTENSIONS, MAX_FILE_SIZE };
