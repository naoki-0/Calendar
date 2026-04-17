const STORAGE_KEY = "unified-calendar-v2";
const GOOGLE_CLIENT_ID = ""; // 設定するとGoogleログインを有効化
const SYNC_CHANNEL_NAME = "unified-calendar-sync";

const CATEGORY_COLORS = {
  予定: "#2563eb",
  職場: "#0ea5e9",
  自宅: "#f97316",
  その他: "#6b7280",
};

const seed = {
  users: [
    { id: "u1", name: "あなた", email: "you@example.com", provider: "demo" },
    { id: "u2", name: "会社A(Admin)", email: "admin@company.com", provider: "demo" },
    { id: "u3", name: "会社メンバー(Viewer)", email: "viewer@company.com", provider: "demo" },
  ],
  sessionUserId: null,
  viewingUserId: null,
  categories: [
    { id: "plan", name: "予定", visible: true },
    { id: "work", name: "職場", visible: true },
    { id: "home", name: "自宅", visible: true },
    { id: "other", name: "その他", visible: true },
  ],
  groups: [
    {
      id: "g1",
      name: "会社",
      description: "会社の全体予定",
      members: [
        { userId: "u2", role: "admin" },
        { userId: "u3", role: "viewer" },
      ],
    },
  ],
  events: [],
  invites: [],
};

let state = load();
let editingEventId = null;
let pendingInviteToken = null;
const syncChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(SYNC_CHANNEL_NAME) : null;

const els = {
  sessionLabel: document.querySelector("#sessionLabel"),
  currentUser: document.querySelector("#currentUser"),
  todayBtn: document.querySelector("#todayBtn"),
  newEventBtn: document.querySelector("#newEventBtn"),
  logoutBtn: document.querySelector("#logoutBtn"),
  calendarScroll: document.querySelector("#calendarScroll"),
  calendarFilters: document.querySelector("#calendarFilters"),
  groupList: document.querySelector("#groupList"),
  newGroupBtn: document.querySelector("#newGroupBtn"),
  inviteInput: document.querySelector("#inviteInput"),
  acceptInviteBtn: document.querySelector("#acceptInviteBtn"),

  loginDialog: document.querySelector("#loginDialog"),
  loginForm: document.querySelector("#loginForm"),
  loginUser: document.querySelector("#loginUser"),
  googleLoginMount: document.querySelector("#googleLoginMount"),

  eventDialog: document.querySelector("#eventDialog"),
  eventForm: document.querySelector("#eventForm"),
  deleteEventBtn: document.querySelector("#deleteEventBtn"),
  cancelEventBtn: document.querySelector("#cancelEventBtn"),
  eventDialogTitle: document.querySelector("#eventDialogTitle"),

  groupDialog: document.querySelector("#groupDialog"),
  groupForm: document.querySelector("#groupForm"),
  cancelGroupBtn: document.querySelector("#cancelGroupBtn"),

  inviteDialog: document.querySelector("#inviteDialog"),
  invitePreview: document.querySelector("#invitePreview"),
  rejectInviteBtn: document.querySelector("#rejectInviteBtn"),
  confirmInviteBtn: document.querySelector("#confirmInviteBtn"),
};

init();

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(seed);

  const parsed = JSON.parse(raw);
  if (parsed.categories?.length) return parsed;

  return {
    ...structuredClone(seed),
    ...parsed,
    categories: structuredClone(seed.categories),
  };
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  syncChannel?.postMessage({ type: "state-updated" });
}

function reloadFromStorage() {
  state = load();
  renderAll();
}

function init() {
  bindEvents();
  renderLoginOptions();
  setupGoogleLogin();
  ensureSession();

  syncChannel?.addEventListener("message", (event) => {
    if (event.data?.type === "state-updated") reloadFromStorage();
  });

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) reloadFromStorage();
  });
}

function bindEvents() {
  els.currentUser.addEventListener("change", () => {
    state.viewingUserId = els.currentUser.value;
    save();
    renderAll();
  });

  els.todayBtn.addEventListener("click", scrollToTodayCenter);
  els.newEventBtn.addEventListener("click", () => openEventDialog(null, new Date()));
  els.logoutBtn.addEventListener("click", logout);

  els.cancelEventBtn.addEventListener("click", () => els.eventDialog.close());
  els.eventForm.addEventListener("submit", saveEvent);
  els.deleteEventBtn.addEventListener("click", deleteEvent);

  els.newGroupBtn.addEventListener("click", () => els.groupDialog.showModal());
  els.cancelGroupBtn.addEventListener("click", () => els.groupDialog.close());
  els.groupForm.addEventListener("submit", createGroup);

  els.acceptInviteBtn.addEventListener("click", previewInvite);
  els.rejectInviteBtn.addEventListener("click", () => {
    pendingInviteToken = null;
    els.inviteDialog.close();
  });
  els.confirmInviteBtn.addEventListener("click", acceptInvite);

  els.loginForm.addEventListener("submit", loginAsDemoUser);
}

