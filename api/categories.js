const db = require('./_lib/db');
const { requireAuth } = require('./_lib/auth');

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  try {
    const result = await db.query('SELECT id, name, kind, color, icon, is_default FROM public.categories ORDER BY kind, name');
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Falha ao ler categorias:', error.message);
    return res.status(500).json({ error: 'Não foi possível carregar as categorias.' });
  }
};
