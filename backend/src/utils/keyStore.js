const fs = require('fs');
const os = require('os');
const path = require('path');

const legacyPath = path.join(__dirname, '../../secure_keys.json');
const dataDir = path.join(os.homedir(), '.campusflow');
const keysPath = path.join(dataDir, 'secure_keys.json');

function normalizeKey(value) {
  if (!value) return null;
  const cleaned = String(value).trim().replace(/^["']+|["']+$/g, '');
  return cleaned || null;
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw || '{}');
}

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function readKeyFrom(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const obj = readJson(filePath);
  return normalizeKey(obj.apiKey);
}

function migrateLegacyIfNeeded() {
  try {
    if (fs.existsSync(keysPath)) return;
    const legacyKey = readKeyFrom(legacyPath);
    if (!legacyKey) return;
    ensureDataDir();
    fs.writeFileSync(keysPath, JSON.stringify({ apiKey: legacyKey }, null, 2), { mode: 0o600 });
  } catch (_err) {
    // Ignore migration issues; runtime handlers will surface actionable errors.
  }
}

function readKey() {
  try {
    migrateLegacyIfNeeded();
    return readKeyFrom(keysPath);
  } catch (_err) {
    return null;
  }
}

function saveKey(key) {
  ensureDataDir();
  fs.writeFileSync(keysPath, JSON.stringify({ apiKey: key }, null, 2), { mode: 0o600 });
}

function clearKey() {
  if (fs.existsSync(keysPath)) fs.unlinkSync(keysPath);
}

module.exports = {
  keysPath,
  legacyPath,
  readKey,
  saveKey,
  clearKey,
  normalizeKey
};