function ensureSession() {
  if (!state.sessionUserId) {
    els.loginDialog.showModal();
    return;
  }

  if (!state.viewingUserId) state.viewingUserId = state.sessionUserId;
  save();
  renderAll();
}

function renderAll() {
  renderSessionLabel();
  renderUserPicker();
  renderFilters();
  renderGroups();
  renderCalendar();
}

function renderLoginOptions() {
  els.loginUser.innerHTML = state.users
    .map((u) => `<option value="${u.id}">${u.name} (${u.email})</option>`)
    .join("");
}

function setupGoogleLogin() {
  if (!window.google || !GOOGLE_CLIENT_ID) {
    els.googleLoginMount.innerHTML = "<small>Googleログインを使う場合は app.js の GOOGLE_CLIENT_ID を設定してください。</small>";
    return;
  }

  window.handleGoogleCredential = (response) => {
    const payload = parseJwt(response.credential);
    const email = payload?.email;
    if (!email) {
      alert("Googleログイン情報を読み取れませんでした。");
      return;
    }

    let user = state.users.find((u) => u.email === email);
    if (!user) {
      user = {
        id: crypto.randomUUID(),
        name: payload.name || email,
        email,
        provider: "google",
      };
      state.users.push(user);
    }

    state.sessionUserId = user.id;
    state.viewingUserId = user.id;
    save();
    els.loginDialog.close();
    renderLoginOptions();
    renderAll();
  };

  window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: window.handleGoogleCredential });
  window.google.accounts.id.renderButton(els.googleLoginMount, { theme: "outline", size: "large", text: "signin_with" });
}

function loginAsDemoUser(event) {
  event.preventDefault();
  state.sessionUserId = els.loginUser.value;
  state.viewingUserId = state.sessionUserId;
  save();
  els.loginDialog.close();
  renderAll();
}

function logout() {
  state.sessionUserId = null;
  state.viewingUserId = null;
  save();
  els.loginDialog.showModal();
}

function renderSessionLabel() {
  const sessionUser = getSessionUser();
  els.sessionLabel.textContent = sessionUser ? `ログイン中: ${sessionUser.name}` : "未ログイン";
}

function renderUserPicker() {
  els.currentUser.innerHTML = state.users
    .map((u) => `<option value="${u.id}" ${u.id === state.viewingUserId ? "selected" : ""}>${u.name}</option>`)
    .join("");
}

function renderFilters() {
  els.calendarFilters.innerHTML = state.categories
    .map(
      (c) =>
        `<label><input type="checkbox" data-id="${c.id}" ${c.visible ? "checked" : ""}> <span style="color:${CATEGORY_COLORS[c.name]}">●</span> ${c.name}</label>`,
    )
    .join("");

  els.calendarFilters.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => {
      const category = state.categories.find((c) => c.id === input.dataset.id);
      category.visible = input.checked;
      save();
      renderCalendar();
    });
  });
}

function renderGroups() {
  const viewingUser = getViewingUser();
  const groups = state.groups.filter((g) => g.members.some((m) => m.userId === viewingUser.id));

  if (!groups.length) {
    els.groupList.innerHTML = "<li class='group-item'>参加中のグループはありません。</li>";
    return;
  }

  els.groupList.innerHTML = groups
    .map((g) => {
      const me = g.members.find((m) => m.userId === viewingUser.id);
      const memberNames = g.members
        .map((m) => `${findUser(m.userId)?.name || "不明"}(${m.role})`)
        .join(" / ");
      return `<li class="group-item">
        <strong>${g.name}</strong>
        <div class="meta">あなたの権限: ${me.role}</div>
        <div class="meta">メンバー: ${memberNames}</div>
        <button data-group="${g.id}" class="inviteBtn">招待リンク生成</button>
      </li>`;
    })
    .join("");

  els.groupList.querySelectorAll(".inviteBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const group = state.groups.find((g) => g.id === btn.dataset.group);
      if (!isAdmin(group, state.sessionUserId)) {
        alert("管理者のみ招待リンクを発行できます。");
        return;
      }
      const token = crypto.randomUUID();
      state.invites.push({ token, groupId: group.id, role: "viewer" });
      save();
      navigator.clipboard.writeText(token).catch(() => {});
      alert(`招待トークンを発行しました。\n${token}`);
    });
  });
}

