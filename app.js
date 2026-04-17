const STORAGE_KEY = "unified-calendar-v1";

const seed = {
  users: ["あなた", "会社A", "友人グループ", "チームB"],
  currentUser: "あなた",
  calendars: [
    { id: "personal", name: "個人", color: "#4f46e5", visible: true },
    { id: "work", name: "会社", color: "#0ea5e9", visible: true },
    { id: "friends", name: "友人", color: "#f97316", visible: true },
  ],
  groups: [
    {
      id: crypto.randomUUID(),
      name: "会社",
      description: "会社の全体予定",
      admin: "会社A",
      members: [
        { user: "あなた", role: "viewer" },
        { user: "会社A", role: "admin" },
      ],
    },
  ],
  events: [],
  invites: [],
};

let state = load();
let editingEventId = null;

const els = {
  currentUser: document.querySelector("#currentUser"),
  todayBtn: document.querySelector("#todayBtn"),
  newEventBtn: document.querySelector("#newEventBtn"),
  calendarScroll: document.querySelector("#calendarScroll"),
  calendarFilters: document.querySelector("#calendarFilters"),
  groupList: document.querySelector("#groupList"),
  newGroupBtn: document.querySelector("#newGroupBtn"),
  inviteInput: document.querySelector("#inviteInput"),
  acceptInviteBtn: document.querySelector("#acceptInviteBtn"),

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
  return raw ? JSON.parse(raw) : seed;
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function init() {
  renderUserPicker();
  renderFilters();
  renderGroups();
  renderCalendar();

  els.currentUser.addEventListener("change", () => {
    state.currentUser = els.currentUser.value;
    save();
    renderGroups();
    renderCalendar();
  });

  els.todayBtn.addEventListener("click", scrollToToday);
  els.newEventBtn.addEventListener("click", () => openEventDialog());
  els.cancelEventBtn.addEventListener("click", () => els.eventDialog.close());
  els.eventForm.addEventListener("submit", saveEvent);
  els.deleteEventBtn.addEventListener("click", deleteEvent);

  els.newGroupBtn.addEventListener("click", () => els.groupDialog.showModal());
  els.cancelGroupBtn.addEventListener("click", () => els.groupDialog.close());
  els.groupForm.addEventListener("submit", createGroup);

  els.acceptInviteBtn.addEventListener("click", previewInvite);
  els.rejectInviteBtn.addEventListener("click", () => els.inviteDialog.close());
  els.confirmInviteBtn.addEventListener("click", acceptInvite);
}

function renderUserPicker() {
  els.currentUser.innerHTML = state.users
    .map((u) => `<option ${u === state.currentUser ? "selected" : ""}>${u}</option>`)
    .join("");
}

function renderFilters() {
  els.calendarFilters.innerHTML = state.calendars
    .map(
      (c) => `<label><input type="checkbox" data-id="${c.id}" ${c.visible ? "checked" : ""}> ${c.name}</label>`,
    )
    .join("");

  els.calendarFilters.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => {
      const calendar = state.calendars.find((c) => c.id === input.dataset.id);
      calendar.visible = input.checked;
      save();
      renderCalendar();
    });
  });
}

function renderGroups() {
  const groups = state.groups.filter((g) => g.members.some((m) => m.user === state.currentUser));
  els.groupList.innerHTML = groups
    .map((g) => {
      const me = g.members.find((m) => m.user === state.currentUser);
      return `<li class="group-item">
        <strong>${g.name}</strong>
        <div class="meta">役割: ${me.role} / メンバー: ${g.members.length}</div>
        <button data-group="${g.id}" class="inviteBtn">招待リンク生成</button>
      </li>`;
    })
    .join("");

  els.groupList.querySelectorAll(".inviteBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const group = state.groups.find((g) => g.id === btn.dataset.group);
      if (!isAdmin(group, state.currentUser)) {
        alert("管理者のみ招待リンクを発行できます。");
        return;
      }
      const token = crypto.randomUUID();
      state.invites.push({ token, groupId: group.id, role: "viewer" });
      save();
      navigator.clipboard.writeText(token).catch(() => {});
      alert(`招待トークンを発行しました。\n${token}\n(クリップボードにもコピーを試行)`);
    });
  });
}

function renderCalendar() {
  const today = new Date();
  const monthOffsets = Array.from({ length: 13 }, (_, i) => i - 6);
  els.calendarScroll.innerHTML = monthOffsets.map((offset) => renderMonth(today, offset)).join("");

  els.calendarScroll.querySelectorAll(".event-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const event = state.events.find((e) => e.id === chip.dataset.id);
      openEventDialog(event);
    });
  });
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

    const isOther = cellDate.getMonth() !== month;
    const isToday = sameDay(cellDate, new Date());
    const events = getVisibleEventsForDate(cellDate);

    cells.push(`<div class="day ${isOther ? "other" : ""} ${isToday ? "today" : ""}" data-date="${toISODate(cellDate)}">
      <div class="day-num">${cellDate.getDate()}</div>
      ${events
        .map(
          (e) => `<div class="event-chip" data-id="${e.id}" style="background:${e.color}">
                ${timeLabel(e.start)} ${e.title}
              </div>`,
        )
        .join("")}
    </div>`);
  }

  return `<section class="month" id="month-${year}-${month + 1}">
      <h3>${year}年${month + 1}月</h3>
      <div class="month-grid">${cells.join("")}</div>
    </section>`;
}

