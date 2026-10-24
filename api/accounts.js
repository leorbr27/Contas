const db = require('./_lib/db');
const { requireAuth } = require('./_lib/auth');

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  try {
    let result = await db.query('SELECT id, name, type, institution, initial_balance, color, archived FROM public.accounts WHERE archived = false ORDER BY created_at, name');
    if (result.rows.length === 0) {
      await db.query(
        "INSERT INTO public.accounts (name, type, institution, initial_balance, color) SELECT 'Conta principal', 'checking', NULL, 0, '#16a34a' WHERE NOT EXISTS (SELECT 1 FROM public.accounts WHERE archived = false)"
      );
      result = await db.query('SELECT id, name, type, institution, initial_balance, color, archived FROM public.accounts WHERE archived = false ORDER BY created_at, name');
    }
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Falha ao ler contas:', error.message);
    return res.status(500).json({ error: 'Não foi possível carregar as contas.' });
  }
};
