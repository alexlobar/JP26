/* ============================================================
   views-money.js — Gastos: resumen con gráficos, lista,
   reparto entre viajeros y formulario rápido
   (importe → categoría → guardar).
   ============================================================ */
(function () {
  'use strict';

  const U = JT.utils, D = JT.data, S = JT.store, L = JT.logic, UI = JT.ui, C = JT.cards, SV = JT.services;
  const esc = U.esc;
  const V = JT.views, F = JT.forms, A = JT.actions;

  V.expenses = function () {
    const s = S.get(), st = JT.uiState.expenses;
    const list = Object.values(s.expenses).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    let html = UI.header({ title: 'Gastos', subtitle: s.trip.totalBudget ? 'Presupuesto ' + U.money(s.trip.totalBudget, s.trip.mainCurrency) : '',
      actions: UI.iconBtn('swap', s.settings.moneyView === 'eur' ? 'Ver importes en yenes' : 'Ver importes en euros', { act: 'moneyToggle' }) + UI.iconBtn('share', 'Compartir resumen', { act: 'shareExpenses' }) + UI.iconBtn('download', 'Exportar CSV', { act: 'exportCsv' }) }) + C.sampleBanner();
    html += '<div class="seg" role="tablist">' + [['summary', 'Resumen'], ['list', 'Lista (' + list.length + ')'], ['split', 'Reparto']].map((t) =>
      '<button type="button" role="tab" class="seg__item' + (st.tab === t[0] ? ' is-on' : '') + '" aria-selected="' + (st.tab === t[0]) + '" data-act="expTab" data-value="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>';
    if (st.tab === 'summary' || !list.length) html += walletCard() + UI.card(quickExpenseRow(), { cls: 'stack-sm' });
    if (!list.length) html += UI.empty('💴', 'Sin gastos', 'Pulsa + para registrar uno en 3 toques.', UI.btn('Añadir gasto', { data: { act: 'newExpense' } }));
    else if (st.tab === 'list') html += expenseList(list);
    else if (st.tab === 'split') html += split(list);
    else html += summary(list);
    return { html: html };
  };

  /* ── Conversor ¥ ⇄ € a pantalla entera (atajo del icono, botón ⇄ de Inicio) ──
     Escribes yenes y ves los euros en grande (o al revés con ⇄), con importes rápidos y cómo se dice en japonés. */
  V.convert = function () {
    const st = JT.uiState.conv || (JT.uiState.conv = { dir: 'jpy', value: '' });
    const rates = SV.rates(), main = S.get().trip.mainCurrency, other = main === 'JPY' ? 'EUR' : main;
    const quick = st.dir === 'jpy' ? [100, 500, 1000, 3000, 5000, 10000] : [5, 10, 20, 50, 100, 200];
    return {
      html: UI.header({ back: true, title: 'Conversor', subtitle: st.dir === 'jpy' ? 'Yenes → ' + (other === 'EUR' ? 'euros' : other) : (other === 'EUR' ? 'Euros' : other) + ' → yenes' }) +
        '<div class="convpage">' + C.quickConverter() +
        (rates ? '<div class="chips convpage__quick">' + quick.map((v) => '<button type="button" class="chip chip--btn" data-act="convQuick" data-v="' + v + '"><span>' + (st.dir === 'jpy' ? U.money(v, 'JPY') : U.money(v, other)) + '</span></button>').join('') + '</div>' : '') +
        (rates ? cmpCard() : '') +
        '<small class="faint center block">' + (rates ? (rates.source === 'manual' ? 'Tipo manual' : 'Tipo del BCE' + (rates.date ? ' del ' + U.fmtShort(rates.date) : '') + (rates.rounding ? ' · yen a la baja ' + (rates.rounding === 'down2' ? '−2' : '−1') : '')) + '. Funciona sin conexión.' : '') + '</small></div>',
      mount: function (root) { const i = root.querySelector('.conv__in'); if (i && !st.value) setTimeout(() => i.focus(), 50); }
    };
  };
  /** «Apuntar este gasto»: abre el gasto con el importe del conversor, en la moneda que escribiste. */
  A.convToExpense = function () {
    const st = JT.uiState.conv || {}, n = U.parseAmount(st.value || '');
    if (!n) return UI.toast('Escribe primero un importe en el conversor');
    const main = S.get().trip.mainCurrency, other = main === 'JPY' ? 'EUR' : main;
    F.expense(null, { amount: n, currency: st.dir === 'jpy' ? 'JPY' : other });
  };

  /* Comparar con España: precio aquí (¥) frente a lo que costaría allí (€). */
  function cmpResult() {
    const c = JT.uiState.cmp || {}, jp = U.parseAmount(c.jp || ''), es = U.parseAmount(c.es || '');
    if (!jp || !es) return 'Escribe los dos precios y te digo dónde sale más barato.';
    const jpEur = U.convert(jp, 'JPY', 'EUR', SV.rates());
    if (jpEur === null) return 'Sin tipo de cambio guardado.';
    const diff = es - jpEur, pct = Math.round(Math.abs(diff) / es * 100);
    if (Math.abs(diff) < 0.01 * es) return '≈ Lo mismo: ' + U.money(jpEur, 'EUR') + ' aquí frente a ' + U.money(es, 'EUR') + ' en España.';
    return diff > 0 ? '✅ Aquí te ahorras un ' + pct + ' % (' + U.money(diff, 'EUR') + '): ' + U.money(jpEur, 'EUR') + ' frente a ' + U.money(es, 'EUR') + ' en España.'
      : '⚠️ Aquí es un ' + pct + ' % más caro (' + U.money(-diff, 'EUR') + ' más): ' + U.money(jpEur, 'EUR') + ' frente a ' + U.money(es, 'EUR') + ' en España.';
  }
  function cmpCard() {
    const c = JT.uiState.cmp || (JT.uiState.cmp = {}), conv = JT.uiState.conv || {};
    if (!c.jp && conv.dir === 'jpy' && conv.value) c.jp = conv.value;
    return UI.card('<small class="eyebrow muted">COMPARAR CON ESPAÑA</small>' +
      '<div class="cmp"><label class="field"><span class="field__label">Precio aquí (¥)</span><input class="input" inputmode="decimal" placeholder="3000" value="' + esc(c.jp || '') + '" data-input="cmpJp" autocomplete="off"></label>' +
      '<label class="field"><span class="field__label">En España (€)</span><input class="input" inputmode="decimal" placeholder="25" value="' + esc(c.es || '') + '" data-input="cmpEs" autocomplete="off"></label></div>' +
      '<p class="cmp__out" id="cmpOut" data-noeur>' + esc(cmpResult()) + '</p>', { cls: 'stack-sm' });
  }
  JT.changes.cmpJp = (el) => { (JT.uiState.cmp = JT.uiState.cmp || {}).jp = el.value; const o = document.getElementById('cmpOut'); if (o) o.textContent = cmpResult(); };
  JT.changes.cmpEs = (el) => { (JT.uiState.cmp = JT.uiState.cmp || {}).es = el.value; const o = document.getElementById('cmpOut'); if (o) o.textContent = cmpResult(); };

  A.convQuick = function (el) {
    const i = document.querySelector('.conv__in');
    if (!i) return;
    i.value = el.dataset.v;
    JT.changes.quickConv(i);
  };

  A.expTab = (el) => { JT.uiState.expenses.tab = el.dataset.value; JT.app.render(); };
  A.shareExpenses = async () => { const r = await SV.share(L.shareExpenses(SV.rates()), 'Gastos'); if (r === 'copied') UI.toast('Copiado'); };
  A.exportCsv = () => SV.download('gastos-japon.csv', L.expensesCsv(), 'text/csv');

  /** «1 EUR = ¥178 (BCE 177,32)»: el yen siempre como yenes por unidad, que es como se lee en las casas de cambio. */
  function rateText(c, main, rates) {
    const yen = c === 'JPY' && main !== 'JPY';
    const from = yen ? main : c, to = yen ? 'JPY' : main;
    const v = U.convert(1, from, to, rates);
    if (!v) return c + ': sin tipo';
    const manual = (S.get().settings.manualRates || {})[c] > 0;
    const ex = rates.rounding && to === 'JPY' && !manual ? U.convert(1, from, to, { base: rates.base, perUnit: rates.exact }) : null;
    return '1 ' + from + ' = ' + U.money(v, to) + (ex && Math.abs(ex - v) > 0.005 ? ' (BCE ' + ex.toFixed(2).replace('.', ',') + ')' : '');
  }

  function ratesInfo(list) {
    const s = S.get(), main = s.trip.mainCurrency, rates = SV.rates();
    const foreign = Array.from(new Set(list.map((e) => e.currency).filter((c) => c !== main)));
    if (!foreign.length) return '';
    const line = rates ? foreign.map((c) => rateText(c, main, rates)).join(' · ') : foreign.join(', ') + ': sin tipo';
    const msg = rates
      ? (rates.source === 'manual' ? 'Tipo manual' : 'BCE vía Frankfurter' + (rates.date ? ', ' + rates.date : '')) + (rates.source === 'mixed' ? ' + manual' : '') +
        (rates.rounding ? ' · yen a la baja ' + (rates.rounding === 'down2' ? '−2' : '−1') : '') + (SV.online() ? '' : ' · sin conexión (último guardado)')
      : 'Conéctate una vez para obtener el tipo de cambio (se guarda para usarlo sin conexión).';
    return UI.banner(rates ? 'neutral' : 'warn', 'swap', line, msg, { action: SV.online() ? UI.btn('Actualizar', { size: 'sm', variant: 'ghost', data: { act: 'refreshRates' } }) : '' });
  }

  A.refreshRates = async function () {
    try { await SV.fetchRates(S.get().trip.mainCurrency); UI.toast('Tipo de cambio actualizado'); JT.app.render(); } catch (e) { UI.toast(e.message); }
  };

  /* Resumen por ciudad: los chips de arriba cambian TODO el resumen a esa ciudad (no sólo la lista). */
  A.sumCity = (el) => { JT.uiState.expenses.sumCity = el.dataset.value || ''; JT.app.render(); };
  function summary(listAll) {
    const s = S.get(), main = s.trip.mainCurrency, rates = SV.rates(), t = S.today(), st = JT.uiState.expenses;
    const order = S.sortedDays().map((d) => d.cityId).filter((v, i, a) => v && s.cities[v] && a.indexOf(v) === i);
    const withExp = order.filter((id) => listAll.some((e) => e.cityId === id)), hasNone = listAll.some((e) => !e.cityId || !s.cities[e.cityId]);
    const sel = st.sumCity && (st.sumCity === 'none' ? hasNone : withExp.indexOf(st.sumCity) > -1) ? st.sumCity : '';
    const list = !sel ? listAll : listAll.filter((e) => (sel === 'none' ? !e.cityId || !s.cities[e.cityId] : e.cityId === sel));
    const cityChips = withExp.length > 1 || (withExp.length && hasNone) ? UI.filterChips([{ value: '', label: 'Todo el viaje' }].concat(withExp.map((id) => ({ value: id, label: s.cities[id].name }))).concat(hasNone ? [{ value: 'none', label: 'Sin ciudad / antes' }] : []), sel, 'sumCity') : '';
    const selName = sel === 'none' ? 'Sin ciudad / antes del viaje' : sel ? s.cities[sel].name : '';
    const total = C.moneySum(list), budget = sel ? (sel !== 'none' && s.cities[sel].budget) || 0 : s.trip.totalBudget;
    const inTrip = list.filter((e) => e.date >= s.trip.startDate && e.date <= s.trip.endDate);
    const nDays = new Set(inTrip.map((e) => e.date)).size;
    const avg = nDays ? C.moneySum(inTrip).total / nDays : 0;
    const group = function (keyFn) {
      const m = {};
      list.forEach((e) => { const k = keyFn(e); if (k === undefined) return; const v = U.convert(e.amount, e.currency, main, rates); if (v !== null) m[k] = (m[k] || 0) + v; });
      return Object.keys(m).map((k) => [k, m[k]]).sort((a, b) => b[1] - a[1]);
    };
    const byCat = C.byCategory(list), byCity = group((e) => e.cityId || 'none');
    const byDay = group((e) => (e.date >= s.trip.startDate && e.date <= s.trip.endDate ? e.date : undefined)).sort((a, b) => a[0].localeCompare(b[0]));
    let html = (cityChips ? '<div class="sumcity">' + cityChips + '</div>' : '') +
      UI.card((sel ? '<small class="eyebrow muted">RESUMEN DE ' + esc(selName.toUpperCase()) + '</small>' : '') +
      '<div class="stats">' + UI.stat(sel ? 'Gastado en ' + selName : meInfo().multi ? 'Total del viaje (todos)' : 'Total gastado', total.text, sel ? list.length + (list.length === 1 ? ' gasto' : ' gastos') : '', true) + (budget ? UI.stat('Restante', U.money(budget - total.total, main), Math.round((total.total / budget) * 100) + '% del presupuesto' + (sel ? ' de la ciudad' : '')) : '') + '</div>' +
      (budget ? UI.progress(total.total / budget, total.total > budget ? 'accent' : 'info') : '') +
      '<div class="stats">' + UI.stat('Hoy', C.moneySum(list.filter((e) => e.date === t.now.date)).text) + UI.stat('Media diaria', U.money(avg, main), nDays ? nDays + ' días con gastos' : 'en el viaje') + '</div>' +
      (total.extra ? '<small class="warn">Sin convertir: ' + esc(total.extra) + '</small>' : '') + (sel ? '' : netLine(total.total) + forecast(list, total.total)) +
      (sel ? UI.btn('Ver sus gastos en la lista', { icon: 'list', size: 'sm', variant: 'ghost', data: { act: 'expFilter', k: 'cityId', v: sel === 'none' ? '' : sel } }) : ''), { cls: 'stack' });
    html += ratesInfo(list);
    html += phaseSection(list, total.total);
    if (!sel) html += refundsSection();
    // Reparto de un vistazo (barra de colores) y, debajo, cada categoría con su color y su %.
    const catTotal = byCat.reduce((a, x) => a + x[1], 0);
    html += UI.section('Por categoría', UI.card('<div class="stack">' + C.catStack(list) +
      UI.bars(byCat.map((x) => ({ label: D.EXPENSE[x[0]][0], emoji: D.EXPENSE[x[0]][1], value: x[1], color: C.catColor(x[0]),
        display: U.money(x[1], main) + ' · ' + C.pctText(x[1], catTotal), data: { act: 'expFilter', k: 'category', v: x[0] } }))) + '</div>'), '<small class="faint">Toca una para ver sus gastos</small>');
    // Cómo has pagado: efectivo, tarjeta, Suica… (el total es el mismo; esto es sólo el reparto).
    const byPay = group((e) => e.paymentMethod || 'none'), payTotal = byPay.reduce((a, x) => a + x[1], 0);
    if (byPay.length) html += UI.section('Por forma de pago', UI.card(UI.bars(byPay.map((x) => ({
      label: x[0] === 'none' ? 'Sin indicar' : (D.PAYMENT[x[0]] || ['Otro'])[0], emoji: x[0] === 'none' ? '·' : (D.PAYMENT[x[0]] || ['', '•'])[1], value: x[1],
      color: 'var(--t-' + (PAY_TONE[x[0]] || 'slate') + ')', display: U.money(x[1], main) + ' · ' + C.pctText(x[1], payTotal), data: { act: 'expFilter', k: 'paymentMethod', v: x[0] === 'none' ? '' : x[0] }
    })))));
    // Por ciudad, con la media por día de estancia (para ver qué ciudad sale más cara).
    const daysIn = {};
    S.sortedDays().forEach((d) => { if (d.cityId) daysIn[d.cityId] = (daysIn[d.cityId] || 0) + 1; });
    if (!sel) html += UI.section('Por ciudad', UI.card(UI.bars(byCity.map(function (x) {
      const c = s.cities[x[0]], nd = c ? daysIn[c.id] : 0;
      return { label: (c ? c.name : 'Sin ciudad / antes del viaje') + (nd ? ' · ' + nd + (nd === 1 ? ' día' : ' días') : ''), value: x[1],
        display: U.money(x[1], main) + (nd ? ' · ' + U.money(x[1] / nd, main) + '/día' : '') + (c && c.budget ? ' / ' + U.money(c.budget, main, true) : ''),
        data: { act: 'expFilter', k: 'cityId', v: c ? c.id : '' } };
    }), '#2F6F73')), '<small class="faint">toca una para ver sus gastos</small>');
    if (byDay.length) html += UI.section('Por día', UI.card(UI.bars(byDay.map((x) => ({ label: U.fmtDay(x[0]), value: x[1], display: U.money(x[1], main), data: { act: 'expFilter', k: 'date', v: x[0] } })), '#B0893E')));
    html += taxFreeSection(list);
    return html;
  }

  /* ── Antes, durante y después del viaje ── */
  const PHASE = { pre: ['✈️', 'Antes del viaje'], trip: ['🗾', 'Durante el viaje'], post: ['🏠', 'Después del viaje'] };
  function phaseOf(e) { const t = S.get().trip; return e.date < t.startDate ? 'pre' : e.date > t.endDate ? 'post' : 'trip'; }
  C.phaseOf = phaseOf;
  function phaseSection(list, total) {
    const s = S.get(), main = s.trip.mainCurrency, rates = SV.rates();
    const parts = ['pre', 'trip', 'post'].map((k) => ({ k: k, list: list.filter((e) => phaseOf(e) === k) })).filter((x) => x.list.length);
    if (!parts.length) return '';
    return UI.section('Antes y durante el viaje', '<div class="phases">' + parts.map(function (x) {
      const sum = C.moneySum(x.list), days = x.k === 'trip' ? new Set(x.list.map((e) => e.date)).size : 0;
      return '<div class="phase card--tap" role="button" tabindex="0" data-act="expFilter" data-k="phase" data-v="' + x.k + '">' +
        '<span class="phase__head">' + PHASE[x.k][0] + ' ' + PHASE[x.k][1] + '</span><strong class="phase__v mono">' + esc(sum.text) + '</strong>' +
        '<small class="muted">' + x.list.length + (x.list.length === 1 ? ' gasto' : ' gastos') + (total ? ' · ' + C.pctText(sum.total, total) + ' del total' : '') + (days ? ' · ' + U.money(sum.total / days, main) + '/día' : '') + '</small>' +
        C.catStack(x.list, 3) + '</div>';
    }).join('') + '</div>', '<small class="faint">toca para ver sus gastos</small>');
  }

  /* ── Dinero recibido: lo que te pagan personas de fuera del viaje (regalos, devoluciones…) ──
     Salda tus gastos: el total sigue siendo lo gastado y aparte ves lo recibido y el neto (lo que pones tú).
     Puede ir ligado a un gasto (lo marca como «cubierto») o ser general. Lo que te paga otro viajero va en Reparto. */
  const REFUND_KIND = { gift: ['Regalo', '🎁'], refund: ['Devolución', '↩️'], other: ['Otro', '💶'] };
  function refundsTotal() {
    const s = S.get(), main = s.trip.mainCurrency, rates = SV.rates();
    return Object.values(s.refunds || {}).reduce((a, r) => { const v = U.convert(r.amount, r.currency || main, main, rates); return a + (v || 0); }, 0);
  }
  /** Lo cubierto de un gasto (en su moneda) y por quién. */
  function coveredOf(e) {
    const rs = Object.values(S.get().refunds || {}).filter((r) => r.expenseId === e.id);
    if (!rs.length) return null;
    const amt = rs.reduce((a, r) => { const v = r.currency === e.currency ? r.amount : U.convert(r.amount, r.currency, e.currency, SV.rates()); return a + (v || 0); }, 0);
    return { amount: amt, full: amt >= e.amount - 0.5, from: Array.from(new Set(rs.map((r) => r.from).filter(Boolean))).join(', '), list: rs };
  }
  C.coveredOf = coveredOf;
  /* Con varios viajeros, el total es lo que cuesta el viaje a todos. Aparte, «Tú»: lo que has puesto de tu bolsillo
     (lo que pagaste + lo que diste a otros − lo que te devolvieron − lo que te pagaron de fuera) y tu parte del viaje. */
  function netLine(total) {
    const s = S.get(), main = s.trip.mainCurrency, rates = SV.rates(), rec = refundsTotal(), mi = meInfo();
    if (mi.multi && mi.id) {
      const ids = Object.keys(s.travelers);
      const setts = Object.values(s.settlements || {}).map((x) => ({ fromId: x.fromId, toId: x.toId, value: U.convert(x.amount, x.currency || main, main, rates) }));
      const r = L.balances(Object.values(s.expenses), ids, (e) => U.convert(e.amount, e.currency, main, rates), setts);
      const b = r.list.find((x) => x.id === mi.id);
      if (!b) return '';
      const pocket = b.paid + b.sent - b.got - rec;
      const debt = b.balance > 0.5 ? 'te deben ' + U.money(b.balance, main) : b.balance < -0.5 ? 'debes ' + U.money(-b.balance, main) : 'estáis en paz';
      return '<div class="you"><small class="eyebrow muted block">TÚ · ' + esc((mi.me.name || '').toUpperCase()) + '</small><div class="stats">' +
        UI.stat('Has puesto tú', U.money(pocket, main), b.got || rec ? 'ya restado lo que te han pagado' : 'de tu bolsillo', true) +
        UI.stat('Tu parte del viaje', U.money(b.share, main), debt) + '</div>' +
        (b.got || rec ? '<small class="muted">Te han pagado ' + U.money(b.got + rec, main) + (b.got ? ' (' + U.money(b.got, main) + ' otros viajeros' + (rec ? ', ' + U.money(rec, main) + ' de fuera' : '') + ')' : ' de fuera del viaje') + '.</small>' : '') + '</div>';
    }
    if (!rec) return '';
    return '<div class="stats net">' + UI.stat('Te han pagado', U.money(rec, main), 'regalos y devoluciones') + UI.stat('Neto (lo que pones tú)', U.money(total - rec, main), '', true) + '</div>';
  }
  function refundsSection() {
    const s = S.get(), main = s.trip.mainCurrency, list = Object.values(s.refunds || {}).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    const rows = list.map(function (r) {
      const k = REFUND_KIND[r.kind] || REFUND_KIND.other, e = r.expenseId && s.expenses[r.expenseId];
      return '<button type="button" class="suica__row" data-act="editRefund" data-id="' + r.id + '"><span class="mono faint">' + U.fmtShort(r.date) + '</span><span class="grow">' + k[1] + ' ' + esc(r.from || k[0]) +
        '<small class="muted block">' + esc(e ? 'Para «' + (e.description || (D.EXPENSE[e.category] || ['gasto'])[0]) + '»' : k[0] + ' · general') + (r.note ? ' · ' + esc(r.note) : '') + '</small></span><strong class="mono success">+' + U.money(r.amount, r.currency || main) + '</strong></button>';
    }).join('');
    return UI.section('Dinero recibido', (list.length ? UI.card(rows + '<div class="row row--between tf__total"><strong>Total recibido</strong><strong class="mono success">' + U.money(refundsTotal(), main) + '</strong></div>', { cls: 'card--list' })
      : '<p class="muted small">¿Alguien te ha pagado algo o te lo ha regalado? Apúntalo y verás lo que pones tú de verdad.</p>'),
      UI.btn('Apuntar', { icon: 'plus', size: 'sm', variant: 'ghost', data: { act: 'newRefund' } }));
  }
  A.newRefund = (el) => F.refund(null, el && el.dataset && el.dataset.exp ? { expenseId: el.dataset.exp } : null);
  A.editRefund = (el) => F.refund(el.dataset.id);
  F.refund = function (id, def) {
    const s = S.get(), ex = id ? s.refunds[id] : null, main = s.trip.mainCurrency, t = S.today();
    const base = def && def.expenseId && s.expenses[def.expenseId];
    const cov = base ? coveredOf(base) : null;
    const x = ex || { currency: base ? base.currency : main, date: t.now.date, kind: 'gift', expenseId: base ? base.id : '', amount: base ? Math.max(0, base.amount - (cov ? cov.amount : 0)) : undefined };
    const froms = Array.from(new Set(Object.values(s.refunds || {}).map((r) => r.from).filter(Boolean))).sort();
    const exps = Object.values(s.expenses).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 80);
    const body = '<form id="fRefund" class="stack" novalidate>' +
      '<label class="field"><span class="field__label">Importe recibido</span><input class="input input--lg" name="amount" inputmode="decimal" placeholder="0" value="' + esc(x.amount ? String(x.amount).replace('.', ',') : '') + '" autocomplete="off"><span class="field__hint" id="refConv"></span></label>' +
      UI.chips('currency', D.CURRENCIES.map((c) => ({ value: c, label: c })), x.currency || main) +
      UI.field('Qué es', UI.chips('kind', Object.keys(REFUND_KIND).map((k) => ({ value: k, label: REFUND_KIND[k][1] + ' ' + REFUND_KIND[k][0] })), x.kind || 'gift')) +
      UI.field('De quién', '<input class="input" name="from" list="refFrom" value="' + esc(x.from || '') + '" placeholder="p.ej. Los abuelos, Ana…" autocomplete="off"><datalist id="refFrom">' + froms.map((f) => '<option value="' + esc(f) + '">').join('') + '</datalist>', { optional: true }) +
      UI.field('Para qué gasto', '<select class="input" name="expenseId"><option value="">— General (no es de un gasto concreto)</option>' + exps.map((e) => '<option value="' + e.id + '"' + (e.id === x.expenseId ? ' selected' : '') + '>' + esc(U.fmtShort(e.date) + ' · ' + (e.description || (D.EXPENSE[e.category] || ['Gasto'])[0]) + ' · ' + U.money(e.amount, e.currency)) + '</option>').join('') + '</select>', { optional: true, hint: 'Si es de un gasto, ese gasto sale como «cubierto».' }) +
      UI.field('Fecha', UI.input('date', x.date, { type: 'date' })) +
      UI.field('Nota', UI.input('note', x.note || '', { placeholder: 'p.ej. Por Bizum, en mano…' }), { optional: true }) +
      '<small class="faint">Para lo que te pagan personas de fuera del viaje. Lo que te paga otro viajero va en Gastos → Reparto → «Saldado».</small>' +
      '<p class="error" hidden></p></form>';
    const close = UI.sheet({
      title: ex ? 'Editar dinero recibido' : 'Dinero recibido', body: body,
      footer: '<div class="row">' + (ex ? UI.btn('Eliminar', { variant: 'danger', icon: 'trash', data: { del: '1' } }) : '') + UI.btn('Guardar', { type: 'submit', form: 'fRefund', block: true }) + '</div>',
      onMount: function (root) {
        const form = root.querySelector('#fRefund'), conv = root.querySelector('#refConv');
        const upd = () => { const f = UI.formData(form), v = U.parseAmount(f.amount); conv.textContent = v && f.currency !== 'EUR' ? C.eurOf(v, f.currency) : ''; };
        form.addEventListener('input', upd); form.addEventListener('change', upd); upd();
        const del = root.querySelector('[data-del]');
        if (del) del.addEventListener('click', async () => { if (await UI.confirm('¿Eliminar este dinero recibido?', U.money(ex.amount, ex.currency || main))) { S.remove('refunds', ex.id); close(); } });
        form.addEventListener('submit', function (ev) {
          ev.preventDefault();
          const f = UI.formData(form), err = form.querySelector('.error'), amount = U.parseAmount(f.amount);
          const problem = !amount ? 'Introduce un importe' : !U.isISODate(f.date) ? 'Fecha no válida' : '';
          if (problem) { err.textContent = problem; err.hidden = false; return; }
          const data = { amount: amount, currency: f.currency || main, kind: f.kind || 'other', from: (f.from || '').trim() || undefined, expenseId: f.expenseId || undefined, date: f.date, note: f.note || undefined };
          if (ex) S.update('refunds', ex.id, data); else S.create('refunds', data);
          close();
          UI.toast('💝 ' + U.money(amount, data.currency) + ' recibidos' + (data.from ? ' de ' + data.from : ''));
        });
      }
    });
  };

  /** Durante el viaje: al ritmo de gasto de los días ya vividos, cuánto acabarás gastando (comparado con el presupuesto). */
  function forecast(list, totalNow) {
    const s = S.get(), t = S.today(), main = s.trip.mainCurrency;
    if (t.phase !== 'during' || t.dayNumber < 2) return '';
    const lived = list.filter((e) => e.date >= s.trip.startDate && e.date <= t.now.date);
    const perDay = C.moneySum(lived).total / t.dayNumber, left = t.totalDays - t.dayNumber;
    const end = totalNow + perDay * left, budget = s.trip.totalBudget;
    return '<div class="forecast"><span class="grow"><small class="eyebrow muted block">PREVISIÓN AL ACABAR</small><strong class="forecast__v mono">' + U.money(end, main) + '</strong>' +
      '<small class="muted block">Al ritmo de ' + U.money(perDay, main) + '/día durante los ' + left + (left === 1 ? ' día' : ' días') + ' que quedan</small></span>' +
      (budget ? '<span class="pill pill--' + (end > budget ? 'accent' : 'success') + '">' + (end > budget ? 'Te pasarías ' + U.money(end - budget, main) : 'Te sobrarían ' + U.money(budget - end, main)) + '</span>' : '') + '</div>';
  }

  /** Compras marcadas como tax free, para tenerlas localizadas antes del vuelo. */
  function taxFreeSection(list) {
    const tf = list.filter((e) => e.taxFree).sort((a, b) => a.date.localeCompare(b.date));
    if (!tf.length) return '';
    return UI.section('Compras tax free · ' + tf.length, UI.card(tf.map((e) => '<button type="button" class="suica__row" data-act="editExpense" data-id="' + e.id + '"><span class="mono faint">' + U.fmtShort(e.date) + '</span><span class="grow">🛍️ ' + esc(e.description || (D.EXPENSE[e.category] || ['Compra'])[0]) + (e.placeName ? '<small class="muted block">' + esc(e.placeName) + '</small>' : '') + '</span><strong class="mono">' + U.money(e.amount, e.currency) + '</strong></button>').join('') +
      '<div class="row row--between tf__total"><strong>Total</strong><strong class="mono">' + C.moneySum(tf).text + '</strong></div>', { cls: 'card--list' }), '<small class="faint">para tenerlas a mano antes del vuelo</small>');
  }

  const PAY_TONE = { cash: 'amber', card: 'blue', ic: 'green', mobile: 'violet', other: 'slate', none: 'slate' };

  /* ── Filtros de la lista de gastos (se pueden combinar) ──
     Cuándo, ciudad, día, categoría, forma de pago, quién pagó, tax free, «te lo han pagado» y búsqueda por texto.
     Al tocar una barra del Resumen (categoría, forma de pago, ciudad, día, antes/durante) se abre la lista con ese filtro. */
  const FILTER_LABEL = { phase: 'Cuándo', cityId: 'Ciudad', date: 'Día', category: 'Categoría', paymentMethod: 'Pagado con', paidById: 'Pagó', taxFree: 'Tax free', covered: 'Te lo han pagado', q: 'Busca' };
  function filtersOf() { const st = JT.uiState.expenses; if (st.filter) { st.filters = { [st.filter.k]: st.filter.v }; st.filter = null; } return (st.filters = st.filters || {}); }
  function filterValueLabel(k, v) {
    const s = S.get();
    if (k === 'category') return D.EXPENSE[v] ? D.EXPENSE[v][1] + ' ' + D.EXPENSE[v][0] : v;
    if (k === 'paymentMethod') return v ? (D.PAYMENT[v] ? D.PAYMENT[v][1] + ' ' + D.PAYMENT[v][0] : v) : 'Sin forma de pago';
    if (k === 'paidById') return v && s.travelers[v] ? s.travelers[v].name : 'Sin indicar quién pagó';
    if (k === 'cityId') return v && s.cities[v] ? s.cities[v].name : 'Sin ciudad';
    if (k === 'phase') return PHASE[v] ? PHASE[v][0] + ' ' + PHASE[v][1] : v;
    if (k === 'date') return U.fmtDay(v);
    if (k === 'taxFree') return '🛍️ Sólo tax free';
    if (k === 'covered') return '💝 Sólo los que te han pagado';
    if (k === 'q') return '«' + v + '»';
    return v;
  }
  function applyFilters(list, f) {
    const s = S.get(), q = f.q ? U.normalize(f.q) : '';
    return list.filter(function (e) {
      if (f.phase !== undefined && phaseOf(e) !== f.phase) return false;
      for (const k of ['cityId', 'date', 'category', 'paymentMethod', 'paidById']) if (f[k] !== undefined && (e[k] || '') !== f[k]) return false;
      if (f.taxFree && !e.taxFree) return false;
      if (f.covered && !coveredOf(e)) return false;
      if (q) {
        const c = D.EXPENSE[e.category], city = e.cityId && s.cities[e.cityId];
        if (U.normalize([e.description, e.placeName, e.notes, c && c[0], city && city.name].filter(Boolean).join(' ')).indexOf(q) < 0) return false;
      }
      return true;
    });
  }
  /** Desde el Resumen (o cualquier botón con data-k / data-v): la lista con ese único filtro. */
  A.expFilter = function (el) {
    const st = JT.uiState.expenses;
    st.filter = null;
    st.filters = { [el.dataset.k]: el.dataset.v || '' };
    st.tab = 'list';
    if (location.hash.indexOf('#/expenses') === 0) JT.app.render(); else JT.go('expenses');
    window.scrollTo(0, 0);
  };
  A.expFilterClear = () => { const st = JT.uiState.expenses; st.filter = null; st.filters = {}; JT.app.render(); };
  A.expFilterDel = (el) => { const f = filtersOf(); delete f[el.dataset.k]; JT.app.render(); };
  JT.changes.expSearch = function (el) { const f = filtersOf(); if (el.value.trim()) f.q = el.value; else delete f.q; JT.app.render({ keepFocus: true }); };
  A.expAll = function () {
    const st = JT.uiState.expenses;
    st.filter = null; st.filters = {}; st.tab = 'list';
    if (location.hash.indexOf('#/expenses') === 0) JT.app.render(); else JT.go('expenses');
  };
  A.expSummary = function () {
    JT.uiState.expenses.tab = 'summary';
    if (location.hash.indexOf('#/expenses') === 0) JT.app.render(); else JT.go('expenses');
  };

  /** Hoja de filtros: chips por grupo (sólo con lo que existe en tus gastos); se combinan. */
  A.expFilters = function () {
    const s = S.get(), all = Object.values(s.expenses), f = Object.assign({}, filtersOf());
    const uniq = (fn) => Array.from(new Set(all.map(fn)));
    const group = (k, title, opts) => (opts.length ? '<div class="fgroup"><span class="field__label">' + title + '</span><div class="chips">' + opts.map((o) =>
      '<button type="button" class="chip chip--btn' + (f[k] === o[0] ? ' is-on' : '') + '" data-fk="' + k + '" data-fv="' + esc(o[0]) + '"><span>' + esc(o[1]) + '</span></button>').join('') + '</div></div>' : '');
    const order = S.sortedDays().map((d) => d.cityId).filter((v, i, a) => v && a.indexOf(v) === i);
    const cities = uniq((e) => e.cityId || '').sort((a, b) => (a ? order.indexOf(a) : 999) - (b ? order.indexOf(b) : 999));
    const body = '<div class="stack">' +
      group('phase', 'Cuándo', ['pre', 'trip', 'post'].filter((k) => all.some((e) => phaseOf(e) === k)).map((k) => [k, PHASE[k][0] + ' ' + PHASE[k][1]])) +
      group('cityId', 'Ciudad', cities.map((c) => [c, filterValueLabel('cityId', c)])) +
      group('category', 'Categoría', uniq((e) => e.category).filter((c) => D.EXPENSE[c]).map((c) => [c, filterValueLabel('category', c)])) +
      group('paymentMethod', 'Pagado con', uniq((e) => e.paymentMethod || '').map((p) => [p, filterValueLabel('paymentMethod', p)])) +
      (Object.keys(s.travelers).length > 1 ? group('paidById', 'Quién pagó', uniq((e) => e.paidById || '').map((p) => [p, filterValueLabel('paidById', p)])) : '') +
      (function () {
        const others = (all.some((e) => e.taxFree) ? '<button type="button" class="chip chip--btn' + (f.taxFree ? ' is-on' : '') + '" data-fk="taxFree" data-fv="1"><span>🛍️ Tax free</span></button>' : '') +
          (all.some((e) => coveredOf(e)) ? '<button type="button" class="chip chip--btn' + (f.covered ? ' is-on' : '') + '" data-fk="covered" data-fv="1"><span>💝 Te lo han pagado</span></button>' : '');
        return others ? '<div class="fgroup"><span class="field__label">Otros</span><div class="chips">' + others + '</div></div>' : '';
      })() +
      '<p class="muted small" id="fCount"></p></div>';
    const close = UI.sheet({
      title: 'Filtrar gastos', body: body,
      footer: '<div class="row">' + UI.btn('Quitar todo', { variant: 'secondary', data: { fclear: '1' } }) + UI.btn('Ver gastos', { block: true, data: { fapply: '1' } }) + '</div>',
      onMount: function (root) {
        const count = () => { const n = applyFilters(all, f).length; root.querySelector('#fCount').textContent = n + (n === 1 ? ' gasto' : ' gastos') + ' con estos filtros'; };
        count();
        root.addEventListener('click', function (ev) {
          const chip = ev.target.closest('[data-fk]');
          if (chip) {
            const k = chip.dataset.fk, v = chip.dataset.fv;
            if (f[k] === v || (k === 'taxFree' || k === 'covered') && f[k]) delete f[k]; else f[k] = k === 'taxFree' || k === 'covered' ? true : v;
            chip.closest('.chips').querySelectorAll('[data-fk]').forEach((c) => c.classList.toggle('is-on', f[c.dataset.fk] !== undefined && (f[c.dataset.fk] === c.dataset.fv || f[c.dataset.fk] === true)));
            count();
          }
          if (ev.target.closest('[data-fclear]')) { Object.keys(f).forEach((k) => { if (k !== 'q') delete f[k]; }); root.querySelectorAll('[data-fk]').forEach((c) => c.classList.remove('is-on')); count(); }
          if (ev.target.closest('[data-fapply]')) { JT.uiState.expenses.filters = f; close(); JT.app.render(); }
        });
      }
    });
  };

  function expenseList(list) {
    const main = S.get().trip.mainCurrency, rates = SV.rates(), groups = {};
    const f = filtersOf(), keys = Object.keys(f).filter((k) => f[k] !== undefined && k !== 'q'), nAll = list.length;
    list = applyFilters(list, f);
    // Barra: búsqueda + «Filtros», y los filtros activos como chips que se quitan tocándolos.
    let head = '<div class="fbar"><label class="search grow"><span class="search__icon">' + U.icon('search', 16) + '</span><input class="input" type="search" placeholder="Buscar gasto, lugar o nota…" value="' + esc(f.q || '') + '" data-input="expSearch" aria-label="Buscar gastos" autocomplete="off" enterkeyhint="search"></label>' +
      UI.btn('Filtros' + (keys.length ? ' · ' + keys.length : ''), { icon: 'list', size: 'sm', variant: keys.length ? 'primary' : 'secondary', data: { act: 'expFilters' } }) + '</div>';
    if (keys.length || f.q) {
      head += '<div class="filter-on"><div class="grow"><div class="fchips">' + keys.map((k) => '<button type="button" class="fchip" data-act="expFilterDel" data-k="' + k + '"><small>' + esc(FILTER_LABEL[k] || k) + '</small> ' + esc(filterValueLabel(k, f[k])) + ' ✕</button>').join('') + '</div>' +
        '<strong class="mono ftotal">' + C.moneySum(list).text + '</strong><small class="muted block">' + list.length + ' de ' + nAll + (nAll === 1 ? ' gasto' : ' gastos') + '</small></div>' +
        UI.btn('Quitar', { icon: 'x', size: 'sm', variant: 'ghost', data: { act: 'expFilterClear' } }) + '</div>';
      if (!list.length) return head + '<p class="muted center">No hay gastos con estos filtros.</p>';
    }
    list.forEach((e) => (groups[e.date] = (groups[e.date] || []).concat(e)));
    return head + Object.keys(groups).sort().reverse().map((date) => UI.section(U.fmtDay(date),
      groups[date].map(function (e) { const v = e.currency !== main ? U.convert(e.amount, e.currency, main, rates) : null; return C.expenseRow(e, v !== null ? '≈ ' + U.money(v, main) : ''); }).join(''),
      '<small class="muted mono">' + C.moneySum(groups[date]).text + '</small>')).join('') +
      '<p class="faint small center">Desliza un gasto a la izquierda para duplicarlo o eliminarlo.</p>';
  }

  function split(list) {
    const s = S.get(), main = s.trip.mainCurrency, rates = SV.rates(), ids = Object.keys(s.travelers);
    if (ids.length < 2) return UI.empty('👥', 'Viaje individual', 'Añade viajeros en Ajustes para repartir gastos: quién pagó y entre quién se divide.', UI.btn('Ajustes', { data: { act: 'go', to: 'settings' } }));
    const toMain = (amount, cur) => U.convert(amount, cur || main, main, rates);
    const setts = Object.values(s.settlements || {}).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    const r = L.balances(list, ids, (e) => toMain(e.amount, e.currency), setts.map((x) => ({ fromId: x.fromId, toId: x.toId, value: toMain(x.amount, x.currency) })));
    const tr = (id) => s.travelers[id] || { name: '?', color: 'var(--border)' };
    const who = (id) => '<span class="who"><span class="avatar" style="background:' + esc(tr(id).color) + '" aria-hidden="true">' + esc(tr(id).name.charAt(0).toUpperCase()) + '</span>' + esc(tr(id).name) + '</span>';
    const round = (v) => (main === 'JPY' ? Math.round(v) : Math.round(v * 100) / 100);
    // 1) Lo que hay que hacer: quién paga a quién (con «Saldado» para apuntarlo cuando ocurra).
    let html = UI.section('Para quedar en paz', (r.transfers.length ? r.transfers.map((x) =>
      '<div class="card debt"><div class="debt__who">' + who(x.from) + '<span class="debt__arrow" aria-hidden="true">→</span>' + who(x.to) + '</div>' +
      '<div class="row row--between"><span><small class="muted block">' + esc(tr(x.from).name) + ' debe a ' + esc(tr(x.to).name) + '</small><strong class="debt__amt mono">' + U.money(round(x.amount), main) + '</strong></span>' +
      UI.btn('Saldado', { icon: 'check', size: 'sm', data: { act: 'settle', from: x.from, to: x.to, amount: round(x.amount) } }) + '</div></div>').join('')
      : UI.card('<p class="success"><strong>Todo cuadrado 🎉</strong></p><small class="muted">Nadie debe nada a nadie.</small>', { cls: 'stack-sm' })),
      UI.btn('Apuntar un pago', { icon: 'plus', size: 'sm', variant: 'ghost', data: { act: 'settle' } }));
    // 2) Cada persona: lo que ha pagado, lo que le corresponde, los pagos entre vosotros y cómo queda.
    html += UI.section('Cada uno', r.list.map(function (b) {
      const st = b.balance > 0.5 ? 'le deben' : b.balance < -0.5 ? 'debe' : 'en paz';
      const line = (label, v, cls) => '<div class="row row--between bal__line"><span class="muted">' + label + '</span><span class="mono ' + (cls || '') + '">' + v + '</span></div>';
      return '<div class="card bal stack-sm"><div class="row row--between">' + who(b.id) + '<span class="pill pill--' + (b.balance > 0.5 ? 'success' : b.balance < -0.5 ? 'accent' : 'neutral') + '">' + st + '</span></div>' +
        line('Ha pagado', U.money(b.paid, main)) + line('Le corresponde (su parte)', U.money(b.share, main)) +
        (b.sent ? line('Pagos hechos a otros', '+' + U.money(b.sent, main)) : '') + (b.got ? line('Pagos recibidos', '−' + U.money(b.got, main)) : '') +
        '<div class="row row--between bal__total"><strong>' + (b.balance > 0.5 ? 'Le deben' : b.balance < -0.5 ? 'Debe' : 'Saldo') + '</strong><strong class="mono ' + (b.balance > 0.5 ? 'success' : b.balance < -0.5 ? 'accent' : 'muted') + '">' + U.money(Math.abs(round(b.balance)), main) + '</strong></div>' +
        '<div class="row row--end">' + UI.btn('Ver lo que pagó', { size: 'sm', variant: 'ghost', data: { act: 'expFilter', k: 'paidById', v: b.id } }) + '</div></div>';
    }).join(''));
    // 3) Pagos entre vosotros (deudas saldadas): tocar para corregir o borrar.
    if (setts.length) html += UI.section('Pagos entre vosotros', UI.card(setts.map((x) => '<button type="button" class="suica__row" data-act="editSettle" data-id="' + x.id + '"><span class="mono faint">' + U.fmtShort(x.date) + '</span><span class="grow">' + esc(tr(x.fromId).name) + ' → ' + esc(tr(x.toId).name) + (x.method === 'cash' ? ' · 💴' : x.method === 'transfer' ? ' · 📱' : '') + (x.note ? '<small class="muted block">' + esc(x.note) + '</small>' : '') + '</span><strong class="mono">' + U.money(x.amount, x.currency || main) + '</strong></button>').join(''), { cls: 'card--list' }));
    // 4) Gastos compartidos, con lo que le toca a cada uno.
    const shared = list.filter((e) => e.paidById && s.travelers[e.paidById] && (e.splitWithIds || []).filter((id) => s.travelers[id]).length && ((e.splitWithIds || []).length > 1 || e.splitWithIds[0] !== e.paidById));
    if (shared.length) html += UI.section('Gastos compartidos · ' + shared.length, UI.card(shared.slice(0, 60).map(function (e) {
      const parts = e.splitWithIds.filter((id) => s.travelers[id]), each = e.amount / parts.length;
      return '<button type="button" class="shrow" data-act="editExpense" data-id="' + e.id + '"><span class="grow"><strong class="block">' + esc(e.description || (D.EXPENSE[e.category] || ['Gasto'])[0]) + '</strong>' +
        '<small class="muted block">' + esc(U.fmtShort(e.date) + ' · pagó ' + tr(e.paidById).name + ' · entre ' + parts.length) + '</small>' +
        '<span class="shrow__parts">' + parts.map((id) => '<span class="part"><i style="background:' + esc(tr(id).color) + '"></i>' + esc(tr(id).name) + ' ' + U.money(each, e.currency) + '</span>').join('') + '</span></span>' +
        '<strong class="mono">' + U.money(e.amount, e.currency) + '</strong></button>';
    }).join('') + (shared.length > 60 ? '<small class="faint">y ' + (shared.length - 60) + ' más</small>' : ''), { cls: 'card--list' }));
    html += (r.skipped ? '<small class="warn">' + r.skipped + ' gasto(s) en otra moneda sin tipo de cambio no se han incluido.</small>' : '') +
      '<p class="faint small">Sólo cuentan los gastos con «quién pagó». Si no se indica entre quién, se considera personal. Los pagos entre vosotros no son gasto del viaje: sólo saldan deudas.</p>';
    return html;
  }

  /* ── Pagos entre viajeros (saldar deudas) ── */
  A.settle = (el) => F.settlement(null, { fromId: el.dataset.from, toId: el.dataset.to, amount: el.dataset.amount ? Number(el.dataset.amount) : undefined });
  A.editSettle = (el) => F.settlement(el.dataset.id);
  F.settlement = function (id, def) {
    const s = S.get(), ex = id ? s.settlements[id] : null, main = s.trip.mainCurrency, t = S.today();
    const x = ex || Object.assign({ currency: main, date: t.now.date }, def || {});
    const people = Object.values(s.travelers).map((p) => ({ value: p.id, label: p.name }));
    const body = '<form id="fSettle" class="stack" novalidate>' +
      UI.field('Quién paga', UI.chips('fromId', people, x.fromId)) + UI.field('A quién', UI.chips('toId', people, x.toId)) +
      '<label class="field"><span class="field__label">Importe</span><input class="input input--lg" name="amount" inputmode="decimal" placeholder="0" value="' + esc(x.amount ? String(x.amount).replace('.', ',') : '') + '" autocomplete="off"><span class="field__hint">' + (def && def.amount ? 'Es lo que falta para quedar en paz. Si sólo pagó una parte, cámbialo.' : '') + '</span></label>' +
      UI.chips('currency', D.CURRENCIES.map((c) => ({ value: c, label: c })), x.currency || main) +
      // Cómo se pagó: en efectivo y en yenes, cambia tu efectivo de la Cartera (entra si te pagan, sale si pagas tú).
      UI.field('Cómo se pagó', UI.chips('method', [{ value: 'cash', label: '💴 Efectivo' }, { value: 'transfer', label: '📱 Bizum / transferencia' }, { value: 'other', label: 'Otro' }], ex ? ex.method || '' : 'cash', { allowNone: !!ex && !ex.method, noneLabel: '—' }),
        { hint: 'En efectivo y en yenes, entra (o sale) de tu efectivo en la Cartera. No es un gasto ni cambia el total del viaje: sólo salda la deuda.' }) +
      UI.field('Fecha', UI.input('date', x.date, { type: 'date' })) +
      UI.field('Nota', UI.input('note', x.note || '', { placeholder: 'p.ej. En el hotel, por la cena…' }), { optional: true }) +
      '<p class="error" hidden></p></form>';
    const close = UI.sheet({
      title: ex ? 'Editar pago' : 'Deuda saldada', body: body,
      footer: '<div class="row">' + (ex ? UI.btn('Eliminar', { variant: 'danger', icon: 'trash', data: { del: '1' } }) : '') + UI.btn('Guardar', { type: 'submit', form: 'fSettle', block: true }) + '</div>',
      onMount: function (root) {
        const form = root.querySelector('#fSettle'), del = root.querySelector('[data-del]');
        if (del) del.addEventListener('click', async () => { if (await UI.confirm('¿Eliminar este pago?', 'La deuda volverá a aparecer.')) { S.remove('settlements', ex.id); close(); } });
        form.addEventListener('submit', function (ev) {
          ev.preventDefault();
          const f = UI.formData(form), err = form.querySelector('.error'), amount = U.parseAmount(f.amount);
          const problem = !f.fromId || !f.toId ? 'Elige quién paga y a quién' : f.fromId === f.toId ? 'Tienen que ser dos personas distintas' : !amount ? 'Introduce un importe' : !U.isISODate(f.date) ? 'Fecha no válida' : '';
          if (problem) { err.textContent = problem; err.hidden = false; return; }
          const data = { fromId: f.fromId, toId: f.toId, amount: amount, currency: f.currency || main, method: f.method || undefined, date: f.date, note: f.note || undefined };
          if (ex) S.update('settlements', ex.id, data); else S.create('settlements', data);
          close();
          const cash = walletInfo('cash'), mi = meInfo(), touchesMe = data.method === 'cash' && data.currency === 'JPY' && (data.toId === mi.id || data.fromId === mi.id);
          UI.toast('Pago apuntado: ' + s.travelers[f.fromId].name + ' → ' + s.travelers[f.toId].name + ' ' + U.money(amount, data.currency) + (touchesMe && cash.active ? ' · tu efectivo: ' + U.money(cash.balance, 'JPY') : ''));
        });
      }
    });
  };

  A.dupExpense = function (el) {
    const e = Object.assign({}, S.get().expenses[el.dataset.id]);
    delete e.id; delete e.isSample;
    S.create('expenses', e);
    UI.toast('Gasto duplicado');
  };
  A.delExpense = async function (el) {
    const e = S.get().expenses[el.dataset.id];
    if (e && (await UI.confirm('¿Eliminar gasto?', e.description || ''))) S.remove('expenses', e.id);
  };

  /* ── Formulario: importe → categoría → guardar; lo demás plegado ── */

  F.expense = function (id, def) {
    const s = S.get(), ex = id ? s.expenses[id] : null, t = S.today();
    def = def || {};
    const travelers = Object.values(s.travelers);
    const me = travelers.find((x) => x.isMe) || travelers[0];
    const last = Object.values(s.expenses).filter((e) => !e.isSample).sort((a, b) => b.createdAt - a.createdAt)[0];
    const e = ex || {
      currency: def.currency || (last ? last.currency : 'JPY'), paymentMethod: def.paymentMethod || (last ? last.paymentMethod : undefined),
      date: def.date || t.now.date, cityId: def.cityId || (t.phase === 'during' && t.city ? t.city.id : undefined),
      placeName: def.placeName, activityId: def.activityId, paidById: me && me.id, splitWithIds: me ? [me.id] : [],
      // Desde una reserva o un trayecto con coste: llega ya relleno.
      amount: def.amount, category: def.category, description: def.description, reservationId: def.reservationId, transportId: def.transportId, giftId: def.giftId
    };
    const main = s.trip.mainCurrency;
    const body = '<form id="fExp" class="stack" novalidate>' +
      '<label class="field"><span class="field__label">Importe</span><input class="input input--lg" name="amount" inputmode="decimal" placeholder="0" value="' + esc(e.amount ? String(e.amount).replace('.', ',') : '') + '"' + (ex || e.amount ? '' : ' autofocus') + ' autocomplete="off"><span class="field__hint" id="conv"></span></label>' +
      UI.chips('currency', D.CURRENCIES.map((c) => ({ value: c, label: c })), e.currency) +
      UI.field('Categoría', C.typePicker('category', D.EXPENSE, e.category, 'expense')) +
      // Sólo para saber cómo se pagó: el total de gastos es uno solo, se pague como se pague.
      UI.field('Pagado con', UI.chips('paymentMethod', D.options(D.PAYMENT), e.paymentMethod, { allowNone: true, noneLabel: '—' }), { optional: true, hint: ' ', hintId: 'suicaHint' }) +
      UI.field('Descripción', UI.input('description', e.description || '', { placeholder: 'p.ej. Cena ramen' }), { optional: true }) +
      UI.chipsMulti('taxFree', [{ value: '1', label: '🛍️ Compra tax free' }], e.taxFree ? ['1'] : []) +
      UI.details('Más detalles',
        UI.field('Fecha', UI.input('date', e.date, { type: 'date' })) +
        UI.field('Ciudad', UI.chips('cityId', C.cityOptions(), e.cityId, { allowNone: true, noneLabel: 'Sin ciudad' }), { optional: true }) +
        UI.field('Lugar', UI.input('placeName', e.placeName || ''), { optional: true }) +
        (travelers.length > 1 ? UI.field('Pagó', UI.chips('paidById', travelers.map((x) => ({ value: x.id, label: x.name })), e.paidById)) +
          UI.field('Para quién', UI.chipsMulti('split', travelers.map((x) => ({ value: x.id, label: x.name })), e.splitWithIds), { hint: 'Marca a todos los que comparten el gasto.' }) : '') +
        UI.field('Notas', UI.textarea('notes', e.notes), { optional: true }), !!ex) +
      '<div class="row row--end row--wrap">' + (ex ? UI.btn('💝 Me lo han pagado', { size: 'sm', variant: 'ghost', data: { act: 'newRefund', exp: ex.id } }) : '') + UI.btn('☆ Guardar como frecuente', { size: 'sm', variant: 'ghost', data: { 'save-q': '1' } }) + '</div>' +
      '<p class="error" hidden></p></form>';
    const close = UI.sheet({
      title: ex ? 'Editar gasto' : 'Nuevo gasto', body: body,
      footer: '<div class="row">' + (ex ? UI.btn('Eliminar', { variant: 'danger', icon: 'trash', data: { del: '1' } }) : '') + UI.btn('Guardar', { type: 'submit', form: 'fExp', block: true }) + '</div>',
      onMount: function (root) {
        const form = root.querySelector('#fExp'), conv = form.querySelector('#conv'), sHint = form.querySelector('#suicaHint');
        // Pagado con Suica o en efectivo: cuánto te quedará (sin contar este gasto si ya estaba pagado así).
        const wInfo = { ic: walletInfo('ic'), cash: walletInfo('cash') };
        const wBase = (w) => wInfo[w].balance + (ex && ex.paymentMethod === w && (w !== 'cash' || ex.currency === 'JPY') ? toJpy(ex) || 0 : 0);
        const updateConv = function () {
          const f = UI.formData(form), v = U.parseAmount(f.amount);
          if (sHint) {
            const w = f.paymentMethod, x = wInfo[w];
            const counts = x && x.active && (w !== 'cash' || f.currency === 'JPY');
            const jpy = v ? toJpy({ amount: v, currency: f.currency }) : 0;
            // Sólo Suica y efectivo tienen saldo (con tarjeta o sin indicar no hay nada que calcular).
            const after = counts ? wBase(w) - (jpy || 0) : 0;
            sHint.textContent = counts ? x.name + ' después: ' + U.money(after, 'JPY') + eurP(after) : '';
          }
          // Lo que vale en tu moneda principal y, si no es en euros, también en euros.
          const parts = [];
          if (v && f.currency !== main) {
            const c = U.convert(v, f.currency, main, SV.rates());
            parts.push(c !== null ? '≈ ' + U.money(c, main) : 'Sin tipo de cambio ' + f.currency + '→' + main + ': se sumará cuando lo haya');
          }
          if (v && f.currency !== 'EUR' && main !== 'EUR' && C.eurOf(v, f.currency)) parts.push(C.eurOf(v, f.currency));
          conv.textContent = parts.join(' · ');
        };
        form.addEventListener('input', updateConv);
        form.addEventListener('change', updateConv);
        updateConv();
        // Lo que tengas escrito pasa a «Gastos frecuentes» (se abre encima; este gasto sigue abierto).
        root.querySelector('[data-save-q]').addEventListener('click', function () {
          const f = UI.formData(form), c = D.EXPENSE[f.category];
          F.qexp(null, { label: f.description || (c ? c[0] : ''), emoji: c ? c[1] : '', amount: U.parseAmount(f.amount) || undefined, currency: f.currency, category: f.category, paymentMethod: f.paymentMethod || undefined });
        });
        const del = root.querySelector('[data-del]');
        if (del) del.addEventListener('click', async () => { if (await UI.confirm('¿Eliminar gasto?')) { S.remove('expenses', ex.id); close(); } });
        form.addEventListener('submit', function (ev) {
          ev.preventDefault();
          const f = UI.formData(form), err = form.querySelector('.error'), amount = U.parseAmount(f.amount);
          const problem = !amount ? 'Introduce un importe' : !f.category ? 'Elige una categoría' : f.date && !U.isISODate(f.date) ? 'Fecha no válida' : '';
          if (problem) { err.textContent = problem; err.hidden = false; return; }
          const splitIds = travelers.length > 1 ? UI.list(f.split) : e.splitWithIds;
          const paid = travelers.length > 1 ? f.paidById : e.paidById;
          const data = { amount: amount, currency: f.currency, category: f.category, description: f.description || undefined, date: f.date || e.date, cityId: f.cityId || undefined,
            placeName: f.placeName || undefined, paymentMethod: f.paymentMethod || undefined, paidById: paid, splitWithIds: splitIds.length ? splitIds : paid ? [paid] : [], notes: f.notes || undefined, taxFree: f.taxFree ? true : undefined, activityId: e.activityId, reservationId: e.reservationId, transportId: e.transportId, giftId: e.giftId };
          if (ex) S.update('expenses', ex.id, data); else S.create('expenses', data);
          UI.toast('Gasto de ' + U.money(amount, f.currency) + ' guardado');
          close();
        });
      }
    });
  };

  /* ── Cartera: Suica (o cualquier tarjeta IC) y efectivo en yenes ──
     saldo = entradas (saldo inicial, recargas, cajero) + ajustes − lo pagado con ella.
     Recargar la Suica con efectivo baja el efectivo. Las entradas no son gasto: el gasto es lo que pagas. */
  const WALLETS = {
    ic: {
      coll: 'suicaMoves', pay: 'ic', low: 1000, jpyOnly: false,
      name: () => S.get().settings.suicaName || 'Welcome Suica',
      inLabel: 'Recargar', firstLabel: 'Saldo inicial', inNote: 'Recarga', firstNote: 'Saldo inicial', quick: [1000, 2000, 3000, 5000],
      amountLabel: 'Importe cargado (¥)', inHint: 'La recarga no cuenta como gasto: cuenta lo que pagas con la tarjeta.',
      re: /recarga|carga suica|チャージ|charge/i, adjust: ['transport', 'Trayectos con Suica'],
      realHint: 'Lo ves al pasar por el torno, en las máquinas de billetes o en el tique de la konbini.',
      lessText: ' más de lo apuntado (p.ej. trenes y metro).'
    },
    cash: {
      coll: 'cashMoves', pay: 'cash', low: 3000, jpyOnly: true,
      name: () => 'Efectivo',
      inLabel: 'Sacar o cambiar', firstLabel: 'Efectivo inicial', inNote: 'Cajero', firstNote: 'Efectivo inicial', quick: [10000, 20000, 30000, 50000],
      amountLabel: 'Yenes que entran (¥)', inHint: 'Sacar dinero no es gasto: cuenta lo que pagas en efectivo. Si el cajero cobra comisión, apúntala como gasto aparte.',
      re: /cajero|\batm\b|retirada|sacar dinero/i, adjust: ['other', 'Gastos en efectivo sin apuntar'],
      realHint: 'Cuenta los billetes y monedas que llevas.',
      lessText: ' más de lo apuntado (gastos sin apuntar).'
    }
  };
  /** « (≈ 6,93 €)» para textos que cambian al escribir (los fijos los pone C.addEur). */
  function eurP(v) { const e = C.eurOf(v, 'JPY'); return e ? ' (' + e + ')' : ''; }
  /** Tu tipo real medio (yenes por euro) con los cambios y cajeros en los que apuntaste lo que te costó. */
  function realRate() {
    const list = Object.values(S.get().cashMoves || {}).filter((m) => m.kind !== 'adjust' && m.eur > 0 && m.amount > 0);
    if (!list.length) return null;
    const y = list.reduce((a, m) => a + m.amount, 0), e = list.reduce((a, m) => a + m.eur, 0);
    return { rate: y / e, n: list.length };
  }
  C.realRate = realRate;
  /** « · la app usa 173 ¥ (BCE 174,35)», para comparar con tu tipo real. */
  function rateCompare() {
    const r = SV.rates();
    if (!r) return '';
    const used = U.convert(1, 'EUR', 'JPY', r), ex = r.exact ? U.convert(1, 'EUR', 'JPY', { base: r.base, perUnit: r.exact }) : null;
    return used ? ' · la app usa ' + Math.round(used) + ' ¥' + (ex ? ' (BCE ' + ex.toFixed(2).replace('.', ',') + ')' : '') : '';
  }
  C.rateCompare = rateCompare;
  function toJpy(e) { return e.currency === 'JPY' ? Number(e.amount) || 0 : U.convert(e.amount, e.currency, 'JPY', SV.rates()); }
  /** Tu id de viajero (el marcado «Yo») y si hay más de uno. */
  function meInfo() {
    const tr = Object.values(S.get().travelers), me = tr.find((p) => p.isMe) || tr[0];
    return { id: me && me.id, multi: tr.length > 1, me: me };
  }
  C.meInfo = meInfo;
  function walletInfo(w) {
    const s = S.get(), cfg = WALLETS[w], mi = meInfo();
    const moves = Object.values(s[cfg.coll] || {});
    // La cartera es la tuya: con varios viajeros sólo cuenta lo que pagaste tú (o sin «quién pagó»).
    // En efectivo sólo cuentan los pagos en yenes (lo pagado en euros en España no sale de tu cartera de yenes).
    const spent = Object.values(s.expenses).filter((e) => e.paymentMethod === cfg.pay && (!cfg.jpyOnly || e.currency === 'JPY') && (!mi.multi || !e.paidById || e.paidById === mi.id));
    const toSuica = w === 'cash' ? Object.values(s.suicaMoves || {}).filter((m) => m.kind !== 'adjust' && m.from === 'cash') : [];
    // Deudas saldadas en efectivo y en yenes con otro viajero: lo que te dan entra en tu efectivo; lo que das, sale.
    const setts = w === 'cash' && mi.multi ? Object.values(s.settlements || {}).filter((x) => x.method === 'cash' && (x.currency || 'JPY') === 'JPY' && (x.toId === mi.id || x.fromId === mi.id)) : [];
    let ins = 0, adjust = 0, used = 0, unconv = 0, out = 0, settIn = 0, settOut = 0;
    moves.forEach((m) => { if (m.kind === 'adjust') adjust += Number(m.amount) || 0; else ins += Number(m.amount) || 0; });
    spent.forEach((e) => { const v = toJpy(e); if (v === null) unconv++; else used += v; });
    toSuica.forEach((m) => { out += Number(m.amount) || 0; });
    setts.forEach((x) => { if (x.toId === mi.id) settIn += Number(x.amount) || 0; else settOut += Number(x.amount) || 0; });
    ins += settIn; out += settOut;
    // Recargas o retiradas apuntadas como gasto: se pueden pasar a la cartera para no contarlas dos veces.
    const asExpense = Object.values(s.expenses).filter((e) => e.paymentMethod !== cfg.pay && cfg.re.test(e.description || ''));
    const name = cfg.name();
    return { w: w, cfg: cfg, name: name, balance: Math.round(ins + adjust - used - out), ins: ins, used: used, out: out, unconv: unconv,
      moves: moves, spent: spent, toSuica: toSuica, asExpense: asExpense, setts: setts, meId: mi.id,
      // El efectivo sólo cuenta cuando apuntas lo que llevas (todo el mundo paga algo en efectivo).
      active: moves.length > 0 || (w === 'ic' && spent.length > 0), welcome: w === 'ic' && /welcome/i.test(name) };
  }
  const suicaInfo = () => walletInfo('ic');
  C.walletInfo = walletInfo;
  C.suicaInfo = suicaInfo;

  /** Una tarjeta con aspecto de tarjeta: la Suica en verde con su chip y el efectivo como un billete. */
  function walletTile(x) {
    const neg = x.balance < 0, low = !neg && x.balance < x.cfg.low;
    return '<button type="button" class="wcard wcard--' + x.w + '" data-act="wallet" data-w="' + x.w + '" aria-label="' + esc(x.name + ': ' + U.money(x.balance, 'JPY')) + '">' +
      '<span class="wcard__top"><span class="wcard__name">' + esc(x.name) + '</span>' + (x.w === 'ic' ? '<span class="wcard__chip" aria-hidden="true"></span>' : '<span class="wcard__yen" aria-hidden="true">¥</span>') + '</span>' +
      '<span class="wcard__bal mono">' + U.money(x.balance, 'JPY') + '</span>' +
      '<span class="wcard__sub">' + (neg ? '⚠ Revisa el saldo' : low ? '⚠ Saldo bajo' : 'Ver movimientos') + '</span></button>';
  }
  function addTile(w) {
    const cfg = WALLETS[w];
    return '<button type="button" class="wcard wcard--add" data-act="walletIn" data-w="' + w + '">' + U.icon('plus', 20) +
      '<strong>' + (w === 'ic' ? 'Suica' : 'Efectivo') + '</strong><small>' + esc(cfg.firstLabel) + '</small></button>';
  }

  /** «Cartera» (Gastos y Modo viaje): Suica y efectivo lado a lado, avisos y accesos. */
  function walletCard() {
    const ic = walletInfo('ic'), cash = walletInfo('cash'), t = S.today();
    if (!ic.active && !cash.active) return UI.banner('neutral', 'wallet', '¿Pagas con Suica o en efectivo?', 'Apunta lo que llevas y verás cuánto te queda en cada uno.', { data: { act: 'walletIn', w: 'ic' } });
    const daysLeft = t.phase === 'during' ? t.totalDays - t.dayNumber : null;
    const notes = [];
    if (ic.active && ic.balance < 0) notes.push('<small class="accent">' + esc(ic.name) + ': has apuntado más pagos que cargas. Añade la recarga que falta o ajusta al saldo real.</small>');
    if (cash.active && cash.balance < 0) notes.push('<small class="accent">Efectivo: has apuntado más pagos que dinero. Añade lo que sacaste o ajusta al real.</small>');
    if (ic.welcome && daysLeft !== null && daysLeft <= 2 && ic.balance > 0) notes.push('<small class="warn">Te vas ' + (daysLeft === 0 ? 'hoy' : daysLeft === 1 ? 'mañana' : 'en 2 días') + ': el saldo de la Welcome Suica no se devuelve. Gástalo en konbinis o máquinas.</small>');
    return UI.section('Cartera', '<div class="stack-sm"><div class="wallets">' + (ic.active ? walletTile(ic) : addTile('ic')) + (cash.active ? walletTile(cash) : addTile('cash')) + '</div>' + notes.join('') +
      '<div class="row row--wrap">' + (ic.active ? UI.btn('Gasto con Suica', { icon: 'card', size: 'sm', variant: 'secondary', data: { act: 'newExpense', pay: 'ic' } }) + UI.btn('Recargar', { icon: 'plus', size: 'sm', variant: 'ghost', data: { act: 'walletIn', w: 'ic' } }) : '') +
      (cash.active ? UI.btn('Cajero', { icon: 'cash', size: 'sm', variant: 'ghost', data: { act: 'walletIn', w: 'cash' } }) : '') + '</div></div>',
      SV.rates() ? UI.btn(S.get().settings.moneyView === 'eur' ? '€ → ¥' : '¥ → €', { size: 'sm', variant: 'ghost', data: { act: 'moneyToggle' } }) : '');
  }
  C.walletCard = walletCard;
  C.suicaCard = walletCard;

  /** Detalle de una cartera: saldo, accesos y todos los movimientos. */
  function walletSheet(w) {
    const x = walletInfo(w), cfg = x.cfg;
    const sign = (v) => (v >= 0 ? '+' : '−') + U.money(Math.abs(v), 'JPY');
    const rows = x.moves.map((m) => ({ date: m.date, ts: m.createdAt || 0, html: '<button type="button" class="suica__row" data-w-move="' + m.id + '"><span class="mono faint">' + U.fmtShort(m.date) + '</span><span class="grow">' + esc(m.note || (m.kind === 'adjust' ? 'Ajuste al saldo real' : cfg.inNote)) + (m.from === 'cash' ? ' · 💴' : m.from === 'card' ? ' · 💳' : '') + (m.eur > 0 && m.amount > 0 ? '<small class="muted block">' + U.money(m.eur, 'EUR') + ' → 1 € = ' + (m.amount / m.eur).toFixed(1).replace('.', ',') + ' ¥</small>' : '') + '</span><strong class="mono ' + ((Number(m.amount) || 0) >= 0 ? 'success' : 'accent') + '">' + sign(Number(m.amount) || 0) + '</strong></button>' }))
      .concat((x.setts || []).map(function (st) {
        const s2 = S.get(), inn = st.toId === x.meId, other = s2.travelers[inn ? st.fromId : st.toId];
        return { date: st.date, ts: st.createdAt || 0, html: '<button type="button" class="suica__row" data-w-sett="' + st.id + '"><span class="mono faint">' + U.fmtShort(st.date) + '</span><span class="grow">↔️ ' + (inn ? 'Te pagó ' : 'Pagaste a ') + esc(other ? other.name : '?') + '<small class="muted block">Deuda saldada en efectivo</small></span><strong class="mono ' + (inn ? 'success' : 'accent') + '">' + sign(inn ? st.amount : -st.amount) + '</strong></button>' };
      }))
      .concat(x.toSuica.map((m) => ({ date: m.date, ts: m.createdAt || 0, html: '<button type="button" class="suica__row" data-w-ic="' + m.id + '"><span class="mono faint">' + U.fmtShort(m.date) + '</span><span class="grow">🚃 Recarga de la Suica</span><strong class="mono accent">' + sign(-(Number(m.amount) || 0)) + '</strong></button>' })))
      .concat(x.spent.map(function (e) {
        const v = toJpy(e), c = D.EXPENSE[e.category];
        return { date: e.date, ts: e.createdAt || 0, html: '<button type="button" class="suica__row" data-w-exp="' + e.id + '"><span class="mono faint">' + U.fmtShort(e.date) + '</span><span class="grow">' + (c ? c[1] + ' ' : '') + esc(e.description || (c ? c[0] : 'Gasto')) + '</span><strong class="mono">' + (v === null ? U.money(e.amount, e.currency) : '−' + U.money(v, 'JPY')) + '</strong></button>' };
      }))
      .sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
    const body = '<div class="stack">' +
      '<div class="wallets wallets--one">' + walletTile(x).replace('data-act="wallet"', 'tabindex="-1"') + '</div>' +
      '<div class="row row--wrap">' + UI.btn(x.moves.length ? cfg.inLabel : cfg.firstLabel, { icon: 'plus', size: 'sm', data: { 'w-go': 'in' } }) + UI.btn('Ajustar al saldo real', { icon: 'refresh', size: 'sm', variant: 'secondary', data: { 'w-go': 'adjust' } }) +
        (w === 'ic' ? UI.btn('Gasto con Suica', { icon: 'card', size: 'sm', variant: 'ghost', data: { 'w-go': 'expense' } }) : '') + '</div>' +
      (x.asExpense.length ? UI.banner('warn', 'swap', (x.asExpense.length === 1 ? 'Tienes 1 ' : 'Tienes ' + x.asExpense.length + ' ') + (w === 'ic' ? (x.asExpense.length === 1 ? 'recarga apuntada' : 'recargas apuntadas') : (x.asExpense.length === 1 ? 'retirada de cajero apuntada' : 'retiradas de cajero apuntadas')) + ' como gasto',
        'Pásalas a la cartera: así suben el saldo y no cuentan dos veces.', { action: UI.btn('Pasar', { size: 'sm', variant: 'secondary', data: { 'w-go': 'convert' } }) }) : '') +
      (rows.length ? '<div class="suica__list">' + rows.map((r) => r.html).join('') + '</div>' : '<p class="muted small">Aún no hay movimientos. Empieza por «' + esc(cfg.firstLabel) + '»: lo que llevas ahora.</p>') +
      (w === 'ic' ? '<form id="fSuicaName" class="row"><input class="input" name="name" value="' + esc(x.name) + '" aria-label="Nombre de la tarjeta">' + UI.btn('Renombrar', { type: 'submit', size: 'sm', variant: 'ghost' }) + '</form>' +
        '<small class="faint">Para que un gasto baje el saldo, marca «Pagado con: Suica/IC». Los trayectos en tren no hace falta apuntarlos uno a uno: cuando veas el saldo en el torno, en una máquina o en el tique de la konbini, usa «Ajustar al saldo real».</small>'
        : '<small class="faint">Bajan el efectivo los gastos en yenes con «Pagado con: Efectivo» y las recargas de la Suica pagadas en efectivo. Si pierdes la cuenta, cuenta lo que llevas y usa «Ajustar al saldo real».</small>') + '</div>';
    const close = UI.sheet({
      title: x.name, body: body,
      onMount: function (root) {
        root.addEventListener('click', function (ev) {
          const go = ev.target.closest('[data-w-go]'), mv = ev.target.closest('[data-w-move]'), exp = ev.target.closest('[data-w-exp]'), icm = ev.target.closest('[data-w-ic]'), sett = ev.target.closest('[data-w-sett]');
          if (!go && !mv && !exp && !icm && !sett) return;
          close();
          if (sett) return F.settlement(sett.dataset.wSett);
          if (go) ({ in: () => F.walletMove(w), adjust: () => walletAdjust(w), convert: () => walletConvert(w), expense: () => F.expense(null, { paymentMethod: 'ic', currency: 'JPY' }) })[go.dataset.wGo]();
          else if (mv) F.walletMove(w, mv.dataset.wMove);
          else if (icm) F.walletMove('ic', icm.dataset.wIc);
          else F.expense(exp.dataset.wExp);
        });
        const fn = root.querySelector('#fSuicaName');
        if (fn) fn.addEventListener('submit', function (ev) {
          ev.preventDefault();
          const v = UI.formData(ev.target).name;
          if (v) { S.setSettings({ suicaName: v }); UI.toast('Tarjeta renombrada'); close(); }
        });
      }
    });
  }

  /** Entrada (saldo inicial, recarga, cajero) o ajuste, nuevo o editado. */
  F.walletMove = function (w, id) {
    const cfg = WALLETS[w], s = S.get(), m = id ? (s[cfg.coll] || {})[id] : null, t = S.today(), first = !Object.keys(s[cfg.coll] || {}).length;
    const isAdj = m && m.kind === 'adjust';
    const body = '<form id="fWallet" class="stack" novalidate>' +
      '<label class="field"><span class="field__label">' + (isAdj ? 'Ajuste (¥, en negativo si bajó)' : cfg.amountLabel) + '</span><input class="input input--lg" name="amount" inputmode="' + (isAdj ? 'text' : 'numeric') + '" placeholder="0" value="' + esc(m ? String(m.amount) : '') + '"' + (m ? '' : ' autofocus') + ' autocomplete="off"></label>' +
      (m ? '' : '<div class="chips">' + cfg.quick.map((v) => '<button type="button" class="chip chip--btn" data-amount="' + v + '"><span>' + U.money(v, 'JPY') + '</span></button>').join('') + '</div>') +
      // Recargar la Suica con efectivo (lo habitual en máquinas y konbinis) baja el efectivo.
      (w === 'ic' && !isAdj ? UI.field('Pagada con', UI.chips('from', [{ value: 'cash', label: '💴 Efectivo' }, { value: 'card', label: '💳 Tarjeta' }], m ? m.from : 'cash', { allowNone: !!m, noneLabel: '—' }), { hint: 'Si la pagas en efectivo, se descuenta de tu efectivo.' }) : '') +
      // Efectivo: lo que te costó en euros (casa de cambio o cargo del banco por el cajero) → tu tipo real.
      (w === 'cash' && !isAdj ? UI.field('Te costó (€)', UI.input('eur', m && m.eur ? String(m.eur).replace('.', ',') : '', { inputmode: 'decimal', placeholder: 'p.ej. 120' }), { optional: true, hint: ' ', hintId: 'realRate' }) : '') +
      UI.field('Fecha', UI.input('date', m ? m.date : t.now.date, { type: 'date' })) +
      UI.field('Nota', UI.input('note', m ? m.note || '' : first ? cfg.firstNote : '', { placeholder: w === 'ic' ? 'p.ej. Máquina de la estación' : 'p.ej. Cajero 7-Eleven' }), { optional: true }) +
      (isAdj ? '' : '<small class="faint">' + esc(cfg.inHint) + '</small>') +
      '<p class="error" hidden></p></form>';
    const close = UI.sheet({
      title: m ? (isAdj ? 'Editar ajuste' : 'Editar · ' + cfg.name()) : (first ? cfg.firstLabel : cfg.inLabel) + ' · ' + cfg.name(),
      body: body,
      footer: '<div class="row">' + (m ? UI.btn('Eliminar', { variant: 'danger', icon: 'trash', data: { del: '1' } }) : '') + UI.btn('Guardar', { type: 'submit', form: 'fWallet', block: true }) + '</div>',
      onMount: function (root) {
        const form = root.querySelector('#fWallet');
        const rr = root.querySelector('#realRate');
        const showRate = function () {
          if (!rr) return;
          const y = U.parseAmount(form.amount.value), e = U.parseAmount(form.eur ? form.eur.value : '');
          rr.textContent = y && e ? 'Tu tipo real: 1 € = ' + (y / e).toFixed(1).replace('.', ',') + ' ¥' + rateCompare() : 'Lo que das en la casa de cambio o te cobra el banco por el cajero: así ves el cambio real que te hacen.';
        };
        root.querySelectorAll('[data-amount]').forEach((b) => b.addEventListener('click', () => { form.amount.value = b.dataset.amount; showRate(); }));
        form.addEventListener('input', showRate);
        showRate();
        const del = root.querySelector('[data-del]');
        if (del) del.addEventListener('click', async () => { if (await UI.confirm(isAdj ? '¿Eliminar ajuste?' : '¿Eliminar movimiento?', U.money(m.amount, 'JPY'))) { S.remove(cfg.coll, m.id); close(); } });
        form.addEventListener('submit', function (ev) {
          ev.preventDefault();
          const f = UI.formData(form), err = form.querySelector('.error');
          const raw = String(f.amount || '').replace(/[−–]/g, '-'), neg = /^\s*-/.test(raw), v = U.parseAmount(raw.replace('-', ''));
          const amount = v ? Math.round(v) * (isAdj && neg ? -1 : 1) : 0;
          const problem = !amount ? 'Introduce un importe' : !U.isISODate(f.date) ? 'Fecha no válida' : '';
          if (problem) { err.textContent = problem; err.hidden = false; return; }
          const eur = w === 'cash' && !isAdj ? U.parseAmount(f.eur) : null;
          const data = { kind: isAdj ? 'adjust' : 'topup', amount: amount, date: f.date, note: f.note || undefined, from: w === 'ic' && !isAdj ? f.from || undefined : undefined, eur: eur || undefined };
          if (m) S.update(cfg.coll, m.id, data); else S.create(cfg.coll, data);
          close();
          let msg = (isAdj ? 'Ajuste guardado' : U.money(amount, 'JPY') + ' guardados') + ' · ' + cfg.name() + ' ' + U.money(walletInfo(w).balance, 'JPY');
          if (data.from === 'cash' && walletInfo('cash').active) msg += ' · efectivo ' + U.money(walletInfo('cash').balance, 'JPY');
          UI.toast(msg);
        });
      }
    });
  };

  /** Pones el saldo real; la diferencia se apunta como gasto (trayectos / gastos sin apuntar) o como ajuste. */
  function walletAdjust(w) {
    const x = walletInfo(w), cfg = x.cfg, t = S.today();
    const body = '<form id="fWalletAdj" class="stack" novalidate>' +
      '<p class="muted small">Según la app tienes <strong class="mono">' + U.money(x.balance, 'JPY') + '</strong>.</p>' +
      '<label class="field"><span class="field__label">' + (w === 'ic' ? 'Saldo real (¥)' : 'Efectivo real (¥)') + '</span><input class="input input--lg" name="real" inputmode="numeric" placeholder="0" autofocus autocomplete="off">' +
      '<span class="field__hint">' + esc(cfg.realHint) + '</span></label>' +
      '<p class="small" id="adjDiff"></p>' +
      '<label class="row small" id="adjAsExp" hidden><input type="checkbox" name="asExpense" checked> <span>Apuntar la diferencia como gasto («' + esc(cfg.adjust[1]) + '»)</span></label>' +
      '<p class="error" hidden></p></form>';
    const close = UI.sheet({
      title: 'Ajustar · ' + x.name, body: body,
      footer: UI.btn('Guardar', { type: 'submit', form: 'fWalletAdj', block: true }),
      onMount: function (root) {
        const form = root.querySelector('#fWalletAdj'), out = root.querySelector('#adjDiff'), chk = root.querySelector('#adjAsExp');
        const diffOf = () => { const raw = form.real.value.trim(); if (raw === '') return null; const v = U.parseAmount(raw); return v === null ? null : Math.round(v) - x.balance; };
        form.addEventListener('input', function () {
          const d = diffOf();
          out.textContent = d === null ? '' : d === 0 ? 'Cuadra: no hay que ajustar nada.' : d < 0 ? 'Has gastado ' + U.money(-d, 'JPY') + eurP(-d) + cfg.lessText : 'Tienes ' + U.money(d, 'JPY') + ' (' + C.eurOf(d, 'JPY') + ') más de lo apuntado (¿una entrada sin apuntar?).';
          chk.hidden = !(d < 0);
        });
        form.addEventListener('submit', function (ev) {
          ev.preventDefault();
          const d = diffOf(), err = form.querySelector('.error');
          if (d === null) { err.textContent = 'Introduce el saldo real'; err.hidden = false; return; }
          if (d === 0) { close(); UI.toast('Cuadra: ' + U.money(x.balance, 'JPY')); return; }
          if (d < 0 && form.asExpense.checked) {
            const s = S.get(), me = Object.values(s.travelers).find((p) => p.isMe) || Object.values(s.travelers)[0];
            S.create('expenses', { amount: -d, currency: 'JPY', category: cfg.adjust[0], paymentMethod: cfg.pay, description: cfg.adjust[1], date: t.now.date,
              cityId: t.phase === 'during' && t.city ? t.city.id : undefined, paidById: me && me.id, splitWithIds: me ? [me.id] : [] });
          } else S.create(cfg.coll, { kind: 'adjust', amount: d, date: t.now.date, note: 'Ajuste al saldo real' });
          close();
          UI.toast(x.name + ' ajustado: ' + U.money(walletInfo(w).balance, 'JPY'));
        });
      }
    });
  }

  /** Recargas / retiradas apuntadas como gasto → entradas de la cartera (dejan de contar como gasto). */
  async function walletConvert(w) {
    const x = walletInfo(w), list = x.asExpense;
    if (!list.length) return;
    const msg = list.map((e) => U.fmtShort(e.date) + ' · ' + (e.description || '') + ' · ' + U.money(e.amount, e.currency)).join('\n');
    if (!(await UI.confirm('¿Pasar a ' + x.name + '?', msg + '\n\nDejarán de contar como gasto y sumarán al saldo' + (list.some((e) => e.currency !== 'JPY') ? ' (lo que no esté en yenes se convierte al tipo de cambio de la app)' : '') + '.', { ok: 'Pasar', danger: false }))) return;
    let n = 0;
    list.forEach(function (e) {
      const v = toJpy(e);
      if (v === null) return;
      S.create(x.cfg.coll, { kind: 'topup', amount: Math.round(v), date: e.date, note: e.description || x.cfg.inNote, from: w === 'ic' && e.paymentMethod === 'cash' ? 'cash' : w === 'ic' && e.paymentMethod === 'card' ? 'card' : undefined });
      S.remove('expenses', e.id);
      n++;
    });
    UI.toast(n + (n === 1 ? ' movimiento pasado' : ' movimientos pasados') + ' · ' + x.name + ' ' + U.money(walletInfo(w).balance, 'JPY'));
  }

  A.wallet = (el) => walletSheet(el.dataset.w || 'ic');
  A.walletIn = (el) => F.walletMove(el.dataset.w || 'ic');
  // Nombres de la v1.15.0 (por si quedó algún botón con ellos).
  A.suica = () => walletSheet('ic');
  A.suicaTopup = () => F.walletMove('ic');
  A.suicaAdjust = () => walletAdjust('ic');

  /* ── Gastos frecuentes: Konbini, metro, máquina de bebidas… con un toque ──
     Cada uno guarda nombre, emoji, importe, moneda, categoría y forma de pago. Tocarlo apunta el gasto
     de hoy (con «Deshacer»); en Gastos o en el Modo viaje. */
  const QEXP_IDEAS = [['Konbini', '🏪', 'food'], ['Metro', '🚇', 'transport'], ['Bebida', '🥤', 'food'], ['Café', '☕', 'cafe'], ['Ramen', '🍜', 'food'], ['Taquilla', '🔐', 'other']];
  const qexpList = () => Object.values(S.get().quickExpenses || {}).sort((a, b) => (a.order || 0) - (b.order || 0) || a.createdAt - b.createdAt);
  function quickExpenseRow() {
    const list = qexpList();
    return '<div class="qexp"><div class="row row--between"><small class="eyebrow muted">GASTOS FRECUENTES</small>' + UI.btn(list.length ? 'Editar' : 'Crear', { size: 'sm', variant: 'ghost', icon: list.length ? 'edit' : 'plus', data: { act: 'qexpManage' } }) + '</div>' +
      (list.length ? '<div class="qexp__list">' + list.map(function (q) {
        const c = D.EXPENSE[q.category], pay = q.paymentMethod && D.PAYMENT[q.paymentMethod];
        return '<button type="button" class="qexp__btn" data-act="qexpAdd" data-id="' + q.id + '"><span class="qexp__emoji" aria-hidden="true">' + esc(q.emoji || (c ? c[1] : '•')) + '</span>' +
          '<span class="qexp__t">' + esc(q.label) + '</span><span class="qexp__a mono">' + U.money(q.amount, q.currency) + (pay ? ' ' + pay[1] : '') + '</span></button>';
      }).join('') + '</div>' : '<p class="muted small">Konbini, metro, máquina de bebidas…: créalos una vez y apúntalos con un toque.</p>') + '</div>';
  }
  C.quickExpenseRow = quickExpenseRow;

  A.qexpAdd = function (el) {
    const q = S.get().quickExpenses[el.dataset.id];
    if (!q) return;
    const s = S.get(), t = S.today(), me = Object.values(s.travelers).find((p) => p.isMe) || Object.values(s.travelers)[0];
    const id = S.create('expenses', { amount: q.amount, currency: q.currency || 'JPY', category: q.category, paymentMethod: q.paymentMethod || undefined, description: q.label,
      date: t.now.date, cityId: t.phase === 'during' && t.city ? t.city.id : undefined, paidById: me && me.id, splitWithIds: me ? [me.id] : [] });
    const w = q.paymentMethod === 'ic' || q.paymentMethod === 'cash' ? walletInfo(q.paymentMethod) : null;
    UI.toast((q.emoji ? q.emoji + ' ' : '') + q.label + ' ' + U.money(q.amount, q.currency || 'JPY') + ' apuntado' + (w && w.active ? ' · ' + w.name + ' ' + U.money(w.balance, 'JPY') : ''),
      { label: 'Deshacer', run: () => { S.remove('expenses', id); UI.toast('Deshecho'); } });
  };

  A.qexpManage = function () {
    const list = qexpList();
    const body = '<div class="stack">' + (list.length ? '<div class="suica__list">' + list.map((q, i) => '<div class="suica__row qexp__row"><span class="qexp__emoji" aria-hidden="true">' + esc(q.emoji || '•') + '</span><span class="grow">' + esc(q.label) + '<small class="muted block">' + U.money(q.amount, q.currency) + ' · ' + esc((D.EXPENSE[q.category] || ['—'])[0]) + (q.paymentMethod ? ' · ' + esc(D.PAYMENT[q.paymentMethod][0]) : '') + '</small></span>' +
      (i > 0 ? UI.iconBtn('up', 'Subir', null, { size: 18 }).replace('<button', '<button data-q-up="' + q.id + '"') : '') + UI.iconBtn('edit', 'Editar ' + q.label, null, { size: 18 }).replace('<button', '<button data-q-edit="' + q.id + '"') + '</div>').join('') + '</div>'
      : '<p class="muted">Aún no tienes ninguno.</p>') +
      UI.btn('Añadir gasto frecuente', { icon: 'plus', block: true, data: { 'q-new': '1' } }) +
      '<small class="faint">También puedes crearlo desde un gasto: ábrelo y pulsa «☆ Guardar como frecuente».</small></div>';
    const close = UI.sheet({
      title: 'Gastos frecuentes', body: body,
      onMount: function (root) {
        root.addEventListener('click', function (ev) {
          const up = ev.target.closest('[data-q-up]'), ed = ev.target.closest('[data-q-edit]'), nw = ev.target.closest('[data-q-new]');
          if (up) {
            const l = qexpList(), i = l.findIndex((x) => x.id === up.dataset.qUp);
            if (i > 0) { const a = l[i - 1]; l[i - 1] = l[i]; l[i] = a; l.forEach((x, k) => S.update('quickExpenses', x.id, { order: k })); }
            close(); A.qexpManage();
          } else if (ed) { close(); F.qexp(ed.dataset.qEdit); }
          else if (nw) { close(); F.qexp(); }
        });
      }
    });
  };

  /** Nuevo / editar un gasto frecuente. def = valores de un gasto («Guardar como frecuente»). */
  F.qexp = function (id, def) {
    const q = id ? S.get().quickExpenses[id] : def || { currency: 'JPY', paymentMethod: walletInfo('ic').active ? 'ic' : undefined };
    const body = '<form id="fQexp" class="stack" novalidate>' +
      (id ? '' : '<div class="chips">' + QEXP_IDEAS.map((x) => '<button type="button" class="chip chip--btn" data-idea="' + x.join('|') + '"><span>' + x[1] + ' ' + x[0] + '</span></button>').join('') + '</div>') +
      '<div class="row row--top"><div style="width:76px">' + UI.field('Emoji', UI.input('emoji', q.emoji || '', { placeholder: '🏪' })) + '</div><div class="grow">' + UI.field('Nombre', UI.input('label', q.label || '', { placeholder: 'p.ej. Konbini' })) + '</div></div>' +
      '<label class="field"><span class="field__label">Importe</span><input class="input input--lg" name="amount" inputmode="decimal" placeholder="0" value="' + esc(q.amount ? String(q.amount).replace('.', ',') : '') + '" autocomplete="off"><span class="field__hint" id="qConv"></span></label>' +
      UI.chips('currency', D.CURRENCIES.map((c) => ({ value: c, label: c })), q.currency || 'JPY') +
      UI.field('Categoría', C.typePicker('category', D.EXPENSE, q.category, 'expense')) +
      UI.field('Pagado con', UI.chips('paymentMethod', D.options(D.PAYMENT), q.paymentMethod, { allowNone: true, noneLabel: '—' }), { optional: true }) +
      '<p class="error" hidden></p></form>';
    const close = UI.sheet({
      title: id ? 'Editar frecuente' : 'Nuevo gasto frecuente', body: body,
      footer: '<div class="row">' + (id ? UI.btn('Eliminar', { variant: 'danger', icon: 'trash', data: { del: '1' } }) : '') + UI.btn('Guardar', { type: 'submit', form: 'fQexp', block: true }) + '</div>',
      onMount: function (root) {
        const form = root.querySelector('#fQexp'), conv = root.querySelector('#qConv');
        const upd = () => { const f = UI.formData(form), v = U.parseAmount(f.amount); conv.textContent = v && f.currency !== 'EUR' ? C.eurOf(v, f.currency) : ''; };
        form.addEventListener('input', upd); form.addEventListener('change', upd); upd();
        root.querySelectorAll('[data-idea]').forEach((b) => b.addEventListener('click', function () {
          const x = b.dataset.idea.split('|');
          form.label.value = x[0]; form.emoji.value = x[1];
          const r = form.querySelector('input[name="category"][value="' + x[2] + '"]');
          if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
          form.amount.focus();
        }));
        const del = root.querySelector('[data-del]');
        if (del) del.addEventListener('click', async () => { if (await UI.confirm('¿Eliminar «' + q.label + '»?', 'Sólo se quita de frecuentes; los gastos ya apuntados se quedan.')) { S.remove('quickExpenses', id); close(); } });
        form.addEventListener('submit', function (ev) {
          ev.preventDefault();
          const f = UI.formData(form), err = form.querySelector('.error'), amount = U.parseAmount(f.amount);
          const problem = !f.label ? 'Ponle un nombre' : !amount ? 'Introduce un importe' : !f.category ? 'Elige una categoría' : '';
          if (problem) { err.textContent = problem; err.hidden = false; return; }
          const data = { label: f.label, emoji: (f.emoji || '').trim().slice(0, 8) || undefined, amount: amount, currency: f.currency || 'JPY', category: f.category, paymentMethod: f.paymentMethod || undefined };
          if (id) S.update('quickExpenses', id, data); else S.create('quickExpenses', Object.assign(data, { order: qexpList().length }));
          close();
          UI.toast('«' + f.label + '» guardado en frecuentes');
        });
      }
    });
  };

  A.newExpense = (el) => F.expense(null, { paymentMethod: el.dataset.pay, date: el.dataset.date, cityId: el.dataset.city, placeName: el.dataset.place, activityId: el.dataset.activity });
  /* Los gastos de días anteriores se abren bloqueados (para no cambiarlos sin querer): se ve todo el detalle
     y «Editar» los desbloquea. Al guardar vuelven a quedar bloqueados. Los de hoy se editan directamente. */
  A.editExpense = function (el) {
    const e = S.get().expenses[el.dataset.id];
    if (!e) return;
    if (e.date < S.today().now.date && !el.dataset.unlock) return expenseView(e.id);
    F.expense(e.id);
  };
  function expenseView(id) {
    const s = S.get(), e = s.expenses[id], main = s.trip.mainCurrency;
    const c = D.EXPENSE[e.category] || ['Gasto', '•'], pay = e.paymentMethod && D.PAYMENT[e.paymentMethod], city = e.cityId && s.cities[e.cityId];
    const multi = Object.keys(s.travelers).length > 1, parts = (e.splitWithIds || []).filter((x) => s.travelers[x]);
    const v = e.currency !== main ? U.convert(e.amount, e.currency, main, SV.rates()) : null;
    const row = (k, val) => (val ? '<div class="xv__row"><span class="muted">' + k + '</span><span>' + val + '</span></div>' : '');
    const body = '<div class="stack">' +
      '<div class="xv__head"><span class="exp__emoji" style="background:color-mix(in srgb, ' + C.catColor(e.category) + ' 18%, transparent)" aria-hidden="true">' + c[1] + '</span>' +
        '<div class="grow"><strong class="xv__title">' + esc(e.description || c[0]) + '</strong><small class="muted block">' + esc(U.fmtLong(e.date)) + '</small></div></div>' +
      '<div class="xv__amt mono">' + U.money(e.amount, e.currency) + (v !== null ? '<small class="muted block" data-noeur>≈ ' + U.money(v, main) + '</small>' : '') + '</div>' +
      '<div class="xv__rows">' + row('Categoría', esc(c[1] + ' ' + c[0])) + row('Pagado con', pay ? esc(pay[1] + ' ' + pay[0]) : '') + row('Ciudad', city ? esc(city.name) : '') + row('Lugar', e.placeName ? esc(e.placeName) : '') +
        row('Pagó', multi && e.paidById && s.travelers[e.paidById] ? esc(s.travelers[e.paidById].name) : '') +
        row('Para quién', multi && parts.length ? parts.map((x) => esc(s.travelers[x].name) + ' <span class="mono">' + U.money(e.amount / parts.length, e.currency) + '</span>').join('<br>') : '') +
        row('Tax free', e.taxFree ? '🛍️ Sí' : '') + row('Notas', e.notes ? '<span class="pre">' + esc(e.notes) + '</span>' : '') +
        (function () { const cv = coveredOf(e); return cv ? row('Te lo han pagado', '💝 ' + (cv.full ? 'Todo' : U.money(cv.amount, e.currency)) + (cv.from ? ' · ' + esc(cv.from) : '')) : ''; })() + '</div>' +
      '<div class="row row--center">' + UI.btn('💝 Me lo han pagado', { size: 'sm', variant: 'ghost', data: { act: 'newRefund', exp: e.id } }) + '</div>' +
      '<p class="xv__lock small muted">🔒 Es de un día anterior: está bloqueado para no cambiarlo sin querer.</p></div>';
    const close = UI.sheet({
      title: 'Gasto', body: body,
      footer: '<div class="row">' + UI.btn('Duplicar', { icon: 'copy', variant: 'secondary', data: { xv: 'dup' } }) + UI.btn('Editar', { icon: 'lock', block: true, data: { xv: 'edit' } }) + '</div>',
      onMount: function (root) {
        root.querySelectorAll('[data-xv]').forEach((b) => b.addEventListener('click', function () {
          close();
          if (b.dataset.xv === 'edit') F.expense(id);
          else { const d = Object.assign({}, e); delete d.id; delete d.isSample; d.date = S.today().now.date; const nid = S.create('expenses', d); UI.toast('Duplicado para hoy', { label: 'Deshacer', run: () => S.remove('expenses', nid) }); }
        }));
      }
    });
  }
})();
