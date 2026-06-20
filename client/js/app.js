// =====================================================================
// SmartSub — фронтенд, подключённый к реальному бэкенду SmartSub.Api
// =====================================================================

const API = window.API_BASE_URL || "http://localhost:5000";

// ---------- Справочники: маппинг enum-значений бэкенда <-> русский текст ----------

const CATEGORY_LABELS = {
  Music: "Музыка",
  Movies: "Кино",
  Work: "Работа",
  Security: "Безопасность",
  Cloud: "Облако",
  Other: "Другое"
};

const PERIOD_LABELS = {
  Monthly: "/мес",
  Quarterly: "/3 мес",
  Yearly: "/год"
};

// Цвет иконки подбирается по первой букве названия — стабильно и без доп. данных от API
const ICON_COLORS = ["#7A9CB3", "#AD7556", "#53443D", "#1D9E75", "#D85A30", "#6a89a0"];
function colorForName(name) {
  const code = name.charCodeAt(0) || 0;
  return ICON_COLORS[code % ICON_COLORS.length];
}

// ---------- Состояние ----------

let subs = [];       // текущий список подписок с сервера (уже отфильтрованный)
let authToken = localStorage.getItem("smartsub_token") || null;
let currentUser = null;
let currentProfile = null; // данные профиля с /api/profile (включая DefaultNotifyDaysBefore)

// =====================================================================
// Авторизация
// =====================================================================

function switchAuthTab(tab) {
  const isLogin = tab === "login";
  document.getElementById("tabLogin").classList.toggle("active", isLogin);
  document.getElementById("tabRegister").classList.toggle("active", !isLogin);
  document.getElementById("loginForm").style.display = isLogin ? "block" : "none";
  document.getElementById("registerForm").style.display = isLogin ? "none" : "block";
  hideAuthError();
}

function showAuthError(message) {
  const el = document.getElementById("authError");
  el.textContent = message;
  el.style.display = "block";
}

function hideAuthError() {
  document.getElementById("authError").style.display = "none";
}

async function register() {
  const displayName = document.getElementById("regName").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value;

  if (!email || !password) {
    showAuthError("Заполните email и пароль");
    return;
  }
  if (password.length < 6) {
    showAuthError("Пароль должен быть не короче 6 символов");
    return;
  }

  try {
    const res = await fetch(`${API}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName })
    });

    if (!res.ok) {
      const err = await safeJson(res);
      showAuthError(err?.error || "Не удалось зарегистрироваться");
      return;
    }

    const data = await res.json();
    onAuthSuccess(data);
  } catch (e) {
    showAuthError("Сервер недоступен. Проверьте, что бэкенд запущен (dotnet run).");
  }
}

async function login() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (!email || !password) {
    showAuthError("Введите email и пароль");
    return;
  }

  try {
    const res = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    if (!res.ok) {
      showAuthError(res.status === 401 ? "Неверный email или пароль" : "Ошибка входа");
      return;
    }

    const data = await res.json();
    onAuthSuccess(data);
  } catch (e) {
    showAuthError("Сервер недоступен. Проверьте, что бэкенд запущен (dotnet run).");
  }
}

function onAuthSuccess(data) {
  authToken = data.token;
  currentUser = { email: data.email, displayName: data.displayName };
  localStorage.setItem("smartsub_token", authToken);
  localStorage.setItem("smartsub_user", JSON.stringify(currentUser));
  showApp();
}

function logout() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem("smartsub_token");
  localStorage.removeItem("smartsub_user");
  showAuth();
}

function showApp() {
  document.getElementById("authWrap").style.display = "none";
  document.getElementById("appRoot").style.display = "block";
  document.getElementById("navUserName").textContent = currentUser?.displayName
    ? `Привет, ${currentUser.displayName}!`
    : "Привет!";
  loadDashboard();
  loadProfile(); // подгружаем заранее, чтобы defaultNotifyDaysBefore был доступен при открытии модалки
}

function showAuth() {
  document.getElementById("authWrap").style.display = "flex";
  document.getElementById("appRoot").style.display = "none";
  hideAuthError();
}

// ---------- Навигация между страницами (Дашборд / Аналитика / Профиль) ----------

function switchPage(page) {
  document.querySelectorAll(".page").forEach((el) => el.classList.remove("active"));
  document.querySelectorAll(".nav-links li").forEach((el) => el.classList.remove("active"));

  document.getElementById(`page${capitalize(page)}`).classList.add("active");
  document.querySelector(`.nav-links li[data-page="${page}"]`).classList.add("active");

  if (page === "dashboard") loadDashboard();
  if (page === "analytics") loadAnalytics();
  if (page === "profile") loadProfile();
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ---------- Обёртка для авторизованных запросов ----------

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${authToken}`,
      ...(options.headers || {})
    }
  });

  if (res.status === 401) {
    // токен истёк или недействителен — выкидываем на экран входа
    logout();
    throw new Error("Сессия истекла, войдите снова");
  }

  return res;
}

