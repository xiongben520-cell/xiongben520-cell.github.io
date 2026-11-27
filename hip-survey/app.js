(function () {
  'use strict';

  const cfg = window.SURVEY_CONFIG;
  if (!cfg) {
    document.body.innerHTML = '<p style="padding:2rem;text-align:center">配置加载失败，请刷新页面重试</p>';
    return;
  }

  const form = document.getElementById('surveyForm');
  const box = document.getElementById('questions');
  const validators = [];

  function make(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  document.getElementById('hospital').textContent = cfg.meta.hospital;
  document.getElementById('center').textContent = cfg.meta.center;
  document.getElementById('title').textContent = cfg.meta.title;
  document.getElementById('subtitle').textContent = cfg.meta.subtitle;
  document.getElementById('footer').textContent = cfg.meta.footer;

  function section(no, title, note) {
    const sec = make('section', 'qsection');
    const head = make('div', 'qhead');
    if (no) head.append(make('span', 'qno', no));
    head.append(make('span', 'qtitle', title));
    if (note) head.append(make('span', 'qnote', note));
    sec.append(head);
    box.append(sec);
    return sec;
  }

  function attachError(sec, msg) {
    let e = sec.querySelector('.qerror');
    if (!e) { e = make('div', 'qerror'); sec.append(e); }
    e.textContent = msg || '';
    sec.classList.toggle('invalid', !!msg);
  }

  const letter = function (i) { return String.fromCharCode(65 + i) + '.'; };

  function renderSingle(q) {
    const sec = section(q.no, q.title);
    const list = make('div', 'options');
    q.options.forEach(function (o, i) {
      const lab = make('label', 'option');
      const input = make('input');
      input.type = 'radio';
      input.name = q.key;
      input.value = String(o.value);
      lab.append(input, make('span', 'opt-letter', letter(i)), make('span', 'box'), make('span', 'olabel', o.label));
      list.append(lab);
    });
    sec.append(list);
    validators.push(function () {
      if (!form.querySelector('input[name="' + q.key + '"]:checked')) {
        attachError(sec, '请选择「' + q.title + '」');
        return false;
      }
      attachError(sec, '');
      return true;
    });
  }

  function renderMulti(q) {
    const sec = section(q.no, q.title, q.note);
    const grid = make('div', 'options multi');
    q.options.forEach(function (o, i) {
      const lab = make('label', 'option');
      const input = make('input');
      input.type = 'checkbox';
      input.name = q.key;
      input.value = String(o.value);
      lab.append(input, make('span', 'opt-letter', letter(i)), make('span', 'box'), make('span', 'olabel', o.label));
      grid.append(lab);
    });
    sec.append(grid);

    const get = function (v) { return grid.querySelector('input[value="' + v + '"]'); };
    q.options.forEach(function (o) {
      if (o.value === q.exclusiveValue) return;
      const cb = get(o.value);
      cb.addEventListener('change', function () {
        if (cb.checked) { const ex = get(q.exclusiveValue); if (ex) ex.checked = false; }
      });
    });
    const ex = get(q.exclusiveValue);
    if (ex) ex.addEventListener('change', function () {
      if (!ex.checked) return;
      q.options.forEach(function (o) {
        if (o.value !== q.exclusiveValue) { const c = get(o.value); if (c) c.checked = false; }
      });
    });

    validators.push(function () {
      if (!grid.querySelector('input:checked')) {
        attachError(sec, '请至少选择一项');
        return false;
      }
      attachError(sec, '');
      return true;
    });
  }

  function renderMatrix(q) {
    const sec = section(null, q.title);
    const wrap = make('div', 'matrix-scroll');
    const table = make('table', 'matrix');

    const thead = make('thead');
    const trh = make('tr');
    trh.append(make('th', 'rowhead', '日常动作'));
    q.columns.forEach(function (c) { trh.append(make('th', 'colhead', c.label)); });
    thead.append(trh);
    table.append(thead);

    const tbody = make('tbody');
    q.rows.forEach(function (r, ri) {
      const tr = make('tr');
      tr.append(make('th', 'rowhead', (ri + 1) + '. ' + r.label));
      q.columns.forEach(function (c, ci) {
        const td = make('td');
        const lab = make('label', 'cell');
        const input = make('input');
        input.type = 'radio';
        input.name = 'action_' + r.key;
        input.value = String(c.value);
        lab.append(input, make('span', 'cell-letter', letter(ci).slice(0, 1)));
        td.append(lab);
        tr.append(td);
      });
      tbody.append(tr);
    });
    table.append(tbody);

    if (q.notes && q.notes.length) {
      const tfoot = make('tfoot');
      const trf = make('tr');
      trf.append(make('th', 'rowhead', ''));
      q.notes.forEach(function (n) { trf.append(make('td', '', n)); });
      tfoot.append(trf);
      table.append(tfoot);
    }

    wrap.append(table);
    sec.append(wrap);
    validators.push(function () {
      const missing = q.rows.filter(function (r) {
        return !form.querySelector('input[name="action_' + r.key + '"]:checked');
      });
      if (missing.length) {
        attachError(sec, '请完成：' + missing.map(function (r) { return r.label; }).join('、'));
        return false;
      }
      attachError(sec, '');
      return true;
    });
  }

  // 按图片顺序渲染：单选 Q1-4 -> 多选 Q5 -> 单选 Q6 -> 矩阵 Q7
  const blocks = [];
  cfg.single.forEach(function (q) { blocks.push({ order: q.order, fn: function () { renderSingle(q); } }); });
  blocks.push({ order: cfg.multi.order, fn: function () { renderMulti(cfg.multi); } });
  blocks.push({ order: cfg.matrix.order, fn: function () { renderMatrix(cfg.matrix); } });
  blocks.sort(function (a, b) { return a.order - b.order; }).forEach(function (b) { b.fn(); });

  const overlay = document.getElementById('overlay');
  const infoOverlay = document.getElementById('infoOverlay');
  const infoForm = document.getElementById('infoForm');
  const infoErr = document.getElementById('infoErr');
  let pendingPayload = null;

  function surveyNo(id) {
    const d = new Date();
    const ymd = String(d.getFullYear()) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    return 'WY' + ymd + '-' + String(id).padStart(4, '0');
  }

  document.getElementById('infoCancel').addEventListener('click', function () {
    infoOverlay.hidden = true;
  });

  document.getElementById('againBtn').addEventListener('click', function () {
    form.reset();
    infoForm.reset();
    infoErr.textContent = '';
    box.querySelectorAll('.qsection').forEach(function (s) { s.classList.remove('invalid'); });
    box.querySelectorAll('.qerror').forEach(function (e) { e.textContent = ''; });
    infoOverlay.hidden = true;
    overlay.hidden = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // 第一步：校验问卷答案后，弹出姓名/电话填写框
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const results = validators.map(function (fn) { return fn(); });
    if (results.indexOf(false) !== -1) {
      const bad = box.querySelector('.qsection.invalid');
      if (bad) bad.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const val = function (key) {
      return Number(form.querySelector('input[name="' + key + '"]:checked').value);
    };
    pendingPayload = {
      pain: val('pain'),
      flexion: val('flexion'),
      abduction: val('abduction'),
      steps: val('steps'),
      walking: val('walking'),
      conditions: Array.prototype.map.call(
        form.querySelectorAll('input[name="conditions"]:checked'),
        function (i) { return Number(i.value); }
      ),
      actions: {}
    };
    cfg.matrix.rows.forEach(function (r) { pendingPayload.actions[r.key] = val('action_' + r.key); });

    infoOverlay.hidden = false;
    document.getElementById('patientName').focus();
  });

  // 第二步：姓名电话随问卷一起提交
  infoForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    infoErr.textContent = '';
    if (!pendingPayload) return;

    const name = document.getElementById('patientName').value.trim();
    if (!name) { infoErr.textContent = '请填写姓名'; return; }

    const payload = Object.assign({}, pendingPayload, { name: name });
    const btn = document.getElementById('infoConfirm');
    btn.disabled = true;
    btn.textContent = '提交中…';
    try {
      const res = await fetch((window.API_BASE || '') + '/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || '提交失败');
      document.getElementById('surveyNo').textContent = surveyNo(data.id);
      infoOverlay.hidden = true;
      overlay.hidden = false;
    } catch (err) {
      infoErr.textContent = '提交失败：' + err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = '确认提交';
    }
  });
})();
