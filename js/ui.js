/* ============================================================
   ui.js — Componentes de interfaz. Cada función devuelve HTML
   (todo dato del usuario pasa por esc()). Los botones llevan
   data-act="accion" y los gestiona la delegación de app.js.
   También: bottom sheets, menús, confirmaciones y avisos.
   ============================================================ */
window.JT = window.JT || {};

JT.ui = (function () {
  'use strict';

  const U = JT.utils;
  const esc = U.esc;

  /** data-* a partir de un objeto: { act:'x', id:'y' } → data-act="x" data-id="y" */
  function dataAttrs(d) {
    if (!d) return '';
    return Object.keys(d).filter((k) => d[k] !== undefined && d[k] !== null).map((k) => ' data-' + k + '="' + esc(d[k]) + '"').join('');
  }

  function btn(label, o) {
    o = o || {};
    const cls = ['btn', 'btn--' + (o.variant || 'primary'), o.size ? 'btn--' + o.size : '', o.block ? 'btn--block' : ''].join(' ');
    return '<button type="' + (o.type || 'button') + '" class="' + cls + '"' + dataAttrs(o.data) + (o.disabled ? ' disabled' : '') + (o.form ? ' form="' + o.form + '"' : '') + '>' +
      (o.icon ? U.icon(o.icon, o.size === 'sm' ? 16 : 18) : '') + (o.emoji ? '<span aria-hidden="true">' + o.emoji + '</span>' : '') + '<span>' + esc(label) + '</span></button>';
  }

  function iconBtn(icon, label, data, o) {
    o = o || {};
    return '<button type="button" class="iconbtn' + (o.active ? ' is-active' : '') + '" aria-label="' + esc(label) + '" title="' + esc(label) + '"' + dataAttrs(data) + '>' + U.icon(icon, o.size || 22) + '</button>';
  }

  function card(content, o) {
    o = o || {};
    const cls = 'card' + (o.tone ? ' card--' + o.tone : '') + (o.data ? ' card--tap' : '') + (o.cls ? ' ' + o.cls : '');
    return '<div class="' + cls + '"' + dataAttrs(o.data) + (o.data ? ' tabindex="0"' : '') + (o.label ? ' aria-label="' + esc(o.label) + '"' : '') + '>' + content + '</div>';
  }

  function pill(label, tone, icon) {
    return '<span class="pill pill--' + (tone || 'neutral') + '">' + (icon ? U.icon(icon, 12) : '') + esc(label) + '</span>';
  }

  function banner(tone, icon, title, msg, o) {
    o = o || {};
    return '<div class="banner banner--' + tone + (o.data ? ' card--tap' : '') + '"' + dataAttrs(o.data) + (o.data ? ' tabindex="0"' : '') + '>' + U.icon(icon, 20) +
      '<div class="banner__text"><strong>' + esc(title) + '</strong>' + (msg ? '<span>' + esc(msg) + '</span>' : '') + '</div>' + (o.action || '') + '</div>';
  }

  function header(o) {
    return '<header class="hdr">' +
      (o.back ? '<div class="hdr__bar">' + iconBtn('back', 'Volver', { act: 'back' }) + '<div class="hdr__actions">' + (o.actions || '') + '</div></div>' : '') +
      '<div class="hdr__main"><div class="hdr__titles">' +
      (o.eyebrow ? '<div class="eyebrow">' + esc(o.eyebrow) + '</div>' : '') +
      '<h1 class="' + (o.large ? 'display' : 'title') + '">' + esc(o.title) + '</h1>' +
      (o.subtitle ? '<p class="muted">' + esc(o.subtitle) + '</p>' : '') +
      '</div>' + (!o.back && o.actions ? '<div class="hdr__actions">' + o.actions + '</div>' : '') + '</div></header>';
  }

  function section(title, content, action) {
    return '<section class="section">' + (title || action ? '<div class="section__hdr">' + (title ? '<h2 class="section__title">' + esc(title) + '</h2>' : '<span></span>') + (action || '') + '</div>' : '') + content + '</section>';
  }

  function empty(emoji, title, msg, action) {
    return '<div class="empty"><div class="empty__emoji" aria-hidden="true">' + emoji + '</div><h3>' + esc(title) + '</h3>' + (msg ? '<p class="muted">' + esc(msg) + '</p>' : '') + (action || '') + '</div>';
  }

  function stat(label, value, sub, accent) {
    return '<div class="stat"><span class="stat__label">' + esc(label) + '</span><strong class="stat__value' + (accent ? ' accent' : '') + '">' + esc(value) + '</strong>' + (sub ? '<span class="stat__sub">' + esc(sub) + '</span>' : '') + '</div>';
  }

  function progress(v, tone) {
    const pct = U.clamp(v || 0, 0, 1) * 100;
    return '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(pct) + '"><div class="progress__fill progress__fill--' + (tone || 'accent') + '" style="width:' + pct + '%"></div></div>';
  }

  /** Gráfico de barras horizontal sin librerías. data: [{label, emoji, value, display}] */
  function bars(data, color) {
    const max = Math.max.apply(null, [1].concat(data.map((d) => d.value)));
    return '<div class="bars">' + data.map((d) =>
      '<div class="bars__row" aria-label="' + esc(d.label + ': ' + d.display) + '"><div class="bars__hdr"><span>' + (d.emoji ? d.emoji + '  ' : '') + esc(d.label) + '</span><strong class="mono">' + esc(d.display) + '</strong></div>' +
      '<div class="bars__track"><div class="bars__fill" style="width:' + (d.value / max) * 100 + '%;' + (color ? 'background:' + color : '') + '"></div></div></div>').join('') + '</div>';
  }

  function listRow(o) {
    const lead = o.emoji ? '<span class="lr__icon" aria-hidden="true">' + o.emoji + '</span>' : o.icon ? '<span class="lr__icon">' + U.icon(o.icon, 18) + '</span>' : '';
    const tag = o.data ? 'button type="button"' : 'div';
    return '<' + tag + ' class="lr' + (o.data ? ' lr--tap' : '') + '"' + dataAttrs(o.data) + '>' + lead +
      '<span class="lr__text"><span class="lr__title">' + esc(o.title) + '</span>' + (o.sub ? '<span class="lr__sub">' + esc(o.sub) + '</span>' : '') + '</span>' +
      (o.right || '') + (o.data && o.chevron !== false ? '<span class="lr__chev">' + U.icon('chevron', 16) + '</span>' : '') + '</' + (o.data ? 'button' : 'div') + '>';
  }

  function stars(value, data) {
    let out = '<span class="stars" aria-label="Valoración ' + (value || 0) + ' de 5">';
    for (let i = 1; i <= 5; i++) {
      const on = (value || 0) >= i;
      out += data
        ? '<button type="button" class="star' + (on ? ' is-on' : '') + '" aria-label="' + i + ' estrellas"' + dataAttrs(Object.assign({}, data, { value: value === i ? 0 : i })) + '>' + U.icon('star', 22) + '</button>'
        : '<span class="star star--sm' + (on ? ' is-on' : '') + '">' + U.icon('star', 12) + '</span>';
    }
    return out + '</span>';
  }

  /** "Abierto · cierra 22:00" con la hora de Japón (o la simulada). */
  function openBadge(hours, openNow) {
    if (openNow === true) return pill('Abierto', 'success');
    if (openNow === false) return pill('Cerrado', 'neutral');
    const n = JT.store.now();
    const st = U.openStatus(hours, U.weekday(n.date), n.minutes);
    if (st.state === 'open') return pill('Abierto · cierra ' + st.closesAt, 'success');
    if (st.state === 'closed') return pill(st.opensAt ? 'Cerrado · abre ' + st.opensAt : 'Cerrado hoy', 'neutral');
    return '';
  }

  /* ── Formularios ──────────────────────────────────────────── */

  function field(label, control, o) {
    o = o || {};
    return '<label class="field"><span class="field__label">' + esc(label) + (o.optional ? ' <em>· opcional</em>' : '') + '</span>' + control +
      (o.hint ? '<span class="field__hint"' + (o.hintId ? ' id="' + o.hintId + '"' : '') + '>' + esc(o.hint) + '</span>' : '') + '</label>';
  }

  function input(name, value, o) {
    o = o || {};
    return '<input class="input' + (o.large ? ' input--lg' : '') + '" name="' + name + '" type="' + (o.type || 'text') + '" value="' + esc(value) + '"' +
      (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') + (o.required ? ' required' : '') + (o.inputmode ? ' inputmode="' + o.inputmode + '"' : '') +
      (o.autofocus ? ' autofocus' : '') + (o.min ? ' min="' + o.min + '"' : '') + (o.max ? ' max="' + o.max + '"' : '') + (o.step ? ' step="' + o.step + '"' : '') +
      (o.list ? ' list="' + o.list + '"' : '') + ' autocomplete="off">';
  }

  function textarea(name, value, placeholder, rows) {
    return '<textarea class="input" name="' + name + '" rows="' + (rows || 3) + '" placeholder="' + esc(placeholder || '') + '">' + esc(value) + '</textarea>';
  }

  /** Chips de selección única (radios nativos: los valores salen en FormData). */
  function chips(name, opts, value, o) {
    o = o || {};
    const items = (o.allowNone ? [{ value: '', label: o.noneLabel || 'Ninguno' }] : []).concat(opts);
    return '<div class="chips' + (o.scroll ? ' chips--scroll' : '') + '" role="radiogroup">' + items.map((op) =>
      '<label class="chip"><input type="radio" name="' + name + '" value="' + esc(op.value) + '"' + (String(op.value) === String(value === undefined || value === null ? '' : value) ? ' checked' : '') + '>' +
      '<span>' + (op.emoji ? op.emoji + ' ' : '') + esc(op.label) + '</span></label>').join('') + '</div>';
  }

  function chipsMulti(name, opts, values, o) {
    o = o || {};
    return '<div class="chips' + (o.scroll ? ' chips--scroll' : '') + '">' + opts.map((op) =>
      '<label class="chip"><input type="checkbox" name="' + name + '" value="' + esc(op.value) + '"' + ((values || []).indexOf(op.value) > -1 ? ' checked' : '') + '>' +
      '<span>' + (op.emoji ? op.emoji + ' ' : '') + esc(op.label) + '</span></label>').join('') + '</div>';
  }

  /** Chips de filtro fuera de formularios (botones con estado). */
  function filterChips(opts, value, act, o) {
    o = o || {};
    return '<div class="chips' + (o.scroll !== false ? ' chips--scroll' : '') + '">' + opts.map((op) =>
      '<button type="button" class="chip chip--btn' + (String(op.value) === String(value) ? ' is-on' : '') + '" aria-pressed="' + (String(op.value) === String(value)) + '"' +
      dataAttrs({ act: act, value: op.value }) + '><span>' + (op.emoji ? op.emoji + ' ' : '') + esc(op.label) + '</span></button>').join('') + '</div>';
  }

  function details(label, content, open) {
    return '<details class="more"' + (open ? ' open' : '') + '><summary>' + esc(label) + U.icon('down', 16) + '</summary><div class="stack">' + content + '</div></details>';
  }

  function formData(form) {
    const fd = new FormData(form), out = {};
    for (const pair of fd.entries()) {
      const k = pair[0], v = typeof pair[1] === 'string' ? pair[1].trim() : pair[1];
      if (k in out) out[k] = [].concat(out[k], v); else out[k] = v;
    }
    return out;
  }
  function list(v) { return v === undefined ? [] : [].concat(v).filter(Boolean); }

  /* ── Bottom sheet ─────────────────────────────────────────── */

  let sheetStack = [];

  /**
   * Abre una hoja inferior. o = { title, body, footer, onMount(el, close), wide }.
   * Devuelve close(). Esc o tocar fuera también cierran.
   */
  function sheet(o) {
    const root = document.createElement('div');
    root.className = 'sheet-wrap';
    root.innerHTML = '<div class="sheet-backdrop" data-close></div>' +
      '<div class="sheet" role="dialog" aria-modal="true"' + (o.title ? ' aria-label="' + esc(o.title) + '"' : '') + '>' +
      '<div class="sheet__grabber"></div>' +
      (o.title ? '<div class="sheet__hdr"><h2>' + esc(o.title) + '</h2>' + iconBtn('x', 'Cerrar', null) + '</div>' : '') +
      '<div class="sheet__body">' + (o.body || '') + '</div>' + (o.footer ? '<div class="sheet__footer">' + o.footer + '</div>' : '') + '</div>';
    document.body.appendChild(root);
    const prevFocus = document.activeElement;
    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      root.classList.remove('is-open');
      sheetStack = sheetStack.filter((x) => x !== close);
      setTimeout(() => { root.remove(); if (prevFocus && prevFocus.focus) prevFocus.focus(); }, 200);
      if (o.onClose) o.onClose();
    }
    root.querySelector('[data-close]').addEventListener('click', close);
    const x = root.querySelector('.sheet__hdr .iconbtn');
    if (x) x.addEventListener('click', close);
    sheetStack.push(close);
    requestAnimationFrame(() => root.classList.add('is-open'));
    if (o.onMount) o.onMount(root.querySelector('.sheet'), close);
    const af = root.querySelector('[autofocus]');
    setTimeout(() => (af ? af.focus() : root.querySelector('.sheet').focus && root.querySelector('.sheet').setAttribute('tabindex', '-1')), 60);
    return close;
  }

  function closeTopSheet() { const c = sheetStack[sheetStack.length - 1]; if (c) { c(); return true; } return false; }

  /** Menú de acciones. items: [{ label, emoji|icon, hint, run, destructive }] */
  function menu(title, items) {
    const close = sheet({
      title: title,
      body: '<div class="menu">' + items.map((it, i) =>
        '<button type="button" class="menu__item' + (it.destructive ? ' is-danger' : '') + '" data-i="' + i + '">' +
        '<span class="menu__icon" aria-hidden="true">' + (it.emoji || (it.icon ? U.icon(it.icon, 20) : '')) + '</span>' +
        '<span class="menu__text"><span>' + esc(it.label) + '</span>' + (it.hint ? '<small>' + esc(it.hint) + '</small>' : '') + '</span></button>').join('') + '</div>',
      onMount: function (el) {
        el.querySelectorAll('.menu__item').forEach((b) => b.addEventListener('click', function () {
          close();
          setTimeout(() => items[+b.dataset.i].run(), 120);
        }));
      }
    });
    return close;
  }

  /** Confirmación propia (mismo aspecto en todos los navegadores). */
  function confirm(title, msg, o) {
    o = o || {};
    return new Promise(function (resolve) {
      let answered = false;
      const close = sheet({
        title: title,
        body: msg ? '<p class="pre">' + esc(msg) + '</p>' : '',
        footer: '<div class="row">' + btn('Cancelar', { variant: 'secondary', data: { r: '0' } }) + btn(o.ok || 'Eliminar', { variant: o.danger === false ? 'primary' : 'danger', data: { r: '1' } }) + '</div>',
        onMount: function (el) {
          el.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', function () { answered = true; resolve(b.dataset.r === '1'); close(); }));
        },
        onClose: function () { if (!answered) resolve(false); }
      });
    });
  }

  function alert(title, msg) {
    sheet({ title: title, body: '<p class="pre">' + esc(msg || '') + '</p>', footer: '<button type="button" class="btn btn--primary btn--block" data-ok>Entendido</button>', onMount: (el, close) => el.querySelector('[data-ok]').addEventListener('click', close) });
  }

  /* ── Toast ────────────────────────────────────────────────── */

  let toastTimer;
  function toast(msg) {
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-on'), 2200);
  }

  return {
    dataAttrs, btn, iconBtn, card, pill, banner, header, section, empty, stat, progress, bars, listRow, stars, openBadge,
    field, input, textarea, chips, chipsMulti, filterChips, details, formData, list,
    sheet, closeTopSheet, menu, confirm, alert, toast
  };
})();
