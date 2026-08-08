(() => {
  'use strict';

  const STORAGE_KEY = 'sae_data';
  const SCHEMA_VERSION = 1;
  const BUSINESS_ID = 'vending-limpieza';
  const BUSINESS_NAME = 'Vending de limpieza';
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  const icons = {
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>',
    delete: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16m-10 4v6m4-6v6M9 7l1-3h4l1 3m3 0-1 14H7L6 7"/></svg>',
    empty: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4z"/><path d="M8 10h8M8 14h4"/></svg>',
    warning: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4m0 4h.01"/><path d="M10.3 3.8 2.5 17.2A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.8L13.7 3.8a2 2 0 0 0-3.4 0Z"/></svg>'
  };

  const Storage = {
    createDefault() {
      return { version: SCHEMA_VERSION, businesses: { [BUSINESS_ID]: { sales: [], expenses: [] } } };
    },
    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return this.createDefault();
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== SCHEMA_VERSION || typeof parsed.businesses !== 'object') return this.createDefault();
        if (!parsed.businesses[BUSINESS_ID]) parsed.businesses[BUSINESS_ID] = { sales: [], expenses: [] };
        const business = parsed.businesses[BUSINESS_ID];
        if (!Array.isArray(business.sales)) business.sales = [];
        if (!Array.isArray(business.expenses)) business.expenses = [];
        return parsed;
      } catch (error) {
        console.warn('SAE no pudo leer los datos guardados.', error);
        return this.createDefault();
      }
    },
    save(data) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        return true;
      } catch (error) {
        console.error('SAE no pudo guardar los datos.', error);
        return false;
      }
    },
    business(data) { return data.businesses[BUSINESS_ID]; },
    resetBusiness(data) {
      data.businesses[BUSINESS_ID] = { sales: [], expenses: [] };
      return this.save(data);
    }
  };

  const now = new Date();
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const state = {
    data: Storage.load(),
    view: 'summary',
    activeMonth: new Date(currentMonth),
    editingId: null,
    editingType: null,
    pendingDelete: null
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const monthKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const recordMonth = record => record.date.slice(0, 7);
  const money = value => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(value || 0);
  const monthName = date => new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(date);
  const escapeHTML = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const generateId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const selectedRecords = type => Storage.business(state.data)[type].filter(item => recordMonth(item) === monthKey(state.activeMonth)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const total = records => records.reduce((sum, item) => sum + Number(item.amount), 0);
  const isCurrentMonth = () => monthKey(state.activeMonth) === monthKey(currentMonth);

  function validISODate(value) {
    if (!DATE_RE.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  function defaultDateForMonth() {
    if (isCurrentMonth()) return todayISO();
    const y = state.activeMonth.getFullYear();
    const m = state.activeMonth.getMonth();
    const lastDay = new Date(y, m + 1, 0).getDate();
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }

  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast${type === 'error' ? ' error' : ''}`;
    toast.textContent = message;
    $('#toast-region').append(toast);
    window.setTimeout(() => toast.remove(), 3200);
  }

  function updateMonthHeader() {
    $('#month-label').textContent = monthName(state.activeMonth);
    $('#month-state').textContent = isCurrentMonth() ? 'Mes actual' : '';
    $('#month-next').disabled = isCurrentMonth();
    $('#month-selector').classList.toggle('is-hidden', state.view === 'settings');
  }

  function setView(view) {
    state.view = view;
    state.editingId = null;
    state.editingType = null;
    $$('.nav-item[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    const titles = { summary: 'Resumen financiero', sales: 'Ventas', expenses: 'Gastos', settings: 'Ajustes del negocio' };
    $('#view-title').textContent = titles[view];
    $('#view-eyebrow').textContent = BUSINESS_NAME;
    render();
  }

  function render() {
    updateMonthHeader();
    const container = $('#view-container');
    container.style.animation = 'none';
    void container.offsetWidth;
    container.style.animation = '';
    if (state.view === 'summary') renderSummary();
    else if (state.view === 'sales') renderRecords('sales');
    else if (state.view === 'expenses') renderRecords('expenses');
    else renderSettings();
  }

  function renderSummary() {
    const sales = total(selectedRecords('sales'));
    const expenses = total(selectedRecords('expenses'));
    const result = sales - expenses;
    const resultTone = result > 0 ? 'positive' : result < 0 ? 'negative' : 'zero';
    $('#view-container').innerHTML = `
      <section class="metric-grid" aria-label="Resumen del mes">
        <article class="metric-card metric-card--main"><span class="metric-label">Resultado del mes</span><strong class="metric-value tone-${resultTone}">${money(result)}</strong></article>
        <article class="metric-card metric-card--sales"><span class="metric-label">Ventas</span><strong class="metric-value tone-positive">${money(sales)}</strong></article>
        <article class="metric-card metric-card--expenses"><span class="metric-label">Gastos</span><strong class="metric-value tone-negative">${money(expenses)}</strong></article>
      </section>
      <section class="panel">
        <header class="panel-header">
          <div><h2>Comportamiento de los últimos 6 meses</h2><p>Ventas, gastos y resultado mensual</p></div>
          <div class="chart-legend" aria-label="Leyenda"><span class="legend-item"><i class="legend-swatch"></i> Ventas</span><span class="legend-item"><i class="legend-swatch expense"></i> Gastos</span><span class="legend-item"><i class="legend-swatch result"></i> Resultado</span></div>
        </header>
        <div class="chart-wrap">${buildChart()}</div>
      </section>`;
  }

  function buildChart() {
    const business = Storage.business(state.data);
    const months = [];
    for (let offset = 5; offset >= 0; offset--) {
      const date = new Date(state.activeMonth.getFullYear(), state.activeMonth.getMonth() - offset, 1);
      const key = monthKey(date);
      const sales = total(business.sales.filter(item => recordMonth(item) === key));
      const expenses = total(business.expenses.filter(item => recordMonth(item) === key));
      months.push({ date, sales, expenses, result: sales - expenses });
    }
    const values = months.flatMap(item => [item.sales, item.expenses, item.result, 0]);
    const maxAbs = Math.max(...values.map(Math.abs), 1);
    const width = 900, height = 240, left = 58, right = 18, top = 12, bottom = 34;
    const plotW = width - left - right, plotH = height - top - bottom;
    const scaleMax = maxAbs * 1.15;
    const min = Math.min(0, ...months.map(m => m.result));
    const max = Math.max(0, ...months.flatMap(m => [m.sales, m.expenses, m.result]));
    const range = Math.max(max - min, 1);
    const y = value => top + ((max - value) / range) * plotH;
    const zeroY = y(0);
    const groupW = plotW / months.length;
    const barW = Math.min(26, groupW * .22);
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfica de ventas, gastos y resultado de seis meses"><defs><linearGradient id="result-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".075"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>`;
    for (let i = 0; i <= 4; i++) {
      const gy = top + plotH * i / 4;
      const value = max - range * i / 4;
      svg += `<line class="chart-grid" x1="${left}" x2="${width-right}" y1="${gy}" y2="${gy}"/><text class="chart-label" x="${left-9}" y="${gy+3}" text-anchor="end">${compactMoney(value)}</text>`;
    }
    svg += `<line class="chart-zero" x1="${left}" x2="${width-right}" y1="${zeroY}" y2="${zeroY}"/>`;
    const points = months.map((item, index) => {
      const center = left + groupW * index + groupW / 2;
      return `${center},${y(item.result)}`;
    });
    months.forEach((item, index) => {
      const center = left + groupW * index + groupW / 2;
      svg += `<line class="chart-month-guide" x1="${center}" x2="${center}" y1="${top}" y2="${top+plotH}"/>`;
    });
    const firstX = points[0].split(',')[0];
    const lastX = points[points.length - 1].split(',')[0];
    svg += `<polygon class="chart-result-area" points="${firstX},${zeroY} ${points.join(' ')} ${lastX},${zeroY}"/>`;
    months.forEach((item, index) => {
      const center = left + groupW * index + groupW / 2;
      const salesY = y(item.sales), expenseY = y(item.expenses);
      svg += `<rect class="chart-bar-sales" x="${center-barW-2}" y="${Math.min(salesY, zeroY)}" width="${barW}" height="${Math.max(Math.abs(zeroY-salesY), .5)}" rx="3"/>`;
      svg += `<rect class="chart-bar-expenses" x="${center+2}" y="${Math.min(expenseY, zeroY)}" width="${barW}" height="${Math.max(Math.abs(zeroY-expenseY), .5)}" rx="3"/>`;
      const label = new Intl.DateTimeFormat('es-MX', { month: 'short' }).format(item.date).replace('.', '');
      svg += `<text class="chart-label" x="${center}" y="${height-10}" text-anchor="middle">${escapeHTML(label)}</text>`;
    });
    svg += `<polyline class="chart-result" points="${points.join(' ')}"/>`;
    points.forEach(point => { const [cx, cy] = point.split(','); svg += `<circle class="chart-point-halo" cx="${cx}" cy="${cy}" r="7"/><circle class="chart-point" cx="${cx}" cy="${cy}" r="3.6"/>`; });
    return svg + '</svg>';
  }

  function compactMoney(value) {
    const abs = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    if (abs >= 1000000) return `${sign}$${(abs / 1000000).toFixed(1)}M`;
    if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
    return `${sign}$${Math.round(abs)}`;
  }

  function renderRecords(type) {
    const isSales = type === 'sales';
    const records = selectedRecords(type);
    const editing = state.editingType === type ? Storage.business(state.data)[type].find(item => item.id === state.editingId) : null;
    const label = isSales ? 'venta' : 'gasto';
    $('#view-container').innerHTML = `
      <div class="records-layout">
        <section class="panel form-panel">
          <div class="form-panel__heading"><h2>${editing ? `Editar ${label}` : isSales ? 'Registrar recolección' : 'Registrar gasto'}</h2><p>${editing ? 'Actualiza los datos del registro.' : isSales ? 'Registra el efectivo retirado de la máquina.' : 'Agrega un gasto del negocio.'}</p></div>
          <form id="record-form" class="form-grid" novalidate>
            <div class="field"><label for="record-date">Fecha</label><input id="record-date" name="date" type="date" max="${todayISO()}" value="${editing ? escapeHTML(editing.date) : defaultDateForMonth()}" required><span class="field-error" data-error="date"></span></div>
            ${isSales ? '' : `<div class="field"><label for="record-concept">Concepto</label><input id="record-concept" name="concept" type="text" maxlength="100" autocomplete="off" value="${editing ? escapeHTML(editing.concept) : ''}" required><span class="field-error" data-error="concept"></span></div>`}
            <div class="field"><label for="record-amount">${isSales ? 'Monto retirado' : 'Monto'} <small>(MXN)</small></label><input id="record-amount" name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" value="${editing ? escapeHTML(editing.amount) : ''}" required><span class="field-error" data-error="amount"></span></div>
            <div class="field"><label for="record-note">Nota <small>(opcional)</small></label><textarea id="record-note" name="note" maxlength="300" placeholder="Información adicional">${editing ? escapeHTML(editing.note) : ''}</textarea><span class="field-error" data-error="note"></span></div>
            <div class="form-actions"><button class="button button--primary" type="submit">${editing ? 'Guardar cambios' : 'Guardar registro'}</button>${editing ? '<button class="button button--ghost" id="cancel-edit" type="button">Cancelar</button>' : ''}</div>
          </form>
        </section>
        <section class="panel records-panel">
          <header class="panel-header"><div><h2>${isSales ? 'Recolecciones' : 'Gastos registrados'}</h2><p>${escapeHTML(monthName(state.activeMonth))}</p></div><div class="total-summary"><span>${isSales ? 'Total registrado' : 'Total de gastos'}</span><strong class="${isSales ? 'tone-positive' : 'tone-negative'}">${money(total(records))}</strong></div></header>
          ${records.length ? `<div class="record-list">${records.map(item => recordRow(item, type)).join('')}</div>` : emptyRecords(isSales)}
        </section>
      </div>`;
    $('#record-form').addEventListener('submit', event => submitRecord(event, type));
    $('#cancel-edit')?.addEventListener('click', () => { state.editingId = null; state.editingType = null; renderRecords(type); });
    $$('.action-button[data-action="edit"]', $('#view-container')).forEach(button => button.addEventListener('click', () => editRecord(type, button.dataset.id)));
    $$('.action-button[data-action="delete"]', $('#view-container')).forEach(button => button.addEventListener('click', () => requestDelete(type, button.dataset.id)));
  }

  function recordRow(item, type) {
    const date = new Date(`${item.date}T12:00:00`);
    const day = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short' }).format(date).replace('.', '');
    const weekday = new Intl.DateTimeFormat('es-MX', { weekday: 'short' }).format(date).replace('.', '');
    const concept = type === 'expenses' ? `<div class="record-note"><strong>${escapeHTML(item.concept)}</strong>${item.note ? `<br>${escapeHTML(item.note)}` : ''}</div>` : `<div class="record-note ${item.note ? '' : 'record-note--empty'}">${item.note ? escapeHTML(item.note) : 'Sin nota'}</div>`;
    return `<article class="record-row"><div class="record-date">${escapeHTML(day)}<small>${escapeHTML(weekday)}</small></div><div class="record-amount ${type === 'sales' ? 'tone-positive' : 'tone-negative'}">${money(item.amount)}</div>${concept}<div class="record-actions"><button class="action-button" type="button" data-action="edit" data-id="${escapeHTML(item.id)}" aria-label="Editar registro" title="Editar">${icons.edit}</button><button class="action-button delete" type="button" data-action="delete" data-id="${escapeHTML(item.id)}" aria-label="Eliminar registro" title="Eliminar">${icons.delete}</button></div></article>`;
  }

  function emptyRecords(isSales) {
    return `<div class="empty-state"><div class="empty-icon">${icons.empty}</div><h3>Aún no hay ${isSales ? 'recolecciones' : 'gastos'} este mes</h3><p>${isSales ? 'Los registros que agregues para este mes aparecerán aquí.' : 'Agrega el primer gasto usando el formulario.'}</p></div>`;
  }

  function submitRecord(event, type) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const errors = {};
    const amount = Number(values.amount);
    if (!validISODate(values.date)) errors.date = 'Ingresa una fecha válida.';
    else if (values.date > todayISO()) errors.date = 'La fecha no puede ser futura.';
    else if (values.date.slice(0, 7) !== monthKey(state.activeMonth)) errors.date = 'La fecha debe pertenecer al mes seleccionado.';
    if (!values.amount || !Number.isFinite(amount) || amount <= 0) errors.amount = 'Ingresa un monto mayor que cero.';
    if (type === 'expenses' && !values.concept.trim()) errors.concept = 'El concepto es obligatorio.';
    clearFormErrors(form);
    if (Object.keys(errors).length) {
      Object.entries(errors).forEach(([field, message]) => {
        const input = form.elements[field];
        input?.classList.add('invalid');
        $(`[data-error="${field}"]`, form).textContent = message;
      });
      form.querySelector('.invalid')?.focus();
      return;
    }
    const collection = Storage.business(state.data)[type];
    const existing = collection.find(item => item.id === state.editingId);
    const record = {
      id: existing?.id || generateId(), date: values.date, amount: Math.round(amount * 100) / 100,
      note: values.note.trim(), createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    if (type === 'expenses') record.concept = values.concept.trim();
    if (existing) Object.assign(existing, record); else collection.push(record);
    if (!Storage.save(state.data)) { showToast('No fue posible guardar. Revisa el almacenamiento del navegador.', 'error'); return; }
    showToast(existing ? 'Registro actualizado correctamente.' : 'Registro guardado correctamente.');
    state.editingId = null; state.editingType = null;
    renderRecords(type);
  }

  function clearFormErrors(form) {
    $$('.invalid', form).forEach(input => input.classList.remove('invalid'));
    $$('.field-error', form).forEach(element => { element.textContent = ''; });
  }

  function editRecord(type, id) {
    state.editingId = id; state.editingType = type;
    renderRecords(type);
    $('#record-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function requestDelete(type, id) {
    state.pendingDelete = { type, id };
    $('#confirm-modal').classList.remove('is-hidden');
    $('#confirm-accept').focus();
  }

  function closeDeleteModal() {
    state.pendingDelete = null;
    $('#confirm-modal').classList.add('is-hidden');
  }

  function confirmDelete() {
    if (!state.pendingDelete) return;
    const { type, id } = state.pendingDelete;
    const collection = Storage.business(state.data)[type];
    const index = collection.findIndex(item => item.id === id);
    if (index >= 0) collection.splice(index, 1);
    if (state.editingId === id) { state.editingId = null; state.editingType = null; }
    if (Storage.save(state.data)) showToast('Registro eliminado.'); else showToast('No fue posible guardar el cambio.', 'error');
    closeDeleteModal();
    renderRecords(type);
  }

  function renderSettings() {
    $('#view-container').innerHTML = `
      <div class="settings-grid">
        <section class="panel settings-card"><h2>Información del negocio</h2><p><strong>${BUSINESS_NAME}</strong><br>Los datos de este entorno se almacenan localmente y están separados mediante el identificador <code>${BUSINESS_ID}</code>.</p></section>
        <section class="panel settings-card danger-zone">
          <div class="settings-row"><div><h2>Reiniciar datos del negocio</h2><p>Elimina permanentemente todas las ventas y gastos ingresados en este negocio.</p></div><button class="button button--danger-outline" id="start-reset" type="button">Reiniciar datos</button></div>
          <div class="reset-step is-hidden" id="reset-step">
            <div class="warning-box">${icons.warning}<span><strong>Esta acción no se puede deshacer.</strong><br>Todos los datos ingresados de ${BUSINESS_NAME} serán eliminados. La estructura de SAE y otros negocios no se modificarán.</span></div>
            <div class="reset-confirm field"><label for="reset-phrase">Escribe exactamente <code>BORRAR DATOS</code> para continuar</label><input id="reset-phrase" type="text" autocomplete="off" spellcheck="false"><span class="field-error"></span></div>
            <div class="form-actions"><button class="button button--danger" id="finish-reset" type="button" disabled>Eliminar todos los datos</button><button class="button button--ghost" id="cancel-reset" type="button">Cancelar</button></div>
          </div>
        </section>
      </div>`;
    $('#start-reset').addEventListener('click', () => { $('#reset-step').classList.remove('is-hidden'); $('#start-reset').disabled = true; $('#reset-phrase').focus(); });
    $('#reset-phrase').addEventListener('input', event => { $('#finish-reset').disabled = event.target.value !== 'BORRAR DATOS'; });
    $('#cancel-reset').addEventListener('click', renderSettings);
    $('#finish-reset').addEventListener('click', () => {
      if ($('#reset-phrase').value !== 'BORRAR DATOS') return;
      if (Storage.resetBusiness(state.data)) { showToast('Los datos del negocio fueron eliminados correctamente.'); renderSettings(); }
      else showToast('No fue posible reiniciar los datos.', 'error');
    });
  }

  function navigateMonth(delta) {
    const next = new Date(state.activeMonth.getFullYear(), state.activeMonth.getMonth() + delta, 1);
    if (next > currentMonth) return;
    state.activeMonth = next;
    state.editingId = null; state.editingType = null;
    render();
  }

  function init() {
    const splash = $('#splash');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(() => {
      splash.classList.add('is-finished');
      $('#hub').classList.remove('hub--waiting');
      window.setTimeout(() => splash.remove(), reducedMotion ? 20 : 570);
    }, reducedMotion ? 0 : 2250);
    $('#year').textContent = new Date().getFullYear();
    $('#enter-business').addEventListener('click', () => { $('#hub').classList.add('is-hidden'); $('#workspace').classList.remove('is-hidden'); state.activeMonth = new Date(currentMonth); setView('summary'); });
    $('#exit-business').addEventListener('click', () => { $('#workspace').classList.add('is-hidden'); $('#hub').classList.remove('is-hidden'); });
    $$('.nav-item[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
    $('#sidebar-toggle').addEventListener('click', () => {
      const collapsed = $('#sidebar').classList.toggle('collapsed');
      $('#sidebar-toggle').setAttribute('aria-label', collapsed ? 'Expandir barra lateral' : 'Contraer barra lateral');
      $('#sidebar-toggle').title = collapsed ? 'Expandir barra lateral' : 'Contraer barra lateral';
    });
    $('#month-prev').addEventListener('click', () => navigateMonth(-1));
    $('#month-next').addEventListener('click', () => navigateMonth(1));
    $('#confirm-cancel').addEventListener('click', closeDeleteModal);
    $('#confirm-accept').addEventListener('click', confirmDelete);
    $('#confirm-modal').addEventListener('click', event => { if (event.target === $('#confirm-modal')) closeDeleteModal(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('#confirm-modal').classList.contains('is-hidden')) closeDeleteModal(); });
  }

  init();
})();