function getVisibleEventsForDate(date) {
  const visibleCalendarIds = state.calendars.filter((c) => c.visible).map((c) => c.id);
  return state.events.filter((e) => {
    if (!visibleCalendarIds.includes(e.calendarId)) return false;
    const dayMatch = toISODate(new Date(e.start)) === toISODate(date);
    if (!dayMatch) return false;

    if (e.shareGroupId) {
      const group = state.groups.find((g) => g.id === e.shareGroupId);
      return group?.members.some((m) => m.user === state.currentUser);
    }

    return e.owner === state.currentUser;
  });
}

function openEventDialog(event = null) {
  editingEventId = event?.id || null;
  els.eventDialogTitle.textContent = event ? "予定を編集" : "予定を追加";
  document.querySelector("#eventId").value = event?.id || "";
  document.querySelector("#title").value = event?.title || "";
  document.querySelector("#category").value = event?.category || "個人";
  document.querySelector("#color").value = event?.color || "#4f46e5";
  document.querySelector("#start").value = event ? toLocalDateTimeInput(event.start) : "";
  document.querySelector("#end").value = event ? toLocalDateTimeInput(event.end) : "";
  document.querySelector("#location").value = event?.location || "";
  document.querySelector("#url").value = event?.url || "";
  document.querySelector("#description").value = event?.description || "";

  const shareGroup = document.querySelector("#shareGroup");
  shareGroup.innerHTML = '<option value="">共有しない</option>';
  const editableGroups = state.groups.filter((g) => canEditGroup(g, state.currentUser));
  editableGroups.forEach((g) => {
    shareGroup.insertAdjacentHTML(
      "beforeend",
      `<option value="${g.id}" ${event?.shareGroupId === g.id ? "selected" : ""}>${g.name}</option>`,
    );
  });

  const canEdit = event ? canEditEvent(event, state.currentUser) : true;
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

  const payload = {
    id: editingEventId || crypto.randomUUID(),
    owner: state.currentUser,
    title: document.querySelector("#title").value,
    category: document.querySelector("#category").value,
    color: document.querySelector("#color").value,
    start: document.querySelector("#start").value,
    end: document.querySelector("#end").value,
    location: document.querySelector("#location").value,
    url: document.querySelector("#url").value,
    description: document.querySelector("#description").value,
    shareGroupId: document.querySelector("#shareGroup").value || null,
    calendarId: mapCategoryToCalendarId(document.querySelector("#category").value),
  };

  if (new Date(payload.end) <= new Date(payload.start)) {
    alert("終了時刻は開始時刻より後にしてください。");
    return;
  }

  if (payload.shareGroupId) {
    const group = state.groups.find((g) => g.id === payload.shareGroupId);
    if (!canEditGroup(group, state.currentUser)) {
      alert("このグループへ予定を共有する権限がありません。");
      return;
    }
  }

  const idx = state.events.findIndex((e) => e.id === payload.id);
  if (idx >= 0) {
    if (!canEditEvent(state.events[idx], state.currentUser)) {
      alert("この予定を編集する権限がありません。");
      return;
    }
    state.events[idx] = payload;
  } else {
    state.events.push(payload);
  }

  save();
  els.eventDialog.close();
  renderCalendar();
}

function deleteEvent() {
  if (!editingEventId) return;
  const event = state.events.find((e) => e.id === editingEventId);
  if (!canEditEvent(event, state.currentUser)) {
    alert("削除権限がありません。");
    return;
  }
  state.events = state.events.filter((e) => e.id !== editingEventId);
  save();
  els.eventDialog.close();
  renderCalendar();
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
    admin: state.currentUser,
    members: [{ user: state.currentUser, role: "admin" }],
  });

  save();
  els.groupDialog.close();
  els.groupForm.reset();
  renderGroups();
}

function previewInvite() {
  const token = els.inviteInput.value.trim();
  const invite = state.invites.find((i) => i.token === token);
  if (!invite) {
    alert("有効な招待トークンが見つかりません。");
    return;
  }
  const group = state.groups.find((g) => g.id === invite.groupId);
  els.invitePreview.innerHTML = `<h3>招待確認</h3>
    <p>ユーザー: <strong>${state.currentUser}</strong></p>
    <p>グループ: <strong>${group.name}</strong></p>
    <p>付与ロール: <strong>${invite.role}</strong></p>`;
  els.inviteDialog.dataset.token = token;
  els.inviteDialog.showModal();
}

function acceptInvite() {
  const token = els.inviteDialog.dataset.token;
  const invite = state.invites.find((i) => i.token === token);
  if (!invite) return;
  const group = state.groups.find((g) => g.id === invite.groupId);

  const already = group.members.find((m) => m.user === state.currentUser);
  if (!already) group.members.push({ user: state.currentUser, role: invite.role });
  state.invites = state.invites.filter((i) => i.token !== token);

  save();
  els.inviteDialog.close();
  renderGroups();
  renderCalendar();
}

function canEditEvent(event, user) {
  if (!event) return false;
  if (event.owner === user && !event.shareGroupId) return true;
  if (event.shareGroupId) {
    const group = state.groups.find((g) => g.id === event.shareGroupId);
    return canEditGroup(group, user);
  }
  return false;
}

function canEditGroup(group, user) {
  const role = group?.members.find((m) => m.user === user)?.role;
  return role === "admin" || role === "editor";
}

function isAdmin(group, user) {
  const role = group?.members.find((m) => m.user === user)?.role;
  return role === "admin";
}

function mapCategoryToCalendarId(category) {
  if (category === "仕事") return "work";
  if (category === "友人") return "friends";
  return "personal";
}

function scrollToToday() {
  const now = new Date();
  const id = `month-${now.getFullYear()}-${now.getMonth() + 1}`;
  document.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function toISODate(date) {
  return date.toISOString().split("T")[0];
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