async function safeJson(res) {
  try { return await res.json(); } catch { return null; }
}

// =====================================================================
// Загрузка дашборда (статистика + подписки)
// =====================================================================

async function loadDashboard() {
  await Promise.all([loadStats(), filterSubs()]);
}

async function loadStats() {
  try {
    const res = await apiFetch("/api/stats");
    if (!res.ok) return;
    const stats = await res.json();

    document.getElementById("statMonthly").textContent = formatMoney(stats.monthlyTotal);
    document.getElementById("statCount").textContent = `${stats.activeSubscriptionsCount} активных подписок`;

    document.getElementById("statYearly").textContent = formatMoney(stats.yearlyForecast);
    document.getElementById("statAverage").textContent = `Среднее ${formatMoney(stats.monthlyTotal)}/мес`;

    if (stats.nextPayment) {
      document.getElementById("statNextPrice").textContent = formatMoney(stats.nextPayment.price);
      const dateStr = formatDate(stats.nextPayment.nextPaymentDate);
      document.getElementById("statNextInfo").textContent = `${stats.nextPayment.name} · ${dateStr}`;
    } else {
      document.getElementById("statNextPrice").textContent = "— ₽";
      document.getElementById("statNextInfo").textContent = "Нет предстоящих платежей";
    }
  } catch (e) {
    // ошибка уже обработана в apiFetch (logout при 401), здесь просто не падаем дальше
  }
}

// =====================================================================
// Подписки: список, поиск, фильтр
// =====================================================================

async function filterSubs() {
  const q = document.getElementById("searchInput").value.trim();
  const cat = document.getElementById("catFilter").value;

  const params = new URLSearchParams();
  if (q) params.set("search", q);
  if (cat) params.set("category", cat);

  try {
    const res = await apiFetch(`/api/subscriptions?${params.toString()}`);
    if (!res.ok) return;
    subs = await res.json();
    renderSubs(subs);
  } catch (e) {
    // обработано в apiFetch
  }
}

function renderSubs(list) {
  const grid = document.getElementById("subsGrid");

  if (list.length === 0) {
    grid.innerHTML = `<div class="sub-empty">Подписок не найдено</div>`;
    return;
  }

  grid.innerHTML = list.map((s) => `
    <div class="sub-card">
      <div class="sub-card-top">
        <div class="sub-icon" style="background:${colorForName(s.name)}">${s.name[0]?.toUpperCase() || "?"}</div>
        <span class="cat-badge">${CATEGORY_LABELS[s.category] || s.category}</span>
      </div>
      <div class="sub-name">${escapeHtml(s.name)}</div>
      <div class="sub-price">${formatMoney(s.price)}<span class="sub-period">${PERIOD_LABELS[s.period] || ""}</span></div>
      <div class="sub-date"><i class="ti ti-calendar" aria-hidden="true"></i>${formatDate(s.nextPaymentDate)}</div>
      <div class="sub-actions">
        <button title="Редактировать" onclick="openEditModal(${s.id})"><i class="ti ti-edit" aria-hidden="true"></i></button>
        <button title="Удалить" onclick="deleteSub(${s.id})"><i class="ti ti-trash" aria-hidden="true"></i></button>
      </div>
    </div>
  `).join("");
}

