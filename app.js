(() => {
  // Configure este endereço após publicar a Neon Function. Não coloque DATABASE_URL aqui.
  const API_BASE = 'https://br-late-shape-b52qxln0-contasapi.compute.c-7.us-east-2.aws.neon.tech';
  const $ = (s) => document.querySelector(s);
  const money = n => Number(n || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const today = () => { const d=new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,10); };
  let transactions=[], categories=[], accounts=[];
  const dialog=$('#transaction-dialog'), form=$('#transaction-form');
  function notifyError(message){ const el=$('#form-error'); el.textContent=message; el.hidden=false; }
  function clearError(){ const el=$('#form-error'); el.textContent=''; el.hidden=true; }
  async function api(path, options={}) {
    if(!API_BASE) throw new Error('A interface está pronta, mas a URL da API Neon ainda precisa ser configurada em app.js antes de salvar ou carregar dados reais.');
    const response=await fetch(API_BASE+path,{...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
    const body=await response.text(); let data; try{data=body?JSON.parse(body):null}catch{data=body}
    if(!response.ok) throw new Error(data?.message||data?.error||'Falha HTTP '+response.status);
    return data;
  }
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function populateSelects(){
    $('#category').innerHTML='<option value="">Selecione uma categoria</option>'+categories.filter(c=>c.kind===$('#kind').value).map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('');
    $('#account').innerHTML='<option value="">Sem conta vinculada</option>'+accounts.filter(a=>!a.archived).map(a=>'<option value="'+esc(a.id)+'">'+esc(a.name)+'</option>').join('');
  }
  function render(){
    const month=today().slice(0,7);
    const current=transactions.filter(t=>String(t.transaction_date).slice(0,7)===month);
    const income=current.filter(t=>t.kind==='income').reduce((s,t)=>s+Number(t.amount),0);
    const expense=current.filter(t=>t.kind==='expense').reduce((s,t)=>s+Number(t.amount),0);
    const due=transactions.filter(t=>!t.paid).reduce((s,t)=>s+Number(t.amount),0);
    $('#income-total').textContent=money(income); $('#expense-total').textContent=money(expense);
    $('#due-total').textContent=money(due); $('#due-count').textContent=transactions.filter(t=>!t.paid).length+' pendentes';
    $('#total-balance').textContent=money(accounts.reduce((s,a)=>s+Number(a.initial_balance||0),0)+transactions.reduce((s,t)=>s+(t.kind==='income'?Number(t.amount):t.kind==='expense'?-Number(t.amount):0),0));
    const recent=[...transactions].sort((a,b)=>String(b.transaction_date).localeCompare(String(a.transaction_date))).slice(0,7);
    $('#recent-list').innerHTML=recent.length?recent.map(t=>{const cat=categories.find(c=>c.id===t.category_id);const acc=accounts.find(a=>a.id===t.account_id);return '<tr><td>'+esc(t.description)+'</td><td><span class="pill">'+esc(cat?.name||'Sem categoria')+'</span></td><td>'+esc(String(t.transaction_date||'').slice(0,10).split('-').reverse().join('/'))+'</td><td>'+esc(acc?.name||'—')+'</td><td class="'+(t.kind==='income'?'amount-income':'amount-expense')+'">'+(t.kind==='income'?'+ ':'− ')+money(t.amount)+'</td></tr>'}).join(''):'<tr><td colspan="5" class="empty-state">Nenhum lançamento cadastrado. Clique em “Novo lançamento” para começar.</td></tr>';
    const grouped={};current.filter(t=>t.kind==='expense').forEach(t=>{const c=categories.find(c=>c.id===t.category_id);const key=c?.name||'Outros';grouped[key]=(grouped[key]||0)+Number(t.amount)});
    const groups=Object.entries(grouped).sort((a,b)=>b[1]-a[1]).slice(0,5),max=Math.max(1,...groups.map(g=>g[1]));
    $('#category-list').innerHTML=groups.length?groups.map(([name,value])=>'<div class="category-row"><span class="category-icon">◈</span><div><div class="category-name">'+esc(name)+'</div><div class="category-track"><i style="width:'+(value/max*100)+'%"></i></div></div><span class="category-amount">'+money(value)+'</span></div>').join(''):'<div class="empty-state">Seus gastos por categoria aparecerão aqui quando você registrar lançamentos.</div>';
  }
  async function load(){
    try{[transactions,categories,accounts]=await Promise.all([api('/transactions'),api('/categories'),api('/accounts')]);transactions=Array.isArray(transactions)?transactions:transactions.data||[];categories=Array.isArray(categories)?categories:categories.data||[];accounts=Array.isArray(accounts)?accounts:accounts.data||[];populateSelects();render();}
    catch(error){console.info(error.message);render();}
  }
  function openDialog(){form.reset();clearError();form.elements.transaction_date.value=today();populateSelects();dialog.showModal();}
  $('#new-transaction').addEventListener('click',openDialog);
  $('#close-dialog').addEventListener('click',()=>dialog.close());
  $('#cancel-dialog').addEventListener('click',()=>dialog.close());
  $('#kind').addEventListener('change',populateSelects);
  form.addEventListener('submit',async e=>{e.preventDefault();clearError();const data={kind:form.elements.kind.value,description:form.elements.description.value.trim(),amount:Number(form.elements.amount.value),transaction_date:form.elements.transaction_date.value,category_id:form.elements.category_id.value||null,account_id:form.elements.account_id.value||null,paid:form.elements.paid.checked,notes:form.elements.notes.value.trim()};if(!data.description||data.amount<=0||!data.transaction_date){notifyError('Preencha descrição, valor e data corretamente.');return;}try{await api('/transactions',{method:'POST',body:JSON.stringify(data)});dialog.close();await load();}catch(error){notifyError(error.message);}});
  document.querySelectorAll('[data-page]').forEach(el=>el.addEventListener('click',()=>{const page=el.dataset.page;document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.page===page));$('#page-title').textContent=({inicio:'Visão geral',lancamentos:'Lançamentos',contas:'Minhas contas',orcamentos:'Orçamentos',metas:'Metas'})[page]||'Visão geral';if(page==='lancamentos')$('#new-transaction').focus();}));
  $('#month-label').textContent=new Date().toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase())+'⌄';
  load();
})();