function renderCalendar() {
  const today = new Date();
  const monthOffsets = Array.from({ length: 13 }, (_, i) => i - 6);
  els.calendarScroll.innerHTML = monthOffsets.map((offset) => renderMonth(today, offset)).join("");

  els.calendarScroll.querySelectorAll(".event-chip").forEach((chip) => {
    chip.addEventListener("click", (event) => {
      event.stopPropagation();
      const item = state.events.find((e) => e.id === chip.dataset.id);
      openEventDialog(item, new Date(item.start));
    });
  });

  els.calendarScroll.querySelectorAll(".day").forEach((dayEl) => {
    dayEl.addEventListener("click", () => {
      const date = new Date(dayEl.dataset.date + "T10:00:00");
      openEventDialog(null, date);
    });
  });

  requestAnimationFrame(scrollToTodayCenter);
}

function renderMonth(baseDate, monthOffset) {
  const date = new Date(baseDate.getFullYear(), baseDate.getMonth() + monthOffset, 1);
  const month = date.getMonth();
  const year = date.getFullYear();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysPrevMonth = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = 0; i < 42; i++) {
    const dayNum = i < startOffset ? daysPrevMonth - startOffset + i + 1 : i - startOffset + 1;
    const cellDate = new Date(
      year,
      i < startOffset ? month - 1 : i - startOffset + 1 > daysInMonth ? month + 1 : month,
      dayNum > daysInMonth ? dayNum - daysInMonth : dayNum,
    );

    const events = getVisibleEventsForDate(cellDate);
    const isOther = cellDate.getMonth() !== month;
    const isToday = sameDay(cellDate, new Date());

    cells.push(`<div class="day ${isOther ? "other" : ""} ${isToday ? "today" : ""}" data-date="${toISODate(cellDate)}">
      <div class="day-num">${cellDate.getDate()}</div>
      ${events
        .map((e) => `<div class="event-chip" data-id="${e.id}" style="background:${CATEGORY_COLORS[e.category]}">
            ${timeLabel(e.start)} ${e.title}
          </div>`)
        .join("")}
    </div>`);
  }

  return `<section class="month" id="month-${year}-${month + 1}">
      <h3>${year}年${month + 1}月</h3>
      <div class="month-grid">${cells.join("")}</div>
    </section>`;
}

function getVisibleEventsForDate(date) {
  const viewingUser = getViewingUser();
  const visibleCategories = new Set(state.categories.filter((c) => c.visible).map((c) => c.name));

  return state.events.filter((e) => {
    if (!visibleCategories.has(e.category)) return false;
    if (toISODate(new Date(e.start)) !== toISODate(date)) return false;

    if (!e.shareGroupId) return e.ownerId === viewingUser.id;

    const group = state.groups.find((g) => g.id === e.shareGroupId);
    return group?.members.some((m) => m.userId === viewingUser.id);
  });
}

function openEventDialog(event = null, baseDate = new Date()) {
  editingEventId = event?.id || null;
  els.eventDialogTitle.textContent = event ? "予定を編集" : "予定を追加";

  const defaults = defaultTimeRange(baseDate);
  document.querySelector("#eventId").value = event?.id || "";
  document.querySelector("#title").value = event?.title || "";
  document.querySelector("#category").value = event?.category || "予定";
  document.querySelector("#start").value = event ? toLocalDateTimeInput(event.start) : defaults.start;
  document.querySelector("#end").value = event ? toLocalDateTimeInput(event.end) : defaults.end;
  document.querySelector("#location").value = event?.location || "";
  document.querySelector("#url").value = event?.url || "";
  document.querySelector("#description").value = event?.description || "";

  const shareGroup = document.querySelector("#shareGroup");
  shareGroup.innerHTML = '<option value="">共有しない</option>';
  const editableGroups = state.groups.filter((g) => canEditGroup(g, state.sessionUserId));
  editableGroups.forEach((g) => {
    shareGroup.insertAdjacentHTML(
      "beforeend",
      `<option value="${g.id}" ${event?.shareGroupId === g.id ? "selected" : ""}>${g.name}</option>`,
    );
  });

  const canEdit = event ? canEditEvent(event, state.sessionUserId) : true;
  Array.from(els.eventForm.elements).forEach((el) => {
    if (el.tagName === "BUTTON") return;
    el.disabled = !canEdit;
  });
  document.querySelector("#saveEventBtn").disabled = !canEdit;
  els.deleteEventBtn.disabled = !event || !canEdit;

  els.eventDialog.showModal();
}