async function deleteSub(id) {
  try {
    const res = await apiFetch(`/api/subscriptions/${id}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      await loadDashboard();
    }
  } catch (e) {
    // обработано в apiFetch
  }
}

// =====================================================================
// Аналитика: графики по категориям, прогноз по месяцам, таблица платежей
// =====================================================================

async function loadAnalytics() {
  try {
    const [analyticsRes, subsRes] = await Promise.all([
      apiFetch("/api/analytics"),
      apiFetch("/api/subscriptions")
    ]);

    if (analyticsRes.ok) {
      const data = await analyticsRes.json();
      renderCategoryChart(data.byCategory);
      renderForecastChart(data.forecast);
    }

    if (subsRes.ok) {
      const allSubs = await subsRes.json();
      renderPaymentsTable(allSubs);
    }
  } catch (e) {
    // обработано в apiFetch
  }
}

function renderCategoryChart(byCategory) {
  const svg = document.getElementById("categoryChart");
  const legend = document.getElementById("categoryLegend");

  const total = byCategory.reduce((sum, c) => sum + c.monthlyAmount, 0);

  if (total === 0) {
    svg.innerHTML = `<circle cx="120" cy="120" r="90" fill="none" stroke="#DCCFB8" stroke-width="28"/>`;
    legend.innerHTML = `<div class="legend-row">Нет данных для отображения</div>`;
    return;
  }

  const colors = ["#7A9CB3", "#AD7556", "#53443D", "#1D9E75", "#D85A30", "#c4b09a"];
  const radius = 90;
  const circumference = 2 * Math.PI * radius;
  let offsetAcc = 0;

  const segments = byCategory.map((c, i) => {
    const fraction = c.monthlyAmount / total;
    const dash = fraction * circumference;
    const segment = `
      <circle cx="120" cy="120" r="${radius}" fill="none"
        stroke="${colors[i % colors.length]}" stroke-width="28"
        stroke-dasharray="${dash} ${circumference - dash}"
        stroke-dashoffset="${-offsetAcc}"
        transform="rotate(-90 120 120)"/>
    `;
    offsetAcc += dash;
    return segment;
  });

  svg.innerHTML = segments.join("");

  legend.innerHTML = byCategory.map((c, i) => `
    <div class="legend-row">
      <span class="legend-label">
        <span class="legend-dot" style="background:${colors[i % colors.length]}"></span>
        ${CATEGORY_LABELS[c.category] || c.category}
      </span>
      <span class="legend-amount">${formatMoney(c.monthlyAmount)}/мес</span>
    </div>
  `).join("");
}

function renderForecastChart(forecast) {
  const chart = document.getElementById("forecastChart");

  if (!forecast || forecast.length === 0) {
    chart.innerHTML = `<div class="table-empty">Нет данных для прогноза</div>`;
    return;
  }

  const maxAmount = Math.max(...forecast.map((f) => f.amount), 1);

  chart.innerHTML = forecast.map((f) => {
    const heightPct = Math.max((f.amount / maxAmount) * 100, 3);
    return `
      <div class="bar-col">
        <div class="bar-value">${formatMoney(f.amount)}</div>
        <div class="bar-rect" style="height:${heightPct}%"></div>
        <div class="bar-label">${formatMonthLabel(f.month)}</div>
      </div>
    `;
  }).join("");
}

function renderPaymentsTable(list) {
  const tbody = document.getElementById("paymentsTableBody");

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Подписок пока нет</td></tr>`;
    return;
  }

  const sorted = [...list].sort((a, b) => a.nextPaymentDate.localeCompare(b.nextPaymentDate));

  tbody.innerHTML = sorted.map((s) => `
    <tr>
      <td>${escapeHtml(s.name)}</td>
      <td>${CATEGORY_LABELS[s.category] || s.category}</td>
      <td>${formatMoney(s.price)}</td>
      <td>${PERIOD_LABELS[s.period] || s.period}</td>
      <td>${formatDate(s.nextPaymentDate)}</td>
    </tr>
  `).join("");
}

function formatMonthLabel(yyyyMM) {
  const [year, month] = yyyyMM.split("-").map(Number);
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString("ru-RU", { month: "short" });
}

// =====================================================================
// Модальное окно: добавление / редактирование подписки
// =====================================================================

function openModal() {
  document.getElementById("editId").value = "";
  document.getElementById("modalTitle").textContent = "Добавить подписку";
  document.getElementById("newName").value = "";
  document.getElementById("newPrice").value = "";
  document.getElementById("newCurrency").value = "RUB";
  document.getElementById("newPeriod").value = "Monthly";
  document.getElementById("newCat").value = "Other";
  document.getElementById("newDate").value = "";
  document.getElementById("notifyCheck").checked = true;
  const days = currentProfile?.defaultNotifyDaysBefore ?? 3;
  document.getElementById("notifyLabel").textContent = `Напомнить за ${days} ${pluralDays(days)} до списания`;
  document.getElementById("modalOverlay").classList.add("open");
}

function openEditModal(id) {
  const sub = subs.find((s) => s.id === id);
  if (!sub) return;

  document.getElementById("editId").value = sub.id;
  document.getElementById("modalTitle").textContent = "Редактировать подписку";
  document.getElementById("newName").value = sub.name;
  document.getElementById("newPrice").value = sub.price;
  document.getElementById("newCurrency").value = sub.currency || "RUB";
  document.getElementById("newPeriod").value = sub.period;
  document.getElementById("newCat").value = sub.category;
  document.getElementById("newDate").value = sub.nextPaymentDate;
  document.getElementById("notifyCheck").checked = sub.notifyBeforePayment;
  const days = sub.notifyDaysBefore ?? 3;
  document.getElementById("notifyLabel").textContent = `Напомнить за ${days} ${pluralDays(days)} до списания`;
  document.getElementById("modalOverlay").classList.add("open");
}

function closeModal() {
  document.getElementById("modalOverlay").classList.remove("open");
}

async function saveSubscription() {
  const id = document.getElementById("editId").value;
  const name = document.getElementById("newName").value.trim();
  const price = parseFloat(document.getElementById("newPrice").value) || 0;
  const currency = document.getElementById("newCurrency").value;
  const period = document.getElementById("newPeriod").value;
  const category = document.getElementById("newCat").value;
  const nextPaymentDate = document.getElementById("newDate").value;
  const notifyBeforePayment = document.getElementById("notifyCheck").checked;

  if (!name) {
    alert("Укажите название сервиса");
    return;
  }
  if (!nextPaymentDate) {
    alert("Укажите дату следующего списания");
    return;
  }

  const existing = id ? subs.find((s) => s.id === parseInt(id, 10)) : null;

  const payload = {
    name,
    price,
    currency,
    period,
    category,
    nextPaymentDate,
    notifyBeforePayment,
    notifyDaysBefore: existing?.notifyDaysBefore ?? currentProfile?.defaultNotifyDaysBefore ?? 3
  };

  try {
    const res = id
      ? await apiFetch(`/api/subscriptions/${id}`, { method: "PUT", body: JSON.stringify(payload) })
      : await apiFetch(`/api/subscriptions`, { method: "POST", body: JSON.stringify(payload) });

    if (!res.ok) {
      const err = await safeJson(res);
      alert(err?.error || "Не удалось сохранить подписку");
      return;
    }

    closeModal();
    await loadDashboard();
  } catch (e) {
    // обработано в apiFetch
  }
}

// =====================================================================
// Профиль: данные пользователя, настройки уведомлений, смена пароля
// =====================================================================

async function loadProfile() {
  try {
    const res = await apiFetch("/api/profile");
    if (!res.ok) return;
    const profile = await res.json();
    currentProfile = profile;

    document.getElementById("profileAvatar").textContent = profile.displayName?.[0]?.toUpperCase() || "?";
    document.getElementById("profileName").textContent = profile.displayName;
    document.getElementById("profileEmail").textContent = profile.email;
    document.getElementById("profileSince").textContent = `На SmartSub с ${formatDateWithYear(profile.createdAt)}`;

    document.getElementById("profileDisplayName").value = profile.displayName;
    document.getElementById("profileEmailInput").value = profile.email;
    document.getElementById("profileNotifyDays").value = profile.defaultNotifyDaysBefore;
  } catch (e) {
    // обработано в apiFetch
  }
}

async function saveProfile() {
  const displayName = document.getElementById("profileDisplayName").value.trim();
  const defaultNotifyDaysBefore = parseInt(document.getElementById("profileNotifyDays").value, 10);

  hideProfileMessages();

  if (!displayName) {
    showProfileError("Имя не может быть пустым");
    return;
  }
  if (isNaN(defaultNotifyDaysBefore) || defaultNotifyDaysBefore < 0 || defaultNotifyDaysBefore > 30) {
    showProfileError("Количество дней должно быть от 0 до 30");
    return;
  }

  try {
    const res = await apiFetch("/api/profile", {
      method: "PUT",
      body: JSON.stringify({ displayName, defaultNotifyDaysBefore })
    });

    if (!res.ok) {
      const err = await safeJson(res);
      showProfileError(err?.error || "Не удалось сохранить изменения");
      return;
    }

    const profile = await res.json();
    currentProfile = profile;
    currentUser = { ...currentUser, displayName: profile.displayName };
    localStorage.setItem("smartsub_user", JSON.stringify(currentUser));
    document.getElementById("navUserName").textContent = `Привет, ${profile.displayName}!`;

    showProfileSuccess("Изменения сохранены");
  } catch (e) {
    // обработано в apiFetch
  }
}

async function changePassword() {
  const currentPassword = document.getElementById("currentPassword").value;
  const newPassword = document.getElementById("newPassword").value;

  hidePasswordMessages();

  if (!currentPassword || !newPassword) {
    showPasswordError("Заполните оба поля");
    return;
  }
  if (newPassword.length < 6) {
    showPasswordError("Новый пароль должен быть не короче 6 символов");
    return;
  }

  try {
    const res = await apiFetch("/api/profile/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword })
    });

    if (!res.ok) {
      const err = await safeJson(res);
      showPasswordError(err?.error || "Не удалось изменить пароль");
      return;
    }

    document.getElementById("currentPassword").value = "";
    document.getElementById("newPassword").value = "";
    showPasswordSuccess("Пароль успешно изменён");
  } catch (e) {
    // обработано в apiFetch
  }
}

