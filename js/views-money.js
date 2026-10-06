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
      actions: UI.iconBtn('share', 'Compartir resumen', { act: 'shareExpenses' }) + UI.iconBtn('download', 'Exportar CSV', { act: 'exportCsv' }) }) + C.sampleBanner();
    html += '<div class="seg" role="tablist">' + [['summary', 'Resumen'], ['list', 'Lista (' + list.length + ')'], ['split', 'Reparto']].map((t) =>
      '<button type="button" role="tab" class="seg__item' + (st.tab === t[0] ? ' is-on' : '') + '" aria-selected="' + (st.tab === t[0]) + '" data-act="expTab" data-value="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>';
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
        (rates.rounding ? ' · yen redondeado al alza' + (rates.rounding === 'up1' ? ' +1' : '') : '') + (SV.online() ? '' : ' · sin conexión (último guardado)')
      : 'Conéctate para obtener el tipo de cambio o defínelo en Ajustes.';
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
    const byCat = group((e) => e.category), byCity = group((e) => e.cityId || 'none');
    const byDay = group((e) => (e.date >= s.trip.startDate && e.date <= s.trip.endDate ? e.date : undefined)).sort((a, b) => a[0].localeCompare(b[0]));
    let html = UI.card('<div class="stats">' + UI.stat('Total gastado', total.text, '', true) + (budget ? UI.stat('Restante', U.money(budget - total.total, main), Math.round((total.total / budget) * 100) + '% del presupuesto') : '') + '</div>' +
      (budget ? UI.progress(total.total / budget, total.total > budget ? 'accent' : 'info') : '') +
      '<div class="stats">' + UI.stat('Hoy', C.moneySum(list.filter((e) => e.date === t.now.date)).text) + UI.stat('Media diaria', U.money(avg, main), nDays ? nDays + ' días con gastos' : 'en el viaje') + '</div>' +
      (total.extra ? '<small class="warn">Sin convertir: ' + esc(total.extra) + '</small>' : ''), { cls: 'stack' });
    html += ratesInfo(list);
    html += UI.section('Por categoría', UI.card(UI.bars(byCat.map((x) => ({ label: D.EXPENSE[x[0]][0], emoji: D.EXPENSE[x[0]][1], value: x[1], display: U.money(x[1], main) })))));
    html += UI.section('Por ciudad', UI.card(UI.bars(byCity.map(function (x) {
      const c = s.cities[x[0]];
      return { label: c ? c.name : 'Sin ciudad / antes del viaje', value: x[1], display: U.money(x[1], main) + (c && c.budget ? ' / ' + U.money(c.budget, main, true) : '') };
    }), '#2F6F73')));
    if (byDay.length) html += UI.section('Por día', UI.card(UI.bars(byDay.map((x) => ({ label: U.fmtDay(x[0]), value: x[1], display: U.money(x[1], main) })), '#B0893E')));
    return html;
  }

  function expenseList(list) {
    const main = S.get().trip.mainCurrency, rates = SV.rates(), groups = {};
    list.forEach((e) => (groups[e.date] = (groups[e.date] || []).concat(e)));
    return Object.keys(groups).sort().reverse().map((date) => UI.section(U.fmtDay(date),
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
      currency: last ? last.currency : 'JPY', date: def.date || t.now.date, cityId: def.cityId || (t.phase === 'during' && t.city ? t.city.id : undefined),
      placeName: def.placeName, activityId: def.activityId, paidById: me && me.id, splitWithIds: me ? [me.id] : []
    };
    const main = s.trip.mainCurrency;
    const body = '<form id="fExp" class="stack" novalidate>' +
      '<label class="field"><span class="field__label">Importe</span><input class="input input--lg" name="amount" inputmode="decimal" placeholder="0" value="' + esc(ex ? String(ex.amount).replace('.', ',') : '') + '"' + (ex ? '' : ' autofocus') + ' autocomplete="off"><span class="field__hint" id="conv"></span></label>' +
      UI.chips('currency', D.CURRENCIES.map((c) => ({ value: c, label: c })), e.currency) +
      UI.field('Categoría', UI.chips('category', D.options(D.EXPENSE), e.category)) +
      UI.field('Descripción', UI.input('description', e.description || '', { placeholder: 'p.ej. Cena ramen' }), { optional: true }) +
      UI.details('Más detalles',
        UI.field('Fecha', UI.input('date', e.date, { type: 'date' })) +
        UI.field('Ciudad', UI.chips('cityId', C.cityOptions(), e.cityId, { allowNone: true, noneLabel: 'Sin ciudad' }), { optional: true }) +
        UI.field('Lugar', UI.input('placeName', e.placeName || ''), { optional: true }) +
        UI.field('Método de pago', UI.chips('paymentMethod', D.options(D.PAYMENT), e.paymentMethod, { allowNone: true, noneLabel: '—' }), { optional: true }) +
        (travelers.length > 1 ? UI.field('Pagó', UI.chips('paidById', travelers.map((x) => ({ value: x.id, label: x.name })), e.paidById)) +
          UI.field('Para quién', UI.chipsMulti('split', travelers.map((x) => ({ value: x.id, label: x.name })), e.splitWithIds), { hint: 'Marca a todos los que comparten el gasto.' }) : '') +
        UI.field('Notas', UI.textarea('notes', e.notes), { optional: true }), !!ex) +
      '<p class="error" hidden></p></form>';
    const close = UI.sheet({
      title: ex ? 'Editar gasto' : 'Nuevo gasto', body: body,
      footer: '<div class="row">' + (ex ? UI.btn('Eliminar', { variant: 'danger', icon: 'trash', data: { del: '1' } }) : '') + UI.btn('Guardar', { type: 'submit', form: 'fExp', block: true }) + '</div>',
      onMount: function (root) {
        const form = root.querySelector('#fExp'), conv = form.querySelector('#conv');
        const updateConv = function () {
          const f = UI.formData(form), v = U.parseAmount(f.amount);
          if (!v || f.currency === main) { conv.textContent = ''; return; }
          const c = U.convert(v, f.currency, main, SV.rates());
          conv.textContent = c !== null ? '≈ ' + U.money(c, main) : 'Sin tipo de cambio ' + f.currency + '→' + main + ': se sumará cuando lo haya';
        };
        form.addEventListener('input', updateConv);
        form.addEventListener('change', updateConv);
        updateConv();
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
            placeName: f.placeName || undefined, paymentMethod: f.paymentMethod || undefined, paidById: paid, splitWithIds: splitIds.length ? splitIds : paid ? [paid] : [], notes: f.notes || undefined, activityId: e.activityId };
          if (ex) S.update('expenses', ex.id, data); else S.create('expenses', data);
          UI.toast('Gasto de ' + U.money(amount, f.currency) + ' guardado');
          close();
        });
      }
    });
  };

  A.newExpense = (el) => F.expense(null, { date: el.dataset.date, cityId: el.dataset.city, placeName: el.dataset.place, activityId: el.dataset.activity });
  A.editExpense = (el) => F.expense(el.dataset.id);
})();
