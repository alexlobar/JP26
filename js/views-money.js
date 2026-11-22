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

  function summary(list) {
    const s = S.get(), main = s.trip.mainCurrency, rates = SV.rates(), t = S.today();
    const total = C.moneySum(list), budget = s.trip.totalBudget;
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
    let html = UI.card('<div class="stats">' + UI.stat('Total gastado', total.text, '', true) + (budget ? UI.stat('Restante', U.money(budget - total.total, main), Math.round((total.total / budget) * 100) + '% del presupuesto') : '') + '</div>' +
      (budget ? UI.progress(total.total / budget, total.total > budget ? 'accent' : 'info') : '') +
      '<div class="stats">' + UI.stat('Hoy', C.moneySum(list.filter((e) => e.date === t.now.date)).text) + UI.stat('Media diaria', U.money(avg, main), nDays ? nDays + ' días con gastos' : 'en el viaje') + '</div>' +
      (total.extra ? '<small class="warn">Sin convertir: ' + esc(total.extra) + '</small>' : ''), { cls: 'stack' });
    html += ratesInfo(list);
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
    html += UI.section('Por ciudad', UI.card(UI.bars(byCity.map(function (x) {
      const c = s.cities[x[0]];
      return { label: c ? c.name : 'Sin ciudad / antes del viaje', value: x[1], display: U.money(x[1], main) + (c && c.budget ? ' / ' + U.money(c.budget, main, true) : '') };
    }), '#2F6F73')));
    if (byDay.length) html += UI.section('Por día', UI.card(UI.bars(byDay.map((x) => ({ label: U.fmtDay(x[0]), value: x[1], display: U.money(x[1], main) })), '#B0893E')));
    return html;
  }

  const PAY_TONE = { cash: 'amber', card: 'blue', ic: 'green', mobile: 'violet', other: 'slate', none: 'slate' };

  /* Filtro de la lista: al tocar una categoría (en la barra de colores o en las barras) o una forma de pago. */
  A.expFilter = function (el) {
    const st = JT.uiState.expenses;
    st.filter = { k: el.dataset.k, v: el.dataset.v || '' };
    st.tab = 'list';
    if (location.hash.indexOf('#/expenses') === 0) JT.app.render(); else JT.go('expenses');
    window.scrollTo(0, 0);
  };
  A.expFilterClear = () => { JT.uiState.expenses.filter = null; JT.app.render(); };
  A.expSummary = function () {
    JT.uiState.expenses.tab = 'summary';
    if (location.hash.indexOf('#/expenses') === 0) JT.app.render(); else JT.go('expenses');
  };

  function expenseList(list) {
    const main = S.get().trip.mainCurrency, rates = SV.rates(), groups = {};
    const f = JT.uiState.expenses.filter;
    let head = '';
    if (f) {
      list = list.filter((e) => (e[f.k] || '') === f.v);
      const lbl = f.k === 'category' ? (D.EXPENSE[f.v] ? D.EXPENSE[f.v][1] + ' ' + D.EXPENSE[f.v][0] : f.v) : f.v ? (D.PAYMENT[f.v] ? D.PAYMENT[f.v][1] + ' ' + D.PAYMENT[f.v][0] : f.v) : 'Sin forma de pago';
      head = '<div class="filter-on"><span class="grow"><small class="muted block">' + (f.k === 'category' ? 'Categoría' : 'Pagado con') + '</small><strong>' + esc(lbl) + '</strong> · <span class="mono">' + C.moneySum(list).text + '</span> · ' + list.length + (list.length === 1 ? ' gasto' : ' gastos') + '</span>' +
        UI.btn('Quitar filtro', { icon: 'x', size: 'sm', variant: 'ghost', data: { act: 'expFilterClear' } }) + '</div>';
      if (!list.length) return head + '<p class="muted center">No hay gastos con este filtro.</p>';
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
    const r = L.balances(list, ids, (e) => U.convert(e.amount, e.currency, main, rates));
    const name = (id) => esc(s.travelers[id] ? s.travelers[id].name : '?');
    let html = UI.section('Balance por persona', UI.card(r.list.map((b) =>
      '<div class="row bal"><span class="dot" style="background:' + esc(s.travelers[b.id].color) + '"></span><div class="grow"><strong>' + name(b.id) + '</strong><small class="muted block">Pagó ' + U.money(b.paid, main) + ' · le corresponde ' + U.money(b.share, main) + '</small></div>' +
      '<strong class="mono ' + (b.balance > 0.5 ? 'success' : b.balance < -0.5 ? 'accent' : 'muted') + '">' + (b.balance > 0 ? '+' : '') + U.money(b.balance, main) + '</strong></div>').join(''), { cls: 'stack' }));
    html += UI.section('Para quedar en paz', (r.transfers.length ? UI.card(r.transfers.map((x) => '<p><strong>' + name(x.from) + '</strong> paga <strong class="mono">' + U.money(x.amount, main) + '</strong> a <strong>' + name(x.to) + '</strong></p>').join(''), { cls: 'stack-sm' }) : '<p class="muted">Todo cuadrado 🎉</p>') +
      (r.skipped ? '<small class="warn">' + r.skipped + ' gasto(s) en otra moneda sin tipo de cambio no se han incluido.</small>' : '') +
      '<p class="faint small">Sólo cuentan los gastos con «quién pagó». Si no se indica entre quién, se considera personal.</p>');
    return html;
  }

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
      UI.details('Más detalles',
        UI.field('Fecha', UI.input('date', e.date, { type: 'date' })) +
        UI.field('Ciudad', UI.chips('cityId', C.cityOptions(), e.cityId, { allowNone: true, noneLabel: 'Sin ciudad' }), { optional: true }) +
        UI.field('Lugar', UI.input('placeName', e.placeName || ''), { optional: true }) +
        (travelers.length > 1 ? UI.field('Pagó', UI.chips('paidById', travelers.map((x) => ({ value: x.id, label: x.name })), e.paidById)) +
          UI.field('Para quién', UI.chipsMulti('split', travelers.map((x) => ({ value: x.id, label: x.name })), e.splitWithIds), { hint: 'Marca a todos los que comparten el gasto.' }) : '') +
        UI.field('Notas', UI.textarea('notes', e.notes), { optional: true }), !!ex) +
      '<div class="row row--end">' + UI.btn('☆ Guardar como frecuente', { size: 'sm', variant: 'ghost', data: { 'save-q': '1' } }) + '</div>' +
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
            const after = wBase(w) - (jpy || 0);
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
            placeName: f.placeName || undefined, paymentMethod: f.paymentMethod || undefined, paidById: paid, splitWithIds: splitIds.length ? splitIds : paid ? [paid] : [], notes: f.notes || undefined, activityId: e.activityId, reservationId: e.reservationId, transportId: e.transportId, giftId: e.giftId };
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
  function walletInfo(w) {
    const s = S.get(), cfg = WALLETS[w];
    const moves = Object.values(s[cfg.coll] || {});
    // En efectivo sólo cuentan los pagos en yenes (lo pagado en euros en España no sale de tu cartera de yenes).
    const spent = Object.values(s.expenses).filter((e) => e.paymentMethod === cfg.pay && (!cfg.jpyOnly || e.currency === 'JPY'));
    const toSuica = w === 'cash' ? Object.values(s.suicaMoves || {}).filter((m) => m.kind !== 'adjust' && m.from === 'cash') : [];
    let ins = 0, adjust = 0, used = 0, unconv = 0, out = 0;
    moves.forEach((m) => { if (m.kind === 'adjust') adjust += Number(m.amount) || 0; else ins += Number(m.amount) || 0; });
    spent.forEach((e) => { const v = toJpy(e); if (v === null) unconv++; else used += v; });
    toSuica.forEach((m) => { out += Number(m.amount) || 0; });
    // Recargas o retiradas apuntadas como gasto: se pueden pasar a la cartera para no contarlas dos veces.
    const asExpense = Object.values(s.expenses).filter((e) => e.paymentMethod !== cfg.pay && cfg.re.test(e.description || ''));
    const name = cfg.name();
    return { w: w, cfg: cfg, name: name, balance: Math.round(ins + adjust - used - out), ins: ins, used: used, out: out, unconv: unconv,
      moves: moves, spent: spent, toSuica: toSuica, asExpense: asExpense,
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
          const go = ev.target.closest('[data-w-go]'), mv = ev.target.closest('[data-w-move]'), exp = ev.target.closest('[data-w-exp]'), icm = ev.target.closest('[data-w-ic]');
          if (!go && !mv && !exp && !icm) return;
          close();
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
  A.editExpense = (el) => F.expense(el.dataset.id);
})();
