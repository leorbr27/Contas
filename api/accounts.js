const db = require('./_lib/db');
const { requireAuth } = require('./_lib/auth');

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  try {
    // Garante que as contas solicitadas existam sem duplicar as já cadastradas.
    await db.query(`
      INSERT INTO public.accounts (name, type, institution, initial_balance, color)
      SELECT seed.name, seed.type, seed.institution, 0, seed.color
      FROM (VALUES
        ('Amex', 'credit_card', 'Bradesco', '#2563eb'),
        ('BB', 'checking', 'Banco do Brasil', '#eab308'),
        ('BB - Cartão de crédito', 'credit_card', 'Banco do Brasil', '#eab308'),
        ('Bradesco', 'checking', 'Bradesco', '#dc2626'),
        ('Nubank', 'checking', 'Nubank', '#7c3aed'),
        ('PicPay', 'checking', 'PicPay', '#16a34a'),
        ('PicPay - Cartão de crédito', 'credit_card', 'PicPay', '#16a34a'),
        ('Itaú', 'checking', 'Itaú', '#f59e0b'),
        ('Santander', 'checking', 'Santander', '#ef4444'),
        ('Comprocard', 'credit_card', 'Comprocard', '#0f766e'),
        ('Le Card', 'credit_card', 'Le Card', '#0d9488')
      ) AS seed(name, type, institution, color)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.accounts existing
        WHERE lower(existing.name) = lower(seed.name) AND existing.archived = false
      )
    `);
    await db.query(`UPDATE public.accounts SET institution = 'Bradesco', updated_at = now() WHERE lower(name) = 'amex' AND archived = false`);
    const result = await db.query(`
      SELECT id, name, type, institution, initial_balance, color, archived
      FROM public.accounts
      WHERE archived = false
      ORDER BY lower(name)
    `);
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Falha ao ler contas:', error.message);
    return res.status(500).json({ error: 'Não foi possível carregar as contas.' });
  }
};