function showProfileError(msg) {
  const el = document.getElementById("profileError");
  el.textContent = msg;
  el.style.display = "block";
}

function showProfileSuccess(msg) {
  const el = document.getElementById("profileSuccess");
  el.textContent = msg;
  el.style.display = "block";
}

function hideProfileMessages() {
  document.getElementById("profileError").style.display = "none";
  document.getElementById("profileSuccess").style.display = "none";
}

function showPasswordError(msg) {
  const el = document.getElementById("passwordError");
  el.textContent = msg;
  el.style.display = "block";
}

function showPasswordSuccess(msg) {
  const el = document.getElementById("passwordSuccess");
  el.textContent = msg;
  el.style.display = "block";
}

function hidePasswordMessages() {
  document.getElementById("passwordError").style.display = "none";
  document.getElementById("passwordSuccess").style.display = "none";
}

// =====================================================================
// Вспомогательные функции форматирования
// =====================================================================

function formatMoney(value) {
  const n = Number(value) || 0;
  return `${n.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₽`;
}

function formatDate(isoDate) {
  if (!isoDate) return "—";
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function formatDateWithYear(isoDate) {
  if (!isoDate) return "—";
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function pluralDays(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "дней";
  if (mod10 === 1) return "день";
  if (mod10 >= 2 && mod10 <= 4) return "дня";
  return "дней";
}

// =====================================================================
// Старт приложения
// =====================================================================

(function init() {
  const savedUser = localStorage.getItem("smartsub_user");
  if (authToken && savedUser) {
    currentUser = JSON.parse(savedUser);
    showApp();
  } else {
    showAuth();
  }
})();
