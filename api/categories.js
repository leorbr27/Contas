const db = require('./_lib/db');
const { requireAuth } = require('./_lib/auth');

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  try {
    // Inclui categorias de despesas e rendimentos sem duplicar registros existentes.
    await db.query(`
      INSERT INTO public.categories (name, kind, color, icon, is_default)
      VALUES
        ('Lanche', 'expense', '#f59e0b', 'utensils', true),
        ('Impostos e taxas', 'expense', '#64748b', 'receipt', true),
        ('Reembolso', 'income', '#0d9488', 'wallet', true),
        ('Vendas', 'income', '#16a34a', 'shopping-bag', true)
      ON CONFLICT (name, kind) DO NOTHING
    `);
    const result = await db.query('SELECT id, name, kind, color, icon, is_default FROM public.categories ORDER BY kind, name');
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Falha ao ler categorias:', error.message);
    return res.status(500).json({ error: 'Não foi possível carregar as categorias.' });
  }
};