function saveEvent(ev) {
  ev.preventDefault();

  const start = document.querySelector("#start").value || defaultTimeRange(new Date()).start;
  const end = document.querySelector("#end").value || defaultTimeRange(new Date()).end;

  const payload = {
    id: editingEventId || crypto.randomUUID(),
    ownerId: state.sessionUserId,
    title: document.querySelector("#title").value.trim() || "(無題)",
    category: document.querySelector("#category").value,
    start,
    end,
    location: document.querySelector("#location").value.trim(),
    url: document.querySelector("#url").value.trim(),
    description: document.querySelector("#description").value.trim(),
    shareGroupId: document.querySelector("#shareGroup").value || null,
    updatedAt: new Date().toISOString(),
  };

  if (new Date(payload.end) <= new Date(payload.start)) {
    alert("終了時刻は開始時刻より後にしてください。");
    return;
  }

  if (payload.shareGroupId) {
    const group = state.groups.find((g) => g.id === payload.shareGroupId);
    if (!canEditGroup(group, state.sessionUserId)) {
      alert("このグループへ予定を共有する権限がありません。");
      return;
    }
  }

  const idx = state.events.findIndex((e) => e.id === payload.id);
  if (idx >= 0) {
    if (!canEditEvent(state.events[idx], state.sessionUserId)) {
      alert("この予定を編集する権限がありません。");
      return;
    }
    state.events[idx] = payload;
  } else {
    state.events.push(payload);
  }

  save();
  els.eventDialog.close();
  renderAll();
}

function deleteEvent() {
  if (!editingEventId) return;
  const event = state.events.find((e) => e.id === editingEventId);
  if (!canEditEvent(event, state.sessionUserId)) {
    alert("削除権限がありません。");
    return;
  }

  state.events = state.events.filter((e) => e.id !== editingEventId);
  save();
  els.eventDialog.close();
  renderAll();
}

function createGroup(ev) {
  ev.preventDefault();
  const name = document.querySelector("#groupName").value.trim();
  const description = document.querySelector("#groupDescription").value.trim();
  if (!name) return;

  state.groups.push({
    id: crypto.randomUUID(),
    name,
    description,
    members: [{ userId: state.sessionUserId, role: "admin" }],
  });

  save();
  els.groupDialog.close();
  els.groupForm.reset();
  renderAll();
}

function previewInvite() {
  const token = els.inviteInput.value.trim();
  const invite = state.invites.find((i) => i.token === token);
  if (!invite) {
    alert("有効な招待トークンが見つかりません。");
    return;
  }

  const group = state.groups.find((g) => g.id === invite.groupId);
  pendingInviteToken = token;
  els.invitePreview.innerHTML = `<h3>招待確認</h3>
    <p>ログインユーザー: <strong>${getSessionUser().name}</strong></p>
    <p>グループ: <strong>${group.name}</strong></p>
    <p>付与ロール: <strong>${invite.role}</strong></p>`;
  els.inviteDialog.showModal();
}

function acceptInvite() {
  if (!pendingInviteToken) return;
  const invite = state.invites.find((i) => i.token === pendingInviteToken);
  if (!invite) return;

  const group = state.groups.find((g) => g.id === invite.groupId);
  const already = group.members.find((m) => m.userId === state.sessionUserId);
  if (!already) group.members.push({ userId: state.sessionUserId, role: invite.role });

  state.invites = state.invites.filter((i) => i.token !== pendingInviteToken);
  pendingInviteToken = null;
  save();
  els.inviteDialog.close();
  renderAll();
}

function canEditEvent(event, userId) {
  if (event.ownerId === userId && !event.shareGroupId) return true;
  if (event.shareGroupId) {
    const group = state.groups.find((g) => g.id === event.shareGroupId);
    return canEditGroup(group, userId);
  }
  return false;
}

function canEditGroup(group, userId) {
  const role = group?.members.find((m) => m.userId === userId)?.role;
  return role === "admin" || role === "editor";
}

function isAdmin(group, userId) {
  return group?.members.find((m) => m.userId === userId)?.role === "admin";
}

function getSessionUser() {
  return findUser(state.sessionUserId) || state.users[0];
}

function getViewingUser() {
  return findUser(state.viewingUserId) || getSessionUser();
}

function findUser(userId) {
  return state.users.find((u) => u.id === userId);
}

function defaultTimeRange(baseDate) {
  const start = new Date(baseDate);
  start.setHours(10, 0, 0, 0);
  const end = new Date(baseDate);
  end.setHours(11, 0, 0, 0);
  return { start: toLocalDateTimeInput(start), end: toLocalDateTimeInput(end) };
}

function scrollToTodayCenter() {
  const today = els.calendarScroll.querySelector(".day.today");
  if (!today) return;

  const top = today.offsetTop - els.calendarScroll.clientHeight / 2 + today.clientHeight / 2;
  els.calendarScroll.scrollTo({ top, behavior: "smooth" });
}

function toISODate(date) {
  return new Date(date).toISOString().split("T")[0];
}

function toLocalDateTimeInput(value) {
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function timeLabel(value) {
  const d = new Date(value);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function parseJwt(token) {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}
