/* auth-client.js
   - Не блокирует страницу по умолчанию
   - Открывает модалку только по клику:
       [data-auth-open] (опц. data-auth-mode="login|register")
       [data-auth-required]
   - Экспортирует window.AuthClient: openLogin/openRegister/close/logout/getUser/requireAuth
*/
(() => {
  "use strict";

  const AUTH_STORAGE_KEY = "auth_cookie_consent_v1";

  const API = {
    me: "/api/auth/me",
    login: "/api/auth/login",
    register: "/api/auth/register",
    logout: "/api/auth/logout",
  };

  const root = ensureRoot();
  root.dataset.state = root.dataset.state || "closed";

  const state = {
    user: null,
    open: false,
    mode: "login", // login | register
    busy: false,
    lastError: "",
  };

  // ----- Public API -----
  window.AuthClient = {
    openLogin: () => open("login"),
    openRegister: () => open("register"),
    close,
    logout,
    getUser: () => state.user,
    requireAuth: async (opts = {}) => {
      if (state.user) return state.user;
      open(opts.mode || "login");
      throw new Error("AUTH_REQUIRED");
    },
    refresh: refreshMe,
  };

  // ----- Init -----
  installGlobalHandlers();
  maybeShowCookieBanner();
  refreshMe().catch(() => { /* silent */ });

  // ======================
  // Core UI
  // ======================
  function open(mode = "login") {
    state.mode = (mode === "register") ? "register" : "login";
    state.lastError = "";
    state.open = true;

    // показываем root
    root.dataset.state = "open";
    // блокируем скролл страницы только когда модалка открыта
    document.body.dataset.auth = "locked";

    render();
    focusFirstInput();
  }

  function close() {
    state.open = false;
    state.busy = false;
    state.lastError = "";

    root.dataset.state = "closed";
    root.innerHTML = "";
    document.body.removeAttribute("data-auth");
  }

  function render() {
    if (!state.open) return;

    const title = state.mode === "register" ? "Регистрация" : "Вход";
    const primaryText = state.mode === "register" ? "Создать аккаунт" : "Войти";
    const switchText = state.mode === "register" ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Регистрация";

    const userLine = state.user
      ? `<div class="auth-userline">Вы вошли как: <strong>${escapeHtml(state.user.username ?? state.user.user ?? "user")}</strong></div>`
      : `<div class="auth-userline">Вы не авторизованы.</div>`;

    root.innerHTML = `
      <div class="auth-wrap" role="presentation">
        <div class="auth-overlay" aria-hidden="false" data-auth-close></div>

        <div class="auth-modal" role="dialog" aria-modal="true" aria-label="${title}">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px;">
            <h2 class="auth-title" style="margin:0;">${title}</h2>
            <button class="auth-btn" type="button" data-auth-close aria-label="Закрыть">✕</button>
          </div>

          <div class="auth-footer" style="margin-top:0; margin-bottom:10px;">
            ${userLine}
          </div>

          <p class="auth-hint">Введите username/password. Можно зарегистрироваться.</p>

          <div class="auth-error" role="status" aria-live="polite">${escapeHtml(state.lastError || "")}</div>

          <form id="auth-form">
            <input class="auth-input" name="username" autocomplete="username" placeholder="Username" required />
            <input class="auth-input" name="password" type="password" autocomplete="${state.mode === "register" ? "new-password" : "current-password"}" placeholder="Password" required />

            <div class="auth-actions">
              <button class="auth-btn auth-btn--primary" type="submit" ${state.busy ? "disabled" : ""}>
                ${state.busy ? "Подождите..." : primaryText}
              </button>

              <button class="auth-btn" type="button" data-auth-switch ${state.busy ? "disabled" : ""}>
                ${switchText}
              </button>

              ${state.user ? `<button class="auth-btn" type="button" data-auth-logout ${state.busy ? "disabled" : ""}>Выйти</button>` : ""}
            </div>
          </form>
        </div>
      </div>
    `;

    const form = root.querySelector("#auth-form");
    form.addEventListener("submit", onSubmit);

    root.querySelectorAll("[data-auth-close]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        close();
      });
    });

    const sw = root.querySelector("[data-auth-switch]");
    if (sw) {
      sw.addEventListener("click", (e) => {
        e.preventDefault();
        state.mode = state.mode === "login" ? "register" : "login";
        state.lastError = "";
        render();
        focusFirstInput();
      });
    }

    const lo = root.querySelector("[data-auth-logout]");
    if (lo) lo.addEventListener("click", (e) => { e.preventDefault(); logout(); });
  }

  function focusFirstInput() {
    queueMicrotask(() => {
      const inp = root.querySelector('input[name="username"]');
      if (inp) inp.focus();
    });
  }

  // ======================
  // Auth logic
  // ======================
  async function onSubmit(e) {
    e.preventDefault();
    if (state.busy) return;

    const form = e.currentTarget;
    const fd = new FormData(form);
    const username = String(fd.get("username") || "").trim();
    const password = String(fd.get("password") || "");

    if (!username || !password) {
      setError("Введите username и password.");
      return;
    }

    state.busy = true;
    setError("");
    render(); // чтобы обновить disabled/текст кнопки

    try {
      if (state.mode === "register") {
        await postJson(API.register, { username, password });
      } else {
        await postJson(API.login, { username, password });
      }

      await refreshMe(); // подтянуть user после логина/регистрации

      // Если бек не отдал /me — всё равно закрываем модалку (чтобы не блокировать UX)
      close();
    } catch (err) {
      setError(normalizeErr(err));
      state.busy = false;
      render();
    }
  }

  async function refreshMe() {
    try {
      const me = await getJson(API.me);
      // ожидаем { ok: true, user: {...} } или просто {...}
      const user = me?.user ?? me?.doc ?? me;
      state.user = user && (typeof user === "object") ? user : null;
    } catch {
      state.user = null;
    } finally {
      emitAuthChange();
    }
    return state.user;
  }

  async function logout() {
    if (state.busy) return;
    state.busy = true;
    setError("");
    render();

    try {
      await postJson(API.logout, {});
    } catch {
      // даже если бек не умеет logout — локально считаем, что “вышли”
    } finally {
      state.user = null;
      state.busy = false;
      emitAuthChange();
      render();
      close();
    }
  }

  function setError(msg) {
    state.lastError = String(msg || "");
    const el = root.querySelector(".auth-error");
    if (el) el.textContent = state.lastError;
  }

  function emitAuthChange() {
    window.dispatchEvent(new CustomEvent("auth:change", { detail: { user: state.user } }));
  }

  // ======================
  // Click/keyboard wiring
  // ======================
  function installGlobalHandlers() {
    // Открытие по клику
    document.addEventListener("click", (e) => {
      const openBtn = e.target.closest("[data-auth-open]");
      if (openBtn) {
        e.preventDefault();
        open(openBtn.getAttribute("data-auth-mode") || "login");
        return;
      }

      const req = e.target.closest("[data-auth-required]");
      if (req && !state.user) {
        e.preventDefault();
        open("login");
      }
    }, { capture: true });

    // ESC закрывает модалку
    document.addEventListener("keydown", (e) => {
      if (!state.open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    });
  }

  // ======================
  // Cookie banner (optional)
  // ======================
  function maybeShowCookieBanner() {
    try {
      const ok = localStorage.getItem(AUTH_STORAGE_KEY) === "1";
      if (ok) return;
    } catch {
      // если localStorage запрещён — просто не показываем
      return;
    }

    // Баннер не должен мешать — и он не должен требовать логина
    const banner = document.createElement("div");
    banner.className = "cookie-banner";
    banner.innerHTML = `
      <div class="cookie-banner__text">
        Этот сайт использует cookie/локальное хранилище для авторизации и настроек.
      </div>
      <div class="cookie-banner__actions">
        <button type="button" class="cookie-btn" data-cookie-accept>OK</button>
      </div>
    `;

    // Важно: баннер в #auth-root, но без открытия модалки
    root.appendChild(banner);

    banner.querySelector("[data-cookie-accept]").addEventListener("click", () => {
      try { localStorage.setItem(AUTH_STORAGE_KEY, "1"); } catch {}
      banner.remove();
    });
  }

  // ======================
  // Network helpers
  // ======================
  async function getJson(url) {
    const r = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: { "Accept": "application/json" },
    });
    return await handleJson(r);
  }

  async function postJson(url, body) {
    const r = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    return await handleJson(r);
  }

  async function handleJson(r) {
    let data = null;
    try { data = await r.json(); } catch {}
    if (!r.ok) {
      const msg = data?.error || data?.message || `HTTP ${r.status}`;
      throw new Error(msg);
    }
    return data;
  }

  function normalizeErr(err) {
    const s = String(err?.message || err || "Ошибка");
    // частый кейс: эндпоинтов нет
    if (s.includes("404")) return "Auth API не найден (404). Логин отключён на бэкенде.";
    return s;
  }

  // ======================
  // DOM helpers
  // ======================
  function ensureRoot() {
    let el = document.getElementById("auth-root");
    if (!el) {
      el = document.createElement("div");
      el.id = "auth-root";
      document.body.appendChild(el);
    }
    return el;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
})();
