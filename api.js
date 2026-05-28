/* PortfolioPulse API Client */
const API = {
  getToken() {
    return sessionStorage.getItem('auth_token');
  },
  setToken(token) {
    if (token) sessionStorage.setItem('auth_token', token);
    else sessionStorage.removeItem('auth_token');
  },
  async request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const opts = { method, headers };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `שגיאת שרת (${res.status})`);
    return data;
  },
  login(email, password) {
    return this.request('POST', '/api/auth/login', { email, password });
  },
  register(payload) {
    return this.request('POST', '/api/auth/register', payload);
  },
  me() {
    return this.request('GET', '/api/auth/me');
  },
  sync() {
    return this.request('GET', '/api/sync');
  },
  createTransaction(tx) {
    return this.request('POST', '/api/transactions', tx);
  },
  getTips() {
    return this.request('GET', '/api/tips');
  },
  createTip(ticker, content, recommender = 'avi', target_user_id = null) {
    return this.request('POST', '/api/tips', { ticker, content, recommender, target_user_id });
  },
  deleteTip(id) {
    return this.request('DELETE', `/api/tips/${id}`);
  },
  marketChart(ticker) {
    return this.request('GET', `/api/market/chart/${encodeURIComponent(ticker)}`);
  },
  marketPrices(tickers) {
    const q = tickers.join(',');
    return this.request('GET', `/api/market/prices?tickers=${encodeURIComponent(q)}`);
  },
  marketSearch(term) {
    return this.request('GET', `/api/market/search?q=${encodeURIComponent(term)}`);
  }
};
