(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const uid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
  let transactions = [], categories = [], accounts = [], editingId = null, busy = false, dashboardRows = [];
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
    .transaction-clickable-row{cursor:pointer}.transaction-clickable-row:hover{background:#f1f7f3}.transaction-clickable-row:focus{outline:2px solid #27865d;outline-offset:-2px}
    #transaction-details-dialog{width:min(92vw,520px);max-height:85vh;overflow:auto;border:0;border-radius:18px;padding:24px;box-shadow:0 24px 70px rgba(0,0,0,.24)}
    #transaction-details-dialog::backdrop{background:rgba(8,25,20,.58);backdrop-filter:blur(3px)}
    .transaction-details-list{display:flex;flex-direction:column;gap:0;margin:18px 0}.transaction-detail-item{display:flex;flex-direction:column;gap:5px;padding:13px 0;border-bottom:1px solid #e8eee9}.transaction-detail-item span{font-size:13px;color:#64748b}.transaction-detail-item strong{font-size:16px;color:#172a23;overflow-wrap:anywhere}
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

  const isBenefitCard = account => ['comprocard', 'le card'].includes(String(account?.name || '').trim().toLowerCase());

  function populateSelects(selectedCategory, selectedAccount) {
    const kind = $('#kind').value;
    const activeAccounts = accounts.filter(a => !a.archived);
    $('#category').innerHTML = '<option value="">Selecione uma categoria</option>' + categories
      .filter(c => c.kind === kind)
      .map(c => '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>').join('');
    $('#account').innerHTML = activeAccounts
      .map(a => '<option value="' + esc(a.id) + '">' + esc(a.name) + '</option>').join('');
    const transferableAccounts = activeAccounts.filter(a => !isBenefitCard(a));
    $('#transfer-from-account').innerHTML = '<option value="">Selecione a conta de origem</option>' + transferableAccounts
      .map(a => '<option value="' + esc(a.id) + '">' + esc(a.name) + (a.type === 'credit_card' ? ' (cartão)' : '') + '</option>').join('');
    $('#transfer-to-account').innerHTML = '<option value="">Selecione a conta de destino</option>' + transferableAccounts
      .map(a => '<option value="' + esc(a.id) + '">' + esc(a.name) + (a.type === 'credit_card' ? ' (cartão)' : '') + '</option>').join('');
    if (selectedCategory) $('#category').value = selectedCategory;
    const defaultAccount = activeAccounts.find(a => a.name.toLowerCase() === 'amex');
    $('#account').value = selectedAccount || defaultAccount?.id || activeAccounts[0]?.id || '';
    $('#transfer-from-account').value = selectedAccount || activeAccounts.find(a => a.type !== 'credit_card')?.id || activeAccounts[0]?.id || '';
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
  function dashboardDateRange() {
    const now = new Date(), iso = d => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0,10); };
    const period = $('#dash-period')?.value || 'month';
    let from = new Date(now.getFullYear(), now.getMonth(), 1), to = new Date(now.getFullYear(), now.getMonth()+1, 0);
    if (period === 'last-month') { from = new Date(now.getFullYear(), now.getMonth()-1, 1); to = new Date(now.getFullYear(), now.getMonth(), 0); }
    else if (period === '30' || period === '90') { from = new Date(now); from.setDate(from.getDate() - (Number(period)-1)); to = now; }
    else if (period === 'year') { from = new Date(now.getFullYear(),0,1); to = new Date(now.getFullYear(),11,31); }
    else if (period === 'all') { const dates = transactions.map(t => String(t.transaction_date || '').slice(0,10)).filter(Boolean).sort(); from = dates.length ? new Date(dates[0]+'T00:00:00') : new Date(now.getFullYear(),now.getMonth(),1); to = now; }
    else if (period === 'custom') { from = $('#dash-start')?.value ? new Date($('#dash-start').value+'T00:00:00') : new Date(now.getFullYear(),now.getMonth(),1); to = $('#dash-end')?.value ? new Date($('#dash-end').value+'T00:00:00') : now; }
    if ($('#dash-start') && period !== 'custom') $('#dash-start').value = iso(from);
    if ($('#dash-end') && period !== 'custom') $('#dash-end').value = iso(to);
    return { from: iso(from), to: iso(to) };
  }
  function populateDashboardFilters() {
    const account = $('#dash-account'), category = $('#dash-category');
    if (!account || !category) return;
    const oldAccount = account.value, oldCategory = category.value;
    account.innerHTML = '<option value="">Todas as contas</option>' + accounts.filter(a => !a.archived).map(a => '<option value="'+esc(a.id)+'">'+esc(a.name)+'</option>').join('');
    category.innerHTML = '<option value="">Todas as categorias</option>' + categories.map(c => '<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('');
    account.value = oldAccount; category.value = oldCategory;
  }
  function getDashboardRows() {
    const range = dashboardDateRange(), account = $('#dash-account')?.value || '', category = $('#dash-category')?.value || '';
    const kind = $('#dash-kind')?.value || '', status = $('#dash-status')?.value || '';
    return transactions.filter(t => {
      const date = String(t.transaction_date || '').slice(0,10);
      if (date < range.from || date > range.to) return false;
      if (account && (t.kind === 'transfer' ? t.transfer_from_account_id !== account && t.transfer_to_account_id !== account : t.account_id !== account)) return false;
      if (category && t.category_id !== category) return false;
      if (kind && t.kind !== kind) return false;
      if (status === 'paid' && !t.paid) return false;
      if (status === 'pending' && t.paid) return false;
      return true;
    });
  }
  function render() {
    populateDashboardFilters();
    dashboardRows = getDashboardRows();
    const income = dashboardRows.filter(t => t.kind === 'income').reduce((sum,t)=>sum+Number(t.amount),0);
    const expense = dashboardRows.filter(t => t.kind === 'expense').reduce((sum,t)=>sum+Number(t.amount),0);
    const dueItems = dashboardRows.filter(t => !t.paid && t.kind === 'expense' && accounts.find(a=>a.id===t.account_id)?.type !== 'credit_card');
    const selectedAccount = $('#dash-account')?.value;
    const balanceAccounts = selectedAccount ? accounts.filter(a=>a.id===selectedAccount) : accounts;
    $('#income-total').textContent = money(income);
    $('#expense-total').textContent = money(expense);
    $('#due-total').textContent = money(dueItems.reduce((sum,t)=>sum+Number(t.amount),0));
    $('#due-count').textContent = dueItems.length + (dueItems.length === 1 ? ' pendente' : ' pendentes');
    $('#total-balance').textContent = money(balanceAccounts.reduce((sum,a)=>sum+(a.type==='credit_card'?-getBalance(a):getBalance(a)),0));
    const result = income-expense, savings = income > 0 ? result/income*100 : 0;
    $('#dashboard-filter-summary').textContent = 'Exibindo '+dashboardRows.length+' lançamento(s), de '+new Date(dashboardDateRange().from+'T00:00:00').toLocaleDateString('pt-BR')+' até '+new Date(dashboardDateRange().to+'T00:00:00').toLocaleDateString('pt-BR')+'.';
    renderTransactions(); renderCategories(dashboardRows, 'expense', '#category-list'); renderCategories(dashboardRows, 'income', '#income-category-list'); renderChart(); renderAccountsPage(); renderDashboardInsights(dashboardRows,income,expense,result,savings); renderSmartFinance(dashboardRows,income,expense,result);
  }

  function renderSmartFinance(rows,income,expense,result) {
    const range=dashboardDateRange();
    const parseDate=value=>new Date(String(value).slice(0,10)+'T00:00:00');
    const days=Math.max(1,Math.round((parseDate(range.to)-parseDate(range.from))/86400000)+1);
    const previousEnd=new Date(parseDate(range.from)); previousEnd.setDate(previousEnd.getDate()-1);
    const previousStart=new Date(previousEnd); previousStart.setDate(previousStart.getDate()-days+1);
    const iso=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
    const previous=transactions.filter(t=>{const d=String(t.transaction_date||'').slice(0,10);return d>=iso(previousStart)&&d<=iso(previousEnd);});
    const prevIncome=previous.filter(t=>t.kind==='income').reduce((s,t)=>s+Number(t.amount),0);
    const prevExpense=previous.filter(t=>t.kind==='expense').reduce((s,t)=>s+Number(t.amount),0);
    const pct=(current,old)=>old>0?((current-old)/old*100):null;
    const expenseChange=pct(expense,prevExpense), incomeChange=pct(income,prevIncome);
    const cashAccounts=accounts.filter(a=>a.type!=='credit_card');
    const cashBalance=cashAccounts.reduce((s,a)=>s+getBalance(a),0);
    const unpaid=transactions.filter(t=>!t.paid&&t.kind==='expense'&&accounts.find(a=>a.id===t.account_id)?.type!=='credit_card').reduce((s,t)=>s+Number(t.amount),0);
    const cardDebt=accounts.filter(a=>a.type==='credit_card').reduce((s,a)=>s+Math.max(0,getBalance(a)),0);
    const available=cashBalance-unpaid-cardDebt;
    const monthStart=new Date(new Date().getFullYear(),new Date().getMonth(),1);
    const nextMonth=new Date(new Date().getFullYear(),new Date().getMonth()+1,1);
    const now=new Date();
    const elapsed=Math.max(1,Math.min(now.getDate(),new Date(now.getFullYear(),now.getMonth()+1,0).getDate()));
    const monthDays=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
    const monthKey=iso(monthStart).slice(0,7);
    const monthExpenses=transactions.filter(t=>t.kind==='expense'&&t.paid&&String(t.transaction_date||'').slice(0,7)===monthKey).reduce((s,t)=>s+Number(t.amount),0);
    const projection=monthExpenses/elapsed*monthDays;
    const projectionValid=now>=monthStart&&now<nextMonth&&monthExpenses>0;
    $('#smart-available').textContent=money(available);
    $('#smart-pending').textContent=money(unpaid);
    $('#smart-card-debt').textContent=money(cardDebt);
    $('#smart-projection').textContent=projectionValid?money(projection):'—';
    $('#smart-projection-note').textContent=projectionValid?'Estimativa pelo ritmo de despesas pagas neste mês':'Ainda não há dados suficientes para projetar';
    const expenseText=expenseChange===null?'Não há período anterior com despesas para comparar.':(expenseChange>0?'As despesas aumentaram ':'As despesas diminuíram ')+Math.abs(expenseChange).toFixed(1).replace('.',',')+'% em relação ao período anterior.';
    const incomeText=incomeChange===null?'Ainda não há base anterior de receitas.':(incomeChange>0?'As receitas cresceram ':'As receitas caíram ')+Math.abs(incomeChange).toFixed(1).replace('.',',')+'% no comparativo.';
    $('#smart-comparison').innerHTML='<p>'+esc(expenseText)+'</p><p>'+esc(incomeText)+'</p>';
    const ratio=income>0?expense/income*100:null;
    let health=ratio===null?'Não há receitas no período selecionado para calcular o comprometimento da renda.':ratio>100?'As despesas superaram as receitas no período. Revise os gastos e lançamentos pendentes.':ratio>=80?'As despesas consumiram '+ratio.toFixed(1).replace('.',',')+'% das receitas; sua margem está apertada.':'As despesas consumiram '+ratio.toFixed(1).replace('.',',')+'% das receitas, deixando uma margem de '+(100-ratio).toFixed(1).replace('.',',')+'%.';
    $('#smart-health').innerHTML='<p>'+esc(health)+'</p><p>Resultado do período: <strong class="'+(result>=0?'positive':'amount-expense')+'">'+money(result)+'</strong>.</p>';
  }

  function renderDashboardInsights(rows,income,expense,result,savings) {
    const accountTotals = {};
    rows.filter(t=>t.kind==='expense').forEach(t=>{ const a=accounts.find(x=>x.id===t.account_id); const name=t.account_name||a?.name||'Conta não identificada'; accountTotals[name]=(accountTotals[name]||0)+Number(t.amount); });
    const pairs=Object.entries(accountTotals).sort((a,b)=>b[1]-a[1]);
    $('#dash-account-breakdown').innerHTML=pairs.length?pairs.slice(0,6).map(([name,value])=>'<div class="insight-row"><span>'+esc(name)+'</span><strong>'+money(value)+'</strong></div>').join(''):'<p class="empty-state">Sem despesas neste filtro.</p>';
    const top=rows.filter(t=>t.kind==='expense').sort((a,b)=>Number(b.amount)-Number(a.amount)).slice(0,5);
    $('#dash-top-expenses').innerHTML=top.length?top.map(t=>'<div class="insight-row"><span>'+esc(t.description||'Despesa')+'<small>'+esc(t.category_name||categories.find(c=>c.id===t.category_id)?.name||'Sem categoria')+'</small></span><strong>'+money(t.amount)+'</strong></div>').join(''):'<p class="empty-state">Nenhuma despesa encontrada.</p>';
    $('#dash-result-card').innerHTML='<strong class="'+(result>=0?'positive':'amount-expense')+'">'+money(result)+'</strong><div class="result-meta"><span>Receitas: '+money(income)+'</span><span>Despesas: '+money(expense)+'</span><span>Economia sobre receitas: '+(Number.isFinite(savings)?savings.toFixed(1).replace('.',','):'0,0')+'%</span></div>';
  }
  function renderTransactions() {
    const allPage = document.querySelector('.nav-item.active')?.dataset.page === 'lancamentos';
    const source = allPage ? transactions : (dashboardRows || transactions);
    const list = [...source].sort((a, b) => String(b.transaction_date).localeCompare(String(a.transaction_date)));
    const visible = allPage ? list : list.slice(0, 7);
    $('#recent-list').innerHTML = visible.length ? visible.map(t => transactionRow(t)).join('') :
      '<tr><td colspan="6" class="empty-state">' + (allPage ? 'Nenhum lançamento encontrado no período selecionado.' : 'Nenhum lançamento cadastrado. Clique em “Novo lançamento” para começar.') + '</td></tr>';
    if (allPage) {
      const subtitle = $('.transactions-panel .panel-heading p');
      if (subtitle) subtitle.textContent = 'Exibindo todos os ' + list.length + ' lançamento(s) do período selecionado.';
    }
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
    return '<tr class="transaction-clickable-row" data-view="' + esc(t.id) + '" tabindex="0" role="button" aria-label="Ver detalhes de ' + esc(t.description) + '"><td>' + esc(t.description) + '</td><td><span class="pill">' + esc(transfer ? 'Transferência' : t.category_name || cat?.name || 'Sem categoria') + '</span></td><td>' + esc(date) + '</td><td>' + esc(accountLabel) + '</td><td class="' + amountClass + '">' + sign + money(t.amount) + (t.paid ? '' : ' <small>(pendente)</small>') + '</td>' + actions + '</tr>';
  }
  function showTransactionDetails(t) {
    const cat = categories.find(c => c.id === t.category_id);
    const acc = accounts.find(a => a.id === t.account_id);
    const transfer = t.kind === 'transfer';
    const date = String(t.transaction_date || '').slice(0,10).split('-').reverse().join('/');
    const details = [
      ['Tipo', transfer ? 'Transferência' : t.kind === 'income' ? 'Receita' : 'Despesa'],
      ['Descrição', t.description || '—'],
      ['Valor', money(t.amount)],
      ['Data', date || '—'],
      ['Categoria', transfer ? 'Não se aplica' : t.category_name || cat?.name || 'Sem categoria'],
      ['Conta', transfer ? (t.transfer_from_account_name || '—') + ' → ' + (t.transfer_to_account_name || '—') : t.account_name || acc?.name || '—'],
      ['Situação', transfer || t.paid ? 'Pago/recebido' : 'Pendente'],
      ['Observações', t.notes || 'Nenhuma observação']
    ];
    let modal = $('#transaction-details-dialog');
    if (!modal) {
      modal = document.createElement('dialog');
      modal.id = 'transaction-details-dialog';
      modal.innerHTML = '<div class="dialog-head"><div><div class="eyebrow">DETALHES DA MOVIMENTAÇÃO</div><h2>Detalhes do lançamento</h2></div><button type="button" class="close-btn" data-close-details aria-label="Fechar">×</button></div><div class="transaction-details-list"></div><div class="dialog-actions"><button type="button" class="secondary-btn" data-close-details>Fechar</button></div>';
      document.body.appendChild(modal);
      modal.addEventListener('click', event => {
        if (event.target.closest('[data-close-details]')) modal.close();
      });
    }
    modal.querySelector('.transaction-details-list').innerHTML = details.map(([label,value]) => '<div class="transaction-detail-item"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>').join('');
    if (typeof modal.showModal === 'function') modal.showModal(); else modal.setAttribute('open','');
  }
  function renderCategories(current, kind = 'expense', targetSelector = '#category-list') {
    const grouped = {};
    current.filter(t => t.kind === kind).forEach(t => {
      const category = categories.find(c => c.id === t.category_id);
      const name = t.category_name || category?.name || 'Sem categoria';
      grouped[name] = (grouped[name] || 0) + Number(t.amount);
    });
    const groups = Object.entries(grouped).sort((a,b)=>b[1]-a[1]).slice(0,7);
    const total = groups.reduce((sum,item)=>sum+item[1],0);
    const colors = ['#23845b','#e2a18d','#6b8fc7','#d2a64b','#8b79b8','#55a6a0','#a0aa9f'];
    const stops = []; let cursor = 0;
    groups.forEach(([name,value],i)=>{ const end=total ? cursor+value/total*100 : cursor; stops.push(colors[i]+' '+cursor+'% '+end+'%'); cursor=end; });
    const chart = $(targetSelector);
    const noun = kind === 'income' ? 'receitas' : 'despesas';
    const totalLabel = kind === 'income' ? 'Total recebido' : 'Total gasto';
    if (!groups.length) { chart.innerHTML='<p class="empty-state">Não há '+noun+' neste período para montar a distribuição.</p>'; return; }
    chart.innerHTML='<div class="category-visual"><div class="category-donut" style="background:conic-gradient('+stops.join(',')+')"><div class="category-donut-center"><strong>'+money(total)+'</strong><small>'+totalLabel+'</small></div></div><div class="category-legend">'+groups.map(([name,value],i)=>'<div class="category-legend-row"><i style="background:'+colors[i]+'"></i><span>'+esc(name)+'</span><strong>'+((value/total)*100).toFixed(1).replace('.',',')+'% · '+money(value)+'</strong></div>').join('')+'</div></div>';
  }
  function renderChart() {
    const range = dashboardDateRange();
    const start = new Date(range.from + 'T00:00:00');
    const finish = new Date(range.to + 'T00:00:00');
    const rows = dashboardRows || transactions;
    const renderDailySeries = (kind, targetSelector, insightSelector, noun, color) => {
      const dailyRows = rows.filter(t => t.kind === kind);
      const buckets = [];
      for (let day = new Date(start); day <= finish; day.setDate(day.getDate() + 1)) {
        const date = new Date(day);
        const key = [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
        const total = dailyRows.filter(t => String(t.transaction_date || '').slice(0,10) === key)
          .reduce((sum,t) => sum + Number(t.amount), 0);
        buckets.push({ day: date.getDate(), total });
      }
      const max = Math.max(1, ...buckets.map(b => b.total));
      const chart = $(targetSelector);
      if (!chart) return;
      chart.classList.add('daily-bar-chart');
      chart.style.setProperty('--bar-count', Math.max(1, buckets.length));
      chart.innerHTML = buckets.map(b =>
        '<div class="daily-bar-column" title="Dia ' + b.day + ': ' + money(b.total) + '">' +
          '<strong class="daily-bar-value">' + (b.total ? money(b.total).replace(',00','') : '—') + '</strong>' +
          '<div class="daily-bar-track"><i style="height:' + (b.total / max * 100) + '%;background:' + color + '"></i></div>' +
          '<span class="daily-bar-day">' + b.day + '</span>' +
        '</div>'
      ).join('') || '<p class="empty-state">Sem dias neste período.</p>';
      const total = buckets.reduce((sum,b) => sum + b.total, 0);
      const insight = $(insightSelector);
      if (insight) insight.textContent = total
        ? 'Total de ' + noun + ' no período: ' + money(total) + '.'
        : 'Ainda não há ' + noun + ' neste período.';
    };
    renderDailySeries('expense', '#chart-bars', '#flow-chart-insight', 'despesas', '#e4a18f');
    renderDailySeries('income', '#income-chart-bars', '#income-chart-insight', 'receitas', '#27865d');
  }
  function renderAccountsPage() {
    const target = $('#accounts-list');
    if (!target) return;
    const bankAccounts = accounts.filter(a => a.type !== 'credit_card' && !isBenefitCard(a));
    const cards = accounts.filter(a => a.type === 'credit_card');
    const benefitCards = accounts.filter(isBenefitCard);
    const renderGroup = (items, title, mode) => items.length ? '<section class="account-group"><h4>' + title + '</h4>' + items.map(a =>
      '<div class="category-row account-row"><span class="category-icon">' + (mode === 'credit' ? '▤' : mode === 'benefit' ? '▧' : '▣') + '</span><div><div class="category-name">' + esc(a.name) +
      '</div><div class="muted">' + (mode === 'credit' ? 'Cartão de crédito · Fatura em aberto' : mode === 'benefit' ? 'Cartão alimentação · Saldo disponível' : 'Saldo inicial: ' + money(a.initial_balance)) + '</div></div><strong>' + money(getBalance(a)) +
      '</strong>' + (mode === 'credit' ? '<button type="button" class="secondary-btn pay-card-btn" data-pay-card="' + esc(a.id) + '">Pagar fatura</button>' : '') + '</div>').join('') + '</section>' : '';
    target.innerHTML = accounts.length ? renderGroup(bankAccounts, 'Contas bancárias', 'bank') + renderGroup(cards, 'Cartões de crédito', 'credit') + renderGroup(benefitCards, 'Cartões alimentação', 'benefit') :
      '<p class="empty-state">Nenhuma conta cadastrada.</p>';
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
    const payCard = event.target.closest('[data-pay-card]');
    if (payCard) {
      const card = accounts.find(a => a.id === payCard.dataset.payCard);
      if (card) openDialog({ kind: 'transfer', description: 'Pagamento da fatura - ' + card.name, amount: '', transaction_date: today(), paid: true, transfer_to_account_id: card.id });
      return;
    }
    const view = event.target.closest('[data-view]');
    if (view && !event.target.closest('[data-edit], [data-delete]')) {
      const transaction = transactions.find(t => t.id === view.dataset.view);
      if (transaction) showTransactionDetails(transaction);
      return;
    }
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
    $('.dashboard-filters').hidden = !overview;
    $('.dashboard-insights').hidden = !overview;
    $('.smart-finance').hidden = !overview;
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
  ['dash-period','dash-account','dash-category','dash-kind','dash-status'].forEach(id => $('#'+id)?.addEventListener('change', () => { if(id==='dash-period' && $('#dash-period').value!=='custom') { } render(); }));
  ['dash-start','dash-end'].forEach(id => $('#'+id)?.addEventListener('change', () => { $('#dash-period').value='custom'; render(); }));
  $('#reset-dashboard-filters')?.addEventListener('click', () => { $('#dash-period').value='month'; $('#dash-account').value=''; $('#dash-category').value=''; $('#dash-kind').value=''; $('#dash-status').value=''; render(); });
  const localToday = today();
  $('#today-label').textContent = new Date(localToday + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, c => c.toUpperCase());
  $('#month-label').value = localToday.slice(0, 7);
  $('#month-label').addEventListener('change', () => {
    const selected = $('#month-label').value;
    if (!selected) return;
    const [year, month] = selected.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    $('#dash-period').value = 'custom';
    $('#dash-start').value = selected + '-01';
    $('#dash-end').value = selected + '-' + String(lastDay).padStart(2, '0');
    render();
  });

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