(function () {
  'use strict';

  const cfg = window.SURVEY_CONFIG;
  if (!cfg) { document.body.innerHTML = '<p style="padding:2rem">配置加载失败，请刷新</p>'; return; }

  const singleMap = Object.fromEntries(cfg.single.map(function (q) { return [q.key, q]; }));
  const multiQ = cfg.multi;
  const matrix = cfg.matrix;

  let token = sessionStorage.getItem('hip_admin_token') || '';
  let page = 1;
  const size = 20;
  let total = 0;

  const $ = function (s) { return document.querySelector(s); };
  const esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  const labelOf = function (q, v) {
    const o = q.options.find(function (x) { return x.value === Number(v); });
    return o ? o.label : '-';
  };
  const fmtTime = function (s) {
    if (!s) return '-';
    const d = new Date(s);
    return isNaN(d.getTime()) ? String(s) : d.toLocaleString('zh-CN', { hour12: false });
  };
  const json = function (v) {
    if (v == null) return null;
    try { return typeof v === 'string' ? JSON.parse(v) : v; } catch (e) { return null; }
  };
  const surveyNo = function (r) {
    const d = new Date(r.created_at || Date.now());
    const ymd = String(d.getFullYear()) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    return 'WY' + ymd + '-' + String(r.id).padStart(4, '0');
  };

  async function api(path, opts) {
    opts = opts || {};
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const r = await fetch((window.API_BASE || '') + path, Object.assign({}, opts, { headers: Object.assign(headers, opts.headers || {}) }));
    if (r.status === 401) { showLogin(); throw new Error('登录已过期，请重新登录'); }
    const d = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(d.error || '请求失败');
    return d;
  }

  function showLogin() {
    $('#appView').hidden = true;
    $('#loginView').hidden = false;
    token = '';
    sessionStorage.removeItem('hip_admin_token');
  }
  function showApp() {
    $('#loginView').hidden = true;
    $('#appView').hidden = false;
  }

  $('#loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    $('#loginErr').textContent = '';
    try {
      const d = await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ password: $('#password').value })
      });
      token = d.token;
      sessionStorage.setItem('hip_admin_token', token);
      showApp();
      page = 1;
      await loadAll();
    } catch (err) {
      $('#loginErr').textContent = err.message;
    }
  });

  $('#logoutBtn').addEventListener('click', showLogin);

  async function loadAll() {
    await Promise.all([loadStats(), loadList()]);
  }

  async function loadStats() {
    const d = await api('/api/admin/stats');
    const s = d.stats;
    $('#totalLabel').textContent = '共 ' + s.total + ' 份';

    const groups = [
      { title: 'Q1 ' + cfg.single[0].title, data: s.pain, q: cfg.single[0] },
      { title: 'Q2 ' + cfg.single[1].title, data: s.flexion, q: cfg.single[1] },
      { title: 'Q3 ' + cfg.single[2].title, data: s.abduction, q: cfg.single[2] },
      { title: 'Q4 ' + cfg.single[3].title, data: s.steps, q: cfg.single[3] },
      { title: 'Q5 ' + multiQ.title, data: s.conditions, q: multiQ },
      { title: 'Q6 ' + cfg.single[4].title, data: s.walking, q: cfg.single[4] }
    ];
    matrix.rows.forEach(function (r) {
      groups.push({ title: 'Q7 ' + r.label, data: s.actions[r.key] || {}, q: { options: matrix.columns } });
    });

    $('#stats').innerHTML = groups.map(function (g) {
      const sum = Object.values(g.data).reduce(function (a, b) { return a + b; }, 0) || 1;
      const bars = g.q.options.map(function (o) {
        const n = g.data[o.value] || 0;
        const pct = Math.round(n / sum * 100);
        return '<div class="bar-row"><span class="name" title="' + esc(o.label) + '">' + esc(o.label) +
          '</span><span class="bar"><i style="width:' + pct + '%"></i></span><span class="num">' + n + '</span></div>';
      }).join('');
      return '<div class="stat-box"><h3>' + esc(g.title) + '</h3>' + bars + '</div>';
    }).join('');
  }

  async function loadList() {
    const params = new URLSearchParams({
      page: page,
      size: size,
      keyword: $('#keyword').value.trim(),
      start: $('#start').value,
      end: $('#end').value
    });
    const d = await api('/api/admin/surveys?' + params.toString());
    total = d.total;

    const colLabels = { options: matrix.columns };
    $('#rows').innerHTML = d.rows.map(function (r) {
      const acts = json(r.daily_actions) || {};
      const actSummary = matrix.rows.map(function (row) {
        const o = matrix.columns.find(function (c) { return c.value === Number(acts[row.key]); });
        return row.label.slice(0, 2) + ':' + (o ? o.label : '-');
      }).join(' / ');
      const conds = (json(r.conditions) || []).map(function (v) { return labelOf(multiQ, v); }).join('、') || '-';
      return '<tr>' +
        '<td>' + esc(surveyNo(r)) + '</td>' +
        '<td>' + fmtTime(r.created_at) + '</td>' +
        '<td>' + esc(r.patient_name || '-') + '</td>' +
        '<td>' + esc(labelOf(singleMap.pain, r.pain_level)) + '</td>' +
        '<td>' + esc(labelOf(singleMap.flexion, r.flexion_ability)) + '</td>' +
        '<td>' + esc(labelOf(singleMap.abduction, r.abduction_ability)) + '</td>' +
        '<td>' + esc(labelOf(singleMap.steps, r.daily_steps)) + '</td>' +
        '<td>' + esc(conds) + '</td>' +
        '<td>' + esc(labelOf(singleMap.walking, r.walking_ability)) + '</td>' +
        '<td>' + esc(actSummary) + '</td>' +
        '<td>' + esc(r.ip || '-') + '</td>' +
        '<td><button class="btn ghost small" data-id="' + r.id + '">详情</button></td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="12" class="muted" style="text-align:center;padding:30px">暂无数据</td></tr>';

    const pages = Math.max(1, Math.ceil(total / size));
    $('#pageInfo').textContent = '第 ' + d.page + ' / ' + pages + ' 页（共 ' + total + ' 条）';
    $('#prevBtn').disabled = page <= 1;
    $('#nextBtn').disabled = page >= pages;

    $('#rows').querySelectorAll('button[data-id]').forEach(function (b) {
      b.addEventListener('click', function () { openDetail(b.dataset.id); });
    });
  }

  async function openDetail(id) {
    const d = await api('/api/admin/surveys/' + encodeURIComponent(id));
    const r = d.row;
    const acts = json(r.daily_actions) || {};
    const rows = [
      ['问卷编号', surveyNo(r)],
      ['提交时间', fmtTime(r.created_at)],
      ['姓名', r.patient_name || '-'],
      ['IP', r.ip || '-']
    ];
    cfg.single.forEach(function (q) { rows.push([q.no + ' ' + q.title, labelOf(q, r[q.column])]); });
    rows.push([multiQ.no + ' ' + multiQ.title, (json(r.conditions) || []).map(function (v) {
      return labelOf(multiQ, v);
    }).join('、') || '-']);
    matrix.rows.forEach(function (row) {
      rows.push(['日常动作 · ' + row.label, labelOf({ options: matrix.columns }, acts[row.key])]);
    });

    $('#detailId').textContent = surveyNo(r);
    $('#detailBody').innerHTML = rows.map(function (p) {
      return '<div class="detail-row"><b>' + esc(p[0]) + '</b><br>' + esc(p[1]) + '</div>';
    }).join('');
    $('#detailModal').hidden = false;
  }

  $('#queryBtn').addEventListener('click', function () { page = 1; loadList(); });
  $('#resetBtn').addEventListener('click', function () {
    $('#keyword').value = '';
    $('#start').value = '';
    $('#end').value = '';
    page = 1;
    loadList();
  });
  $('#refreshBtn').addEventListener('click', loadStats);
  $('#prevBtn').addEventListener('click', function () { if (page > 1) { page--; loadList(); } });
  $('#nextBtn').addEventListener('click', function () {
    if (page < Math.ceil(total / size)) { page++; loadList(); }
  });
  $('#closeModal').addEventListener('click', function () { $('#detailModal').hidden = true; });
  $('#detailModal').addEventListener('click', function (e) {
    if (e.target === this) this.hidden = true;
  });

  $('#exportBtn').addEventListener('click', async function () {
    try {
      const r = await fetch((window.API_BASE || '') + '/api/admin/export.csv', { headers: { Authorization: 'Bearer ' + token } });
      if (r.status === 401) { showLogin(); return; }
      if (!r.ok) throw new Error('导出失败');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'survey-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message);
    }
  });

  (async function init() {
    if (token) {
      try { await api('/api/admin/stats'); showApp(); await loadAll(); }
      catch (e) { showLogin(); }
    } else {
      showLogin();
    }
  })();
})();
