/* «Графік чергувань» — мінімальний клієнт Supabase (вхід, сеанс, REST, RPC, функції).
   Публічний ключ безпечно вбудовувати: доступ до даних визначають правила на сервері. */
// Android: застосунок дає window.AndroidHost → загортаємо в той самий інтерфейс, що й у програмі для Windows
if (window.AndroidHost && !window.grafikHost) {
  window.grafikHost = {
    platform: 'android',
    version: window.AndroidHost.version(),
    saveFile: function (name, data, type) { window.AndroidHost.saveFile(name, type || '', String(data)); return true; },
    checkUpdate: function (manual) { window.AndroidHost.checkUpdate(!!manual); },
    print: function () { window.AndroidHost.print(); }
  };
}
(function () {
  'use strict';
  var URL = 'https://hcmfiyjjvgpyegjdozms.supabase.co';
  var KEY = 'sb_publishable_2RBjlZ8YcLZwABllM2t8bg_HR7yjnkQ';
  var DOMAIN = 'grafik.local';
  var SKEY = 'grafik-session';
  var ses = null;
  try { ses = JSON.parse(localStorage.getItem(SKEY)); } catch (e) { ses = null; }

  function store(s) {
    ses = s;
    try { if (s) localStorage.setItem(SKEY, JSON.stringify(s)); else localStorage.removeItem(SKEY); } catch (e) {}
  }
  function mkErr(status, body) {
    var code = body && (body.error_code || body.code || body.error) || ('http_' + status);
    var e = new Error(String((body && (body.msg || body.message || body.error_description)) || code));
    e.status = status; e.code = code; e.body = body;
    return e;
  }
  function call(method, path, body, headers) {
    var h = Object.assign({ apikey: KEY }, headers || {});
    if (body !== undefined) h['Content-Type'] = 'application/json';
    return fetch(URL + path, { method: method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) })
      .then(function (r) {
        return r.text().then(function (t) {
          var d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = t; }
          if (!r.ok) throw mkErr(r.status, d);
          return d;
        });
      }, function () { var e = new Error('offline'); e.code = 'offline'; throw e; });
  }
  function keep(d) {
    store({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at || (Math.floor(Date.now() / 1000) + (d.expires_in || 3600)), user: { id: d.user && d.user.id } });
    return ses;
  }
  var refreshing = null;
  function refresh() {
    if (!ses || !ses.refresh_token) return Promise.reject(mkErr(401, { code: 'not_signed_in' }));
    if (refreshing) return refreshing;
    refreshing = call('POST', '/auth/v1/token?grant_type=refresh_token', { refresh_token: ses.refresh_token })
      .then(keep, function (e) { if (e.code !== 'offline') store(null); throw e; })
      .then(function (s) { refreshing = null; return s; }, function (e) { refreshing = null; throw e; });
    return refreshing;
  }
  function token() {
    if (!ses) return Promise.reject(mkErr(401, { code: 'not_signed_in' }));
    if (ses.expires_at * 1000 - Date.now() > 60000) return Promise.resolve(ses.access_token);
    return refresh().then(function (s) { return s.access_token; });
  }
  function authed(method, path, body, headers) {
    return token().then(function (t) {
      return call(method, path, body, Object.assign({ Authorization: 'Bearer ' + t }, headers || {}));
    }).then(null, function (e) {
      // token rejected (e.g. revoked) → one refresh attempt
      if (e.status === 401 && ses) return refresh().then(function (s) { return call(method, path, body, Object.assign({ Authorization: 'Bearer ' + s.access_token }, headers || {})); });
      throw e;
    });
  }

  window.SB = {
    url: URL,
    session: function () { return ses; },
    userId: function () { return ses && ses.user && ses.user.id; },
    signIn: function (username, password) {
      var u = String(username || '').trim().toLowerCase();
      return call('POST', '/auth/v1/token?grant_type=password', { email: u + '@' + DOMAIN, password: password }).then(keep);
    },
    signOut: function () {
      var t = ses && ses.access_token; store(null);
      if (t) call('POST', '/auth/v1/logout', {}, { Authorization: 'Bearer ' + t }).then(null, function () {});
      return Promise.resolve();
    },
    setPassword: function (pw) { return authed('PUT', '/auth/v1/user', { password: pw }); },
    // GET /rest/v1/<path>
    select: function (path) { return authed('GET', '/rest/v1/' + path); },
    upsert: function (table, row) { return authed('POST', '/rest/v1/' + table, row, { Prefer: 'resolution=merge-duplicates,return=minimal' }); },
    update: function (path, patch) { return authed('PATCH', '/rest/v1/' + path, patch, { Prefer: 'return=minimal' }); },
    rpc: function (fn, args) { return authed('POST', '/rest/v1/rpc/' + fn, args || {}); },
    fn: function (name, body) { return authed('POST', '/functions/v1/' + name, body || {}); },
    // readable without login (min version, maintenance)
    config: function () { return call('GET', '/rest/v1/app_config?select=min_version,latest_version,maintenance,message'); }
  };
})();
