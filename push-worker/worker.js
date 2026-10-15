// 整理券の「画面を閉じていても届く通知」を送るための、小さなサーバー（Cloudflare Workers の無料枠で動く）
// 本文のない Web Push を送る。通知の文面は、端末側の sw.js が Firestore を読んで作る。
// 設定する値（Cloudflare の「変数とシークレット」）：
//   VAPID_PRIVATE_JWK（シークレット）… docs/keygen.html で作った秘密鍵
//   VAPID_SUBJECT（任意）… 連絡先の URL か mailto:（未設定なら下の既定値）
const PROJECT_ID = 'seiriken-fcb62';
const API_KEY = 'AIzaSyCVDvzuuHMzRoVd87GVPE_Vglqe9adgClY'; // 公開されて問題ない値（Firebase のウェブ用キー）
const DEFAULT_SUBJECT = 'https://cain218.github.io/seiriken/';

const b64u = {
  enc: bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: str => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(str.length / 4) * 4, '=')), c => c.charCodeAt(0))
};
const te = new TextEncoder();

function publicKeyOf(jwk) {
  const raw = new Uint8Array(65); raw[0] = 4; raw.set(b64u.dec(jwk.x), 1); raw.set(b64u.dec(jwk.y), 33);
  return b64u.enc(raw);
}

async function vapidHeader(jwk, endpoint, subject) {
  const aud = new URL(endpoint).origin;
  const head = b64u.enc(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u.enc(te.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(head + '.' + body));
  return `vapid t=${head}.${body}.${b64u.enc(sig)}, k=${publicKeyOf(jwk)}`;
}

async function getDoc(path) {
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}?key=${API_KEY}`);
  if (!r.ok) return null;
  const d = await r.json();
  const out = {};
  for (const [k, v] of Object.entries(d.fields || {})) out[k] = v.stringValue ?? v.integerValue ?? v.booleanValue ?? null;
  return out;
}

export default {
  async fetch(req, env) {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' };
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'content-type': 'application/json' } });
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(req.url);
    let jwk;
    try { jwk = JSON.parse(env.VAPID_PRIVATE_JWK); } catch (e) { return json({ ok: false, error: 'VAPID_PRIVATE_JWK が設定されていません' }, 500); }

    // 端末が購読するときに使う公開鍵
    if (url.pathname === '/vapid') return new Response(publicKeyOf(jwk), { headers: { ...cors, 'content-type': 'text/plain' } });

    // 通知を送る：{ ticketId } を受け取り、その整理券の端末に空のプッシュを送る
    if (url.pathname === '/notify' && req.method === 'POST') {
      let ticketId = '';
      try { ticketId = String((await req.json()).ticketId || ''); } catch (e) {}
      if (!/^[A-Za-z0-9]{10,40}$/.test(ticketId)) return json({ ok: false, error: 'bad ticketId' }, 400);
      const t = await getDoc('tickets/' + ticketId);
      if (!t || !['waiting', 'called'].includes(t.status)) return json({ ok: false, error: 'not active' });
      const sub = await getDoc('pushSubs/' + ticketId);
      if (!sub || !sub.endpoint) return json({ ok: false, error: 'no subscription' });
      let res;
      try {
        res = await fetch(sub.endpoint, { method: 'POST', headers: { Authorization: await vapidHeader(jwk, sub.endpoint, env.VAPID_SUBJECT || DEFAULT_SUBJECT), TTL: '600', Urgency: 'high' } });
      } catch (e) { return json({ ok: false, error: 'push service unreachable' }, 502); }
      return json({ ok: res.status >= 200 && res.status < 300, status: res.status });
    }
    return json({ ok: true, name: 'seiriken-push' });
  }
};
