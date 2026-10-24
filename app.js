(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const STORAGE = { transactions: 'contas.transactions.v1', accounts: 'contas.accounts.v1', categories: 'contas.categories.v1' };
  const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const uid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
  const defaults = {
    accounts: [{ id: 'account-main', name: 'Conta principal', initial_balance: 0, archived: false }],
    categories: [
      { id: 'cat-salary', name: 'Salário', kind: 'income' }, { id: 'cat-other-income', name: 'Outras receitas', kind: 'income' },
      { id: 'cat-home', name: 'Moradia', kind: 'expense' }, { id: 'cat-food', name: 'Alimentação', kind: 'expense' },
      { id: 'cat-transport', name: 'Transporte', kind: 'expense' }, { id: 'cat-health', name: 'Saúde', kind: 'expense' },
      { id: 'cat-leisure', name: 'Lazer', kind: 'expense' }, { id: 'cat-bills', name: 'Contas e serviços', kind: 'expense' },
      { id: 'cat-other-expense', name: 'Outras despesas', kind: 'expense' }
    ]
  };
  let transactions = [], categories = [], accounts = [], editingId = null;
  const dialog = $('#transaction-dialog'), form = $('#transaction-form');
  const read = (key, fallback) => { try { const value = localStorage.getItem(key); return value === null ? fallback : JSON.parse(value); } catch (error) { console.warn('Não foi possível ler dados locais:', error); return fallback; } };
  const persist = () => {
    try {
      localStorage.setItem(STORAGE.transactions, JSON.stringify(transactions));
      localStorage.setItem(STORAGE.accounts, JSON.stringify(accounts));
      localStorage.setItem(STORAGE.categories, JSON.stringify(categories));
      return true;
    } catch (error) {
      notifyError('Não foi possível salvar no navegador. Verifique o espaço disponível e as permissões de armazenamento.');
      return false;
    }
  };
  function notifyError(message) { const el = $('#form-error'); el.textContent = message; el.hidden = false; }
  function clearError() { const el = $('#form-error'); el.textContent = ''; el.hidden = true; }
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function populateSelects(selectedCategory, selectedAccount) {
    const kind = $('#kind').value;
    $('#category').innerHTML = '<option value="">Selecione uma categoria</option>' + categories.filter(c => c.kind === kind).map(c => '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>').join('');
    $('#account').innerHTML = '<option value="">Sem conta vinculada</option>' + accounts.filter(a => !a.archived).map(a => '<option value="' + esc(a.id) + '">' + esc(a.name) + '</option>').join('');
    if (selectedCategory) $('#category').value = selectedCategory;
    if (selectedAccount) $('#account').value = selectedAccount;
  }
  function getBalance(account) {
    return Number(account.initial_balance || 0) + transactions.filter(t => t.account_id === account.id && t.paid).reduce((sum, t) => sum + (t.kind === 'income' ? Number(t.amount) : -Number(t.amount)), 0);
  }
  function render() {
    const month = today().slice(0, 7);
    const current = transactions.filter(t => String(t.transaction_date).slice(0, 7) === month);
    const income = current.filter(t => t.kind === 'income').reduce((sum, t) => sum + Number(t.amount), 0);
    const expense = current.filter(t => t.kind === 'expense').reduce((sum, t) => sum + Number(t.amount), 0);
    const dueItems = transactions.filter(t => !t.paid && t.kind === 'expense');
    $('#income-total').textContent = money(income);
    $('#expense-total').textContent = money(expense);
    $('#due-total').textContent = money(dueItems.reduce((sum, t) => sum + Number(t.amount), 0));
    $('#due-count').textContent = dueItems.length + (dueItems.length === 1 ? ' pendente' : ' pendentes');
    $('#total-balance').textContent = money(accounts.reduce((sum, account) => sum + Number(account.initial_balance || 0), 0) + transactions.filter(t => t.paid).reduce((sum, t) => sum + (t.kind === 'income' ? Number(t.amount) : -Number(t.amount)), 0));
    renderTransactions();
    renderCategories(current);
    renderChart();
    renderAccountsPage();
  }
  function renderTransactions() {
    const list = [...transactions].sort((a, b) => String(b.transaction_date).localeCompare(String(a.transaction_date)));
    const recent = list.slice(0, 7);
    $('#recent-list').innerHTML = recent.length ? recent.map(t => transactionRow(t, true)).join('') : '<tr><td colspan="6" class="empty-state">Nenhum lançamento cadastrado. Clique em “Novo lançamento” para começar.</td></tr>';
    const allBody = $('#all-transactions-body');
    if (allBody) allBody.innerHTML = list.length ? list.map(t => transactionRow(t, false)).join('') : '<tr><td colspan="6" class="empty-state">Nenhum lançamento cadastrado.</td></tr>';
  }
  function transactionRow(t, compact) {
    const cat = categories.find(c => c.id === t.category_id), acc = accounts.find(a => a.id === t.account_id);
    const date = String(t.transaction_date || '').slice(0, 10).split('-').reverse().join('/');
    const actions = '<td class="row-actions"><button type="button" class="text-btn" data-edit="' + esc(t.id) + '">Editar</button> <button type="button" class="text-btn danger-btn" data-delete="' + esc(t.id) + '">Excluir</button></td>';
    return '<tr><td>' + esc(t.description) + '</td><td><span class="pill">' + esc(cat?.name || 'Sem categoria') + '</span></td><td>' + esc(date) + '</td><td>' + esc(acc?.name || '—') + '</td><td class="' + (t.kind === 'income' ? 'amount-income' : 'amount-expense') + '">' + (t.kind === 'income' ? '+ ' : '− ') + money(t.amount) + (t.paid ? '' : ' <small>(pendente)</small>') + '</td>' + actions + '</tr>';
  }
  function renderCategories(current) {
    const grouped = {};
    current.filter(t => t.kind === 'expense').forEach(t => { const category = categories.find(c => c.id === t.category_id); const name = category?.name || 'Sem categoria'; grouped[name] = (grouped[name] || 0) + Number(t.amount); });
    const groups = Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const max = Math.max(1, ...groups.map(g => g[1]));
    $('#category-list').innerHTML = groups.length ? groups.map(([name, value]) => '<div class="category-row"><span class="category-icon">◈</span><div><div class="category-name">' + esc(name) + '</div><div class="category-track"><i style="width:' + (value / max * 100) + '%"></i></div></div><span class="category-amount">' + money(value) + '</span></div>').join('') : '<div class="empty-state">Seus gastos por categoria aparecerão aqui quando você registrar lançamentos.</div>';
  }
  function renderChart() {
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); const rows = transactions.filter(t => String(t.transaction_date).slice(0, 7) === key); months.push({ label: monthNames[d.getMonth()], income: rows.filter(t => t.kind === 'income').reduce((s, t) => s + Number(t.amount), 0), expense: rows.filter(t => t.kind === 'expense').reduce((s, t) => s + Number(t.amount), 0) }); }
    const max = Math.max(1, ...months.flatMap(m => [m.income, m.expense]));
    $('#chart-bars').innerHTML = months.map(m => '<div class="bar-group"><i class="bar income-bar" title="Receitas: ' + esc(money(m.income)) + '" style="height:' + Math.max(m.income ? 2 : 0, m.income / max * 100) + '%"></i><i class="bar expense-bar" title="Despesas: ' + esc(money(m.expense)) + '" style="height:' + Math.max(m.expense ? 2 : 0, m.expense / max * 100) + '%"></i><small>' + m.label + '</small></div>').join('');
  }
  function renderAccountsPage() {
    const target = $('#accounts-list');
    if (!target) return;
    target.innerHTML = accounts.length ? accounts.map(a => '<div class="category-row account-row"><span class="category-icon">▣</span><div><div class="category-name">' + esc(a.name) + '</div><div class="muted">Saldo inicial: ' + money(a.initial_balance) + '</div></div><strong>' + money(getBalance(a)) + '</strong></div>').join('') : '<p class="empty-state">Nenhuma conta cadastrada.</p>';
  }
  function openDialog(transaction) {
    form.reset(); clearError(); editingId = transaction?.id || null;
    form.elements.kind.value = transaction?.kind || 'expense';
    form.elements.description.value = transaction?.description || '';
    form.elements.amount.value = transaction?.amount ?? '';
    form.elements.transaction_date.value = transaction?.transaction_date || today();
    form.elements.paid.checked = transaction ? Boolean(transaction.paid) : true;
    form.elements.notes.value = transaction?.notes || '';
    populateSelects(transaction?.category_id, transaction?.account_id);
    $('.dialog-head h2').textContent = editingId ? 'Editar lançamento' : 'Novo lançamento';
    form.querySelector('[type="submit"]').textContent = editingId ? 'Salvar alterações' : 'Salvar lançamento';
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  }
  function closeDialog() { if (dialog.open && typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open'); }
  $('#new-transaction').addEventListener('click', () => openDialog());
  $('#close-dialog').addEventListener('click', closeDialog);
  $('#cancel-dialog').addEventListener('click', closeDialog);
  $('#kind').addEventListener('change', () => populateSelects());
  form.addEventListener('submit', event => {
    event.preventDefault(); clearError();
    const data = { id: editingId || uid(), kind: form.elements.kind.value, description: form.elements.description.value.trim(), amount: Number(form.elements.amount.value), transaction_date: form.elements.transaction_date.value, category_id: form.elements.category_id.value || null, account_id: form.elements.account_id.value || null, paid: form.elements.paid.checked, notes: form.elements.notes.value.trim(), updated_at: new Date().toISOString() };
    if (!data.description || !Number.isFinite(data.amount) || data.amount <= 0 || !data.transaction_date) { notifyError('Preencha descrição, valor e data corretamente.'); return; }
    if (editingId) transactions = transactions.map(t => t.id === editingId ? data : t); else transactions.push({ ...data, created_at: new Date().toISOString() });
    if (!persist()) return;
    closeDialog(); render();
  });
  document.addEventListener('click', event => {
    const edit = event.target.closest('[data-edit]');
    if (edit) { const transaction = transactions.find(t => t.id === edit.dataset.edit); if (transaction) openDialog(transaction); return; }
    const remove = event.target.closest('[data-delete]');
    if (remove) {
      const transaction = transactions.find(t => t.id === remove.dataset.delete);
      if (!transaction || !window.confirm('Excluir o lançamento "' + transaction.description + '"? Esta ação não pode ser desfeita.')) return;
      transactions = transactions.filter(t => t.id !== transaction.id);
      if (persist()) render();
    }
  });
  function showPage(page) {
    const titles = { inicio: 'Visão geral', lancamentos: 'Lançamentos', contas: 'Minhas contas', orcamentos: 'Orçamentos', metas: 'Metas', categorias: 'Categorias', configuracoes: 'Configurações' };
    document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.page === page));
    $('#page-title').textContent = titles[page] || 'Visão geral';
    const overview = page === 'inicio';
    const all = page === 'lancamentos';
    const accountPage = page === 'contas';
    const extra = $('#extra-page');
    document.querySelector('.welcome').hidden = !overview;
    document.querySelector('.metrics').hidden = !overview;
    document.querySelector('.content-grid').hidden = !overview;
    document.querySelector('.transactions-panel').hidden = !(overview || all);
    document.querySelector('.transactions-panel .panel-heading h3').textContent = all ? 'Todos os lançamentos' : 'Últimos lançamentos';
    document.querySelector('.transactions-panel .panel-heading p').textContent = all ? 'Edite ou exclua suas movimentações' : 'Movimentações recentes da sua vida financeira';
    const recentHead = document.querySelector('.transactions-panel thead tr');
    if (recentHead && !recentHead.querySelector('[data-actions-head]')) recentHead.insertAdjacentHTML('beforeend', '<th data-actions-head>AÇÕES</th>');
    if (extra) {
      extra.hidden = !(accountPage || ['categorias', 'orcamentos', 'metas', 'configuracoes'].includes(page));
      if (accountPage) { extra.innerHTML = '<section class="panel"><div class="panel-heading"><div><h3>Minhas contas</h3><p>Saldo calculado com lançamentos pagos</p></div></div><div id="accounts-list" class="category-list"></div></section>'; renderAccountsPage(); }
      else if (page === 'categorias') extra.innerHTML = '<section class="panel"><h3>Categorias disponíveis</h3><div class="category-list">' + categories.map(c => '<div class="category-row"><span class="category-icon">◈</span><div class="category-name">' + esc(c.name) + '</div><span class="pill">' + (c.kind === 'income' ? 'Receita' : 'Despesa') + '</span></div>').join('') + '</div></section>';
      else if (page === 'configuracoes') extra.innerHTML = '<section class="panel"><h3>Armazenamento e privacidade</h3><p class="muted">Os dados ficam salvos neste navegador, neste dispositivo. Limpar os dados do navegador pode apagá-los.</p><button class="secondary-btn" id="export-data">Exportar backup JSON</button> <button class="secondary-btn" id="import-data">Importar backup JSON</button><input id="import-file" type="file" accept="application/json" hidden></section>';
      else if (page === 'orcamentos' || page === 'metas') extra.innerHTML = '<section class="panel"><h3>' + titles[page] + '</h3><p class="empty-state">Esta seção ainda não possui cadastro funcional. Seus lançamentos e saldos já estão disponíveis nas outras telas.</p></section>';
    }
    if (!overview && !all && !accountPage && !['categorias', 'configuracoes', 'orcamentos', 'metas'].includes(page)) showPage('inicio');
    if (all) renderTransactions();
  }
  document.querySelectorAll('[data-page]').forEach(el => el.addEventListener('click', () => showPage(el.dataset.page)));
  $('#month-label').textContent = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^./, c => c.toUpperCase()) + '⌄';
  document.addEventListener('click', event => {
    if (event.target.closest('#export-data')) {
      const blob = new Blob([JSON.stringify({ version: 1, exported_at: new Date().toISOString(), transactions, accounts, categories }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'contas-backup-' + today() + '.json'; a.click(); URL.revokeObjectURL(url);
    }
    if (event.target.closest('#import-data')) $('#import-file').click();
  });
  document.addEventListener('change', event => {
    if (event.target.id !== 'import-file' || !event.target.files?.[0]) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.transactions) || !Array.isArray(data.accounts) || !Array.isArray(data.categories)) throw new Error('Formato inválido');
        if (!window.confirm('Importar este backup substituirá os dados atuais neste navegador. Deseja continuar?')) return;
        transactions = data.transactions; accounts = data.accounts; categories = data.categories;
        if (persist()) { render(); showPage('inicio'); alert('Backup importado com sucesso.'); }
      } catch (error) { alert('Não foi possível importar o arquivo. Selecione um backup JSON válido do Contas.'); }
      event.target.value = '';
    };
    reader.readAsText(event.target.files[0]);
  });
  transactions = read(STORAGE.transactions, []);
  accounts = read(STORAGE.accounts, defaults.accounts);
  categories = read(STORAGE.categories, defaults.categories);
  if (!Array.isArray(transactions)) transactions = [];
  if (!Array.isArray(accounts)) accounts = defaults.accounts;
  if (!Array.isArray(categories)) categories = defaults.categories;
  if (!localStorage.getItem(STORAGE.accounts)) localStorage.setItem(STORAGE.accounts, JSON.stringify(accounts));
  if (!localStorage.getItem(STORAGE.categories)) localStorage.setItem(STORAGE.categories, JSON.stringify(categories));
  persist(); render();
  showPage('inicio');
})();