const { safeEqual, issueSession, setSessionCookie } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  if (!process.env.APP_PASSWORD || !process.env.SESSION_SECRET) {
    return res.status(503).json({ error: 'A proteção ainda não está configurada no servidor.' });
  }
  try {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password || !safeEqual(password, process.env.APP_PASSWORD)) {
      return res.status(401).json({ error: 'Senha incorreta.' });
    }
    setSessionCookie(res, issueSession());
    return res.status(200).json({ authenticated: true });
  } catch (error) {
    console.error('Falha no login:', error.message);
    return res.status(500).json({ error: 'Não foi possível iniciar a sessão.' });
  }
};
