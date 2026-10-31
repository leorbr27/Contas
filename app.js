(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const uid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
  let transactions = [], categories = [], accounts = [], editingId = null, busy = false;
  const dialog = $('#transaction-dialog'), form = $('#transaction-form');

  const authStyles = document.createElement('style');
  authStyles.textContent = `
    .auth-overlay{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:24px;background:rgba(8,25,20,.78);backdrop-filter:blur(8px)}
    .auth-card{width:min(100%,420px);padding:32px;border-radius:22px;background:#fff;color:#172a23;box-shadow:0 25px 80px rgba(0,0,0,.28)}
    .auth-mark{display:flex;align-items:center;gap:12px;margin-bottom:24px;font-size:23px;font-weight:800;letter-spacing:-.6px}
    .auth-mark-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:14px;background:#143c30;color:#fff}
    .auth-card h2{margin:0 0 8px;font-size:25px}.auth-card p{color:#64748b;line-height:1.5;margin:0 0 22px}
    .auth-card label{display:block;font-weight:650;margin-bottom:8px}.auth-card input{box-sizing:border-box;width:100%;padding:13px 14px;border:1px solid #cbd5e1;border-radius:10px;font:inherit;margin:8px 0 16px}
    .auth-card button{width:100%;padding:13px 16px;border:0;border-radius:10px;background:#145c43;color:#fff;font:inherit;font-weight:750;cursor:pointer}
    .auth-error{color:#b91c1c!important;min-height:20px;margin:0 0 12px!important;font-size:14px}
    .auth-foot{font-size:12px;color:#64748b;margin-top:16px;text-align:center}
    #logout-button{margin-left:8px}.api-error-banner{padding:12px 16px;border-radius:10px;background:#fff1f2;color:#9f1239;margin:12px 0}
    .row-actions{white-space:nowrap}.danger-btn{color:#b91c1c}
  `;
  document.head.appendChild(authStyles);

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const data = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (response.status === 401 && !path.startsWith('/api/auth/')) showLogin();
    if (!response.ok) throw new Error(data?.error || 'Não foi possível concluir a operação.');
    return data;
  }

  function showLogin(message = '') {
    let overlay = $('#auth-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'auth-overlay';
      overlay.className = 'auth-overlay';
      overlay.innerHTML = `
        <section class="auth-card" role="dialog" aria-modal="true" aria-labelledby="auth-title">
          <div class="auth-mark"><span class="auth-mark-icon">c.</span><span>contas.</span></div>
          <h2 id="auth-title">Seu dinheiro, em segurança.</h2>
          <p>Digite sua senha privada para acessar suas informações financeiras.</p>
          <form id="auth-form" autocomplete="on">
            <label for="auth-password">Senha privada</label>
            <input id="auth-password" name="password" type="password" autocomplete="current-password" required autofocus>
            <p id="auth-error" class="auth-error" role="alert"></p>
            <button type="submit">Entrar com segurança</button>
          </form>
          <div class="auth-foot">A conexão é protegida e os dados ficam no banco de dados privado.</div>
        </section>`;
      document.body.appendChild(overlay);
      $('#auth-form').addEventListener('submit', async event => {
        event.preventDefault();
        const button = $('#auth-form button');
        const error = $('#auth-error');
        button.disabled = true;
        button.textContent = 'Verificando…';
        error.textContent = '';
        try {
          await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ password: $('#auth-password').value }) });
          overlay.remove();
          await loadData();
        } catch (err) {
          error.textContent = err.message === 'Senha incorreta.' ? 'Senha incorreta. Tente novamente.' : err.message;
        } finally {
          if ($('#auth-form button')) {
            button.disabled = false;
            button.textContent = 'Entrar com segurança';
            $('#auth-password').value = '';
          }
        }
      });
    }
    const error = $('#auth-error');
    if (error && message) error.textContent = message;
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('#auth-password')?.focus(), 0);
  }
  function hideLogin() {
    $('#auth-overlay')?.remove();
    document.body.style.overflow = '';
  }
  function showError(message) {
    let banner = $('#api-error-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'api-error-banner';
      banner.className = 'api-error-banner';
      $('.main')?.prepend(banner);
    }
    banner.textContent = message;
    banner.hidden = false;
  }
  function clearError() {
    const el = $('#form-error');
    if (el) { el.textContent = ''; el.hidden = true; }
  }
  function notifyFormError(message) {
    const el = $('#form-error');
    el.textContent = message;
    el.hidden = false;
  }

  function populateSelects(selectedCategory, selectedAccount) {
    const kind = $('#kind').value;
    const activeAccounts = accounts.filter(a => !a.archived);
    $('#category').innerHTML = '<option value="">Selecione uma categoria</option>' + categories
      .filter(c => c.kind === kind)
      .map(c => '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>').join('');
    $('#account').innerHTML = activeAccounts
      .map(a => '<option value="' + esc(a.id) + '">' + esc(a.name) + '</option>').join('');
    $('#transfer-from-account').innerHTML = '<option value="">Selecione a conta de origem</option>' + activeAccounts
      .map(a => '<option value="' + esc(a.id) + '">' + esc(a.name) + (a.type === 'credit_card' ? ' (cartão)' : '') + '</option>').join('');
    $('#transfer-to-account').innerHTML = '<option value="">Selecione a conta de destino</option>' + activeAccounts
      .map(a => '<option value="' + esc(a.id) + '">' + esc(a.name) + (a.type === 'credit_card' ? ' (cartão)' : '') + '</option>').join('');
    if (selectedCategory) $('#category').value = selectedCategory;
    const defaultAccount = activeAccounts.find(a => a.name.toLowerCase() === 'amex');
    $('#account').value = selectedAccount || defaultAccount?.id || activeAccounts[0]?.id || '';
    updateKindFields();
  }
  function updateKindFields() {
    const transfer = $('#kind').value === 'transfer';
    $('#category-field').hidden = transfer;
    $('#account-field').hidden = transfer;
    $('#transfer-from-field').hidden = !transfer;
    $('#transfer-to-field').hidden = !transfer;
    $('.check-label').hidden = transfer;
  }
  function getBalance(account) {
    const rows = transactions.filter(t => t.paid || (account.type === 'credit_card' && t.account_id === account.id && t.kind === 'expense'));
    const isCard = account.type === 'credit_card';
    return Number(account.initial_balance || 0) + rows.reduce((sum, t) => {
      const amount = Number(t.amount);
      if (t.kind === 'transfer') {
        if (isCard) return sum + (t.transfer_to_account_id === account.id ? -amount : t.transfer_from_account_id === account.id ? amount : 0);
        return sum + (t.transfer_to_account_id === account.id ? amount : t.transfer_from_account_id === account.id ? -amount : 0);
      }
      if (t.account_id !== account.id) return sum;
      if (isCard) return sum + (t.kind === 'expense' ? amount : t.kind === 'income' ? -amount : 0);
      return sum + (t.kind === 'income' ? amount : t.kind === 'expense' ? -amount : 0);
    }, 0);
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
    $('#total-balance').textContent = money(accounts.reduce((sum, account) => sum + getBalance(account), 0));
    renderTransactions();
    renderCategories(current);
    renderChart();
    renderAccountsPage();
  }
  function renderTransactions() {
    const list = [...transactions].sort((a, b) => String(b.transaction_date).localeCompare(String(a.transaction_date)));
    const recent = list.slice(0, 7);
    $('#recent-list').innerHTML = recent.length ? recent.map(t => transactionRow(t)).join('') :
      '<tr><td colspan="6" class="empty-state">Nenhum lançamento cadastrado. Clique em “Novo lançamento” para começar.</td></tr>';
    const allBody = $('#all-transactions-body');
    if (allBody) allBody.innerHTML = list.length ? list.map(t => transactionRow(t)).join('') :
      '<tr><td colspan="6" class="empty-state">Nenhum lançamento cadastrado.</td></tr>';
  }
  function transactionRow(t) {
    const cat = categories.find(c => c.id === t.category_id);
    const acc = accounts.find(a => a.id === t.account_id);
    const date = String(t.transaction_date || '').slice(0, 10).split('-').reverse().join('/');
    const actions = '<td class="row-actions"><button type="button" class="text-btn" data-edit="' + esc(t.id) + '">Editar</button> <button type="button" class="text-btn danger-btn" data-delete="' + esc(t.id) + '">Excluir</button></td>';
    const transfer = t.kind === 'transfer';
    const sign = t.kind === 'income' ? '+ ' : t.kind === 'expense' ? '− ' : '↔ ';
    const amountClass = t.kind === 'income' ? 'amount-income' : t.kind === 'expense' ? 'amount-expense' : '';
    const accountLabel = transfer ? (t.transfer_from_account_name || '—') + ' → ' + (t.transfer_to_account_name || '—') : (t.account_name || acc?.name || '—');
    return '<tr><td>' + esc(t.description) + '</td><td><span class="pill">' + esc(transfer ? 'Transferência' : t.category_name || cat?.name || 'Sem categoria') + '</span></td><td>' + esc(date) + '</td><td>' + esc(accountLabel) + '</td><td class="' + amountClass + '">' + sign + money(t.amount) + (t.paid ? '' : ' <small>(pendente)</small>') + '</td>' + actions + '</tr>';
  }
  function renderCategories(current) {
    const grouped = {};
    current.filter(t => t.kind === 'expense').forEach(t => {
      const category = categories.find(c => c.id === t.category_id);
      const name = t.category_name || category?.name || 'Sem categoria';
      grouped[name] = (grouped[name] || 0) + Number(t.amount);
    });
    const groups = Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const max = Math.max(1, ...groups.map(g => g[1]));
    $('#category-list').innerHTML = groups.length ? groups.map(([name, value]) =>
      '<div class="category-row"><span class="category-icon">◈</span><div><div class="category-name">' + esc(name) +
      '</div><div class="category-track"><i style="width:' + (value / max * 100) + '%"></i></div></div><span class="category-amount">' +
      money(value) + '</span></div>').join('') :
      '<div class="empty-state">Seus gastos por categoria aparecerão aqui quando você registrar lançamentos.</div>';
  }
  function renderChart() {
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const now = new Date(), months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      const rows = transactions.filter(t => String(t.transaction_date).slice(0, 7) === key);
      months.push({ label: monthNames[d.getMonth()], income: rows.filter(t => t.kind === 'income').reduce((s, t) => s + Number(t.amount), 0), expense: rows.filter(t => t.kind === 'expense').reduce((s, t) => s + Number(t.amount), 0) });
    }
    const max = Math.max(1, ...months.flatMap(m => [m.income, m.expense]));
    $('#chart-bars').innerHTML = months.map(m =>
      '<div class="bar-group"><i class="bar income-bar" title="Receitas: ' + esc(money(m.income)) + '" style="height:' +
      (m.income ? Math.max(2, m.income / max * 100) : 0) + '%"></i><i class="bar expense-bar" title="Despesas: ' +
      esc(money(m.expense)) + '" style="height:' + (m.expense ? Math.max(2, m.expense / max * 100) : 0) +
      '%"></i><small>' + m.label + '</small></div>').join('');
  }
  function renderAccountsPage() {
    const target = $('#accounts-list');
    if (!target) return;
    target.innerHTML = accounts.length ? accounts.map(a =>
      '<div class="category-row account-row"><span class="category-icon">▣</span><div><div class="category-name">' + esc(a.name) +
      '</div><div class="muted">Saldo inicial: ' + money(a.initial_balance) + '</div></div><strong>' + money(getBalance(a)) +
      '</strong></div>').join('') : '<p class="empty-state">Nenhuma conta cadastrada.</p>';
  }
  function openDialog(transaction) {
    form.reset(); clearError(); editingId = transaction?.id || null;
    form.elements.kind.value = transaction?.kind || 'expense';
    form.elements.description.value = transaction?.description || '';
    form.elements.amount.value = transaction?.amount ?? '';
    form.elements.transaction_date.value = String(transaction?.transaction_date || today()).slice(0, 10);
    form.elements.paid.checked = transaction ? Boolean(transaction.paid) : true;
    form.elements.notes.value = transaction?.notes || '';
    populateSelects(transaction?.category_id, transaction?.account_id);
    if (transaction?.transfer_from_account_id) $('#transfer-from-account').value = transaction.transfer_from_account_id;
    if (transaction?.transfer_to_account_id) $('#transfer-to-account').value = transaction.transfer_to_account_id;
    $('.dialog-head h2').textContent = editingId ? 'Editar lançamento' : 'Novo lançamento';
    form.querySelector('[type="submit"]').textContent = editingId ? 'Salvar alterações' : 'Salvar lançamento';
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  }
  function closeDialog() {
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  async function loadData() {
    try {
      const [tx, acc, cat] = await Promise.all([api('/api/transactions'), api('/api/accounts'), api('/api/categories')]);
      transactions = Array.isArray(tx) ? tx : [];
      accounts = Array.isArray(acc) ? acc : [];
      categories = Array.isArray(cat) ? cat : [];
      hideLogin();
      clearBanner();
      render();
      showPage('inicio');
    } catch (error) {
      if ($('#auth-overlay')) return;
      showError(error.message || 'Não foi possível conectar ao servidor. Tente novamente.');
    }
  }
  function clearBanner() { $('#api-error-banner')?.remove(); }

  $('#new-transaction').addEventListener('click', () => openDialog());
  $('#close-dialog').addEventListener('click', closeDialog);
  $('#cancel-dialog').addEventListener('click', closeDialog);
  $('#kind').addEventListener('change', () => populateSelects());

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    clearError();
    const data = {
      kind: form.elements.kind.value,
      description: form.elements.description.value.trim(),
      amount: Number(form.elements.amount.value),
      transaction_date: form.elements.transaction_date.value,
      category_id: form.elements.category_id.value || null,
      account_id: form.elements.kind.value === 'transfer' ? null : (form.elements.account_id.value || null),
      transfer_from_account_id: form.elements.kind.value === 'transfer' ? ($('#transfer-from-account').value || null) : null,
      transfer_to_account_id: form.elements.kind.value === 'transfer' ? ($('#transfer-to-account').value || null) : null,
      paid: form.elements.kind.value === 'transfer' ? true : (form.elements.paid.checked || accounts.find(a => a.id === form.elements.account_id.value)?.type === 'credit_card'),
      notes: form.elements.notes.value.trim()
    };
    if (!data.description || !Number.isFinite(data.amount) || data.amount <= 0 || !data.transaction_date || (data.kind === 'transfer' && (!data.transfer_from_account_id || !data.transfer_to_account_id || data.transfer_from_account_id === data.transfer_to_account_id))) {
      notifyFormError('Preencha descrição, valor e data corretamente.');
      return;
    }
    busy = true;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Salvando…';
    try {
      await api(editingId ? '/api/transactions?id=' + encodeURIComponent(editingId) : '/api/transactions', {
        method: editingId ? 'PUT' : 'POST', body: JSON.stringify(data)
      });
      closeDialog();
      await loadData();
    } catch (error) {
      notifyFormError(error.message || 'Não foi possível salvar o lançamento.');
    } finally {
      busy = false;
      submit.disabled = false;
      submit.textContent = editingId ? 'Salvar alterações' : 'Salvar lançamento';
    }
  });

  document.addEventListener('click', async event => {
    const edit = event.target.closest('[data-edit]');
    if (edit) {
      const transaction = transactions.find(t => t.id === edit.dataset.edit);
      if (transaction) openDialog(transaction);
      return;
    }
    const remove = event.target.closest('[data-delete]');
    if (remove) {
      const transaction = transactions.find(t => t.id === remove.dataset.delete);
      if (!transaction || !window.confirm('Excluir o lançamento "' + transaction.description + '"? Esta ação não pode ser desfeita.')) return;
      remove.disabled = true;
      try {
        await api('/api/transactions?id=' + encodeURIComponent(transaction.id), { method: 'DELETE' });
        await loadData();
      } catch (error) {
        showError(error.message || 'Não foi possível excluir o lançamento.');
        remove.disabled = false;
      }
    }
  });

  function showPage(page) {
    const titles = { inicio: 'Visão geral', lancamentos: 'Lançamentos', contas: 'Minhas contas', orcamentos: 'Orçamentos', metas: 'Metas', categorias: 'Categorias', configuracoes: 'Configurações' };
    document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.page === page));
    $('#page-title').textContent = titles[page] || 'Visão geral';
    const overview = page === 'inicio', all = page === 'lancamentos', accountPage = page === 'contas';
    const extra = $('#extra-page');
    $('.welcome').hidden = !overview;
    $('.metrics').hidden = !overview;
    $('.content-grid').hidden = !overview;
    $('.transactions-panel').hidden = !(overview || all);
    $('.transactions-panel .panel-heading h3').textContent = all ? 'Todos os lançamentos' : 'Últimos lançamentos';
    $('.transactions-panel .panel-heading p').textContent = all ? 'Edite ou exclua suas movimentações' : 'Movimentações recentes da sua vida financeira';
    const recentHead = document.querySelector('.transactions-panel thead tr');
    if (recentHead && !recentHead.querySelector('[data-actions-head]')) recentHead.insertAdjacentHTML('beforeend', '<th data-actions-head>AÇÕES</th>');
    if (extra) {
      extra.hidden = !(accountPage || ['categorias', 'orcamentos', 'metas', 'configuracoes'].includes(page));
      if (accountPage) {
        extra.innerHTML = '<section class="panel"><div class="panel-heading"><div><h3>Minhas contas</h3><p>Saldo calculado com lançamentos pagos</p></div></div><div id="accounts-list" class="category-list"></div></section>';
        renderAccountsPage();
      } else if (page === 'categorias') {
        extra.innerHTML = '<section class="panel"><h3>Categorias disponíveis</h3><div class="category-list">' + categories.map(c =>
          '<div class="category-row"><span class="category-icon">◈</span><div class="category-name">' + esc(c.name) +
          '</div><span class="pill">' + (c.kind === 'income' ? 'Receita' : 'Despesa') + '</span></div>').join('') + '</div></section>';
      } else if (page === 'configuracoes') {
        extra.innerHTML = '<section class="panel"><h3>Armazenamento e privacidade</h3><p class="muted">Seus lançamentos são armazenados no Neon e acessados por uma API protegida. A senha e a credencial do banco não são armazenadas neste navegador.</p><button class="secondary-btn" id="export-data">Exportar backup JSON</button> <button class="secondary-btn" id="import-data">Importar backup JSON</button><input id="import-file" type="file" accept="application/json" hidden><button class="secondary-btn" id="logout-button-inline">Sair da conta</button></section>';
      } else if (page === 'orcamentos' || page === 'metas') {
        extra.innerHTML = '<section class="panel"><h3>' + titles[page] + '</h3><p class="empty-state">Esta seção ainda não possui cadastro funcional. Seus lançamentos e saldos já estão disponíveis nas outras telas.</p></section>';
      }
    }
    if (all) renderTransactions();
  }
  document.querySelectorAll('[data-page]').forEach(el => el.addEventListener('click', () => showPage(el.dataset.page)));
  $('#month-label').textContent = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^./, c => c.toUpperCase()) + '⌄';

  const logout = document.createElement('button');
  logout.type = 'button';
  logout.id = 'logout-button';
  logout.className = 'secondary-btn';
  logout.textContent = 'Sair';
  $('.top-actions').appendChild(logout);
  async function doLogout() {
    try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch (_) {}
    transactions = []; accounts = []; categories = [];
    showLogin();
  }
  logout.addEventListener('click', doLogout);

  document.addEventListener('click', async event => {
    if (event.target.closest('#logout-button-inline')) { await doLogout(); return; }
    if (event.target.closest('#export-data')) {
      const blob = new Blob([JSON.stringify({ version: 2, exported_at: new Date().toISOString(), transactions, accounts, categories }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = 'contas-backup-' + today() + '.json'; a.click(); URL.revokeObjectURL(url);
    }
    if (event.target.closest('#import-data')) $('#import-file').click();
  });
  document.addEventListener('change', async event => {
    if (event.target.id !== 'import-file' || !event.target.files?.[0]) return;
    try {
      const data = JSON.parse(await event.target.files[0].text());
      if (!data || !Array.isArray(data.transactions)) throw new Error('Formato inválido');
      if (!window.confirm('Importar este backup adicionará os lançamentos ao banco de dados. Os lançamentos existentes não serão excluídos. Deseja continuar?')) return;
      const failed = [];
      for (const row of data.transactions) {
        const categoryName = data.categories?.find(c => c.id === row.category_id)?.name || row.category_name;
        const accountName = data.accounts?.find(a => a.id === row.account_id)?.name || row.account_name;
        const category = categories.find(c => c.name === categoryName && c.kind === row.kind);
        const account = accounts.find(a => a.name === accountName);
        try {
          await api('/api/transactions', { method: 'POST', body: JSON.stringify({
            kind: row.kind, description: row.description, amount: row.amount,
            transaction_date: String(row.transaction_date || today()).slice(0, 10),
            category_id: category?.id || null, account_id: account?.id || null,
            paid: Boolean(row.paid), notes: row.notes || ''
          }) });
        } catch (_) { failed.push(row.description || 'Lançamento sem descrição'); }
      }
      await loadData();
      alert(failed.length ? 'Importação concluída parcialmente. Falharam ' + failed.length + ' lançamento(s).' : 'Backup importado com sucesso.');
    } catch (_) {
      alert('Não foi possível importar o arquivo. Selecione um backup JSON válido do Contas.');
    } finally { event.target.value = ''; }
  });

  (async () => {
    try {
      const session = await api('/api/auth/session');
      if (session.authenticated) await loadData();
      else showLogin();
    } catch (error) {
      showError('A API ainda não está disponível neste endereço. Abra o aplicativo pelo domínio da Vercel depois que a publicação for concluída.');
    }
  })();
})();