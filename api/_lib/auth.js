const crypto = require('crypto');

const COOKIE_NAME = 'contas_session';
const SESSION_SECONDS = 60 * 60 * 24 * 7;

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function sign(value) {
  return crypto.createHmac('sha256', process.env.SESSION_SECRET).update(value).digest('base64url');
}

function issueSession() {
  if (!process.env.SESSION_SECRET || !process.env.APP_PASSWORD) {
    throw new Error('Configuração de autenticação ausente no servidor.');
  }
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS })).toString('base64url');
  return payload + '.' + sign(payload);
}

function validSession(req) {
  if (!process.env.SESSION_SECRET || !process.env.APP_PASSWORD) return false;
  const cookieHeader = req.headers.cookie || '';
  const raw = cookieHeader.split(';').map(part => part.trim()).find(part => part.startsWith(COOKIE_NAME + '='));
  if (!raw) return false;
  const token = raw.slice(COOKIE_NAME.length + 1);
  const split = token.lastIndexOf('.');
  if (split < 1) return false;
  const payload = token.slice(0, split);
  const signature = token.slice(split + 1);
  if (!safeEqual(signature, sign(payload))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number.isFinite(data.exp) && data.exp > Math.floor(Date.now() / 1000);
  } catch (_) {
    return false;
  }
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', COOKIE_NAME + '=' + token + '; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=' + SESSION_SECONDS);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', COOKIE_NAME + '=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
}

function requireAuth(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!validSession(req)) {
    res.status(401).json({ error: 'Acesso não autorizado. Entre com sua senha.' });
    return false;
  }
  return true;
}

module.exports = { safeEqual, issueSession, validSession, setSessionCookie, clearSessionCookie, requireAuth };
