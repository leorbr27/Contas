const db = require('./_lib/db');
const { requireAuth } = require('./_lib/auth');

const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z'));
const validUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function validate(body) {
  const data = body && typeof body === 'object' ? body : {};
  const kind = data.kind;
  const description = typeof data.description === 'string' ? data.description.trim() : '';
  const amount = Number(data.amount);
  const transaction_date = data.transaction_date;
  const paid = data.paid === true || data.paid === 'true';
  if (!['income', 'expense', 'transfer'].includes(kind)) return { error: 'Selecione um tipo de lançamento válido.' };
  if (!description || description.length > 180) return { error: 'A descrição é obrigatória e deve ter até 180 caracteres.' };
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999999) return { error: 'Informe um valor maior que zero.' };
  if (!validDate(transaction_date)) return { error: 'Informe uma data válida.' };
  const category_id = data.category_id || null;
  const account_id = data.account_id || null;
  if (category_id && !validUuid(category_id)) return { error: 'Categoria inválida.' };
  if (account_id && !validUuid(account_id)) return { error: 'Conta inválida.' };
  const notes = typeof data.notes === 'string' ? data.notes.trim().slice(0, 1000) : null;
  return { data: { kind, description, amount: Math.round(amount * 100) / 100, transaction_date, paid, category_id, account_id, notes } };
}

const selectSql = `SELECT t.id, t.account_id, t.category_id, t.kind, t.description, t.amount,
  to_char(t.transaction_date, 'YYYY-MM-DD') AS transaction_date,
  CASE WHEN t.due_date IS NULL THEN NULL ELSE to_char(t.due_date, 'YYYY-MM-DD') END AS due_date,
  t.paid, t.paid_at, t.payment_method, t.notes, t.created_at, t.updated_at,
  c.name AS category_name, a.name AS account_name
  FROM public.transactions t
  LEFT JOIN public.categories c ON c.id = t.category_id
  LEFT JOIN public.accounts a ON a.id = t.account_id`;

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  try {
    if (req.method === 'GET') {
      const result = await db.query(selectSql + ' ORDER BY t.transaction_date DESC, t.created_at DESC LIMIT 2000');
      return res.status(200).json(result.rows);
    }

    if (req.method === 'POST') {
      const checked = validate(req.body);
      if (checked.error) return res.status(400).json({ error: checked.error });
      const d = checked.data;
      const result = await db.query(
        `INSERT INTO public.transactions
          (kind, description, amount, transaction_date, category_id, account_id, paid, paid_at, notes, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,CASE WHEN $7 THEN now() ELSE NULL END,$8,now())
         RETURNING id, account_id, category_id, kind, description, amount, to_char(transaction_date,'YYYY-MM-DD') AS transaction_date, due_date, paid, paid_at, notes, created_at, updated_at`,
        [d.kind, d.description, d.amount, d.transaction_date, d.category_id, d.account_id, d.paid, d.notes]
      );
      return res.status(201).json(result.rows[0]);
    }

    if (req.method === 'PUT') {
      const id = typeof req.query?.id === 'string' ? req.query.id : req.body?.id;
      if (!validUuid(id)) return res.status(400).json({ error: 'Identificador de lançamento inválido.' });
      const checked = validate(req.body);
      if (checked.error) return res.status(400).json({ error: checked.error });
      const d = checked.data;
      const result = await db.query(
        `UPDATE public.transactions SET kind=$1, description=$2, amount=$3, transaction_date=$4,
          category_id=$5, account_id=$6, paid=$7, paid_at=CASE WHEN $7 THEN COALESCE(paid_at, now()) ELSE NULL END,
          notes=$8, updated_at=now()
         WHERE id=$9
         RETURNING id, account_id, category_id, kind, description, amount, to_char(transaction_date,'YYYY-MM-DD') AS transaction_date, due_date, paid, paid_at, notes, created_at, updated_at`,
        [d.kind, d.description, d.amount, d.transaction_date, d.category_id, d.account_id, d.paid, d.notes, id]
      );
      if (!result.rowCount) return res.status(404).json({ error: 'Lançamento não encontrado.' });
      return res.status(200).json(result.rows[0]);
    }

    if (req.method === 'DELETE') {
      const id = typeof req.query?.id === 'string' ? req.query.id : '';
      if (!validUuid(id)) return res.status(400).json({ error: 'Identificador de lançamento inválido.' });
      const result = await db.query('DELETE FROM public.transactions WHERE id=$1 RETURNING id', [id]);
      if (!result.rowCount) return res.status(404).json({ error: 'Lançamento não encontrado.' });
      return res.status(200).json({ deleted: true, id });
    }

    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return res.status(405).json({ error: 'Método não permitido.' });
  } catch (error) {
    console.error('Falha na API de lançamentos:', error.message);
    if (error.code === '23503') return res.status(400).json({ error: 'A conta ou categoria selecionada não existe mais.' });
    return res.status(500).json({ error: 'Não foi possível concluir a operação no banco de dados.' });
  }
};
