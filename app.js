import { firebaseConfig } from "./firebase.js";

import {
  collection,
  doc,
  documentId,
  endAt,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAt,
} from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported as analyticsIsSupported } from "firebase/analytics";

/**
 * Firestore 구조(로그인 없이 공용):
 * todos (collection)
 *  └ yyyy-mm-dd (document)
 *       └ items: [{ id, text, completed, createdAt }]
 *       └ updatedAt: timestamp
 */

// ---------------------------
// DOM
// ---------------------------
const el = {
  monthLabel: document.getElementById("monthLabel"),
  todayHint: document.getElementById("todayHint"),
  calendarGrid: document.getElementById("calendarGrid"),
  prevMonthBtn: document.getElementById("prevMonthBtn"),
  nextMonthBtn: document.getElementById("nextMonthBtn"),
  jumpTodayBtn: document.getElementById("jumpTodayBtn"),
  selectedDateLabel: document.getElementById("selectedDateLabel"),
  todoForm: document.getElementById("todoForm"),
  todoInput: document.getElementById("todoInput"),
  todoList: document.getElementById("todoList"),
  todoCount: document.getElementById("todoCount"),
  loadingRow: document.getElementById("loadingRow"),
  errorBox: document.getElementById("errorBox"),
  statusText: document.getElementById("statusText"),
  retryBtn: document.getElementById("retryBtn"),
};

// ---------------------------
// State
// ---------------------------
const state = {
  today: stripTime(new Date()),
  viewMonth: null, // Date: first day of month
  selectedDate: null, // Date (no time)
  todosById: new Map(), // for selected date
  datesWithTodos: new Set(), // yyyy-mm-dd for current month view
  unsubSelected: null,
  db: null,
  initialized: false,
  monthDotsBusy: false,
};

// ---------------------------
// Boot
// ---------------------------
boot();

function boot() {
  state.viewMonth = firstDayOfMonth(state.today);
  state.selectedDate = state.today;

  renderHeader();
  renderCalendar();
  renderSelectedDateLabel();

  wireEvents();

  if (!firebaseConfig) {
    setStatus("Firebase 설정이 비어 있어요. firebase.js에 config를 넣어주세요.", { retry: false });
    showError(
      "Firebase 설정이 없습니다. firebase.js 파일에 firebaseConfig를 붙여넣으면 Firestore 저장/불러오기가 활성화됩니다."
    );
    // Firebase 없이도 UI는 돌아가게 두고, 투두는 동작하지 않게 막는다.
    setLoading(false);
    disableTodoInput(true);
    return;
  }

  tryInitFirebase();
}

function wireEvents() {
  el.prevMonthBtn.addEventListener("click", () => {
    state.viewMonth = addMonths(state.viewMonth, -1);
    renderHeader();
    renderCalendar();
    refreshMonthDots();
  });

  el.nextMonthBtn.addEventListener("click", () => {
    state.viewMonth = addMonths(state.viewMonth, +1);
    renderHeader();
    renderCalendar();
    refreshMonthDots();
  });

  el.jumpTodayBtn.addEventListener("click", () => {
    state.viewMonth = firstDayOfMonth(state.today);
    selectDate(state.today);
    renderHeader();
    renderCalendar();
    refreshMonthDots();
  });

  el.todoForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = el.todoInput.value.trim();
    if (!text) return;
    if (!state.db) return;

    await withUiBusy(async () => {
      await addTodo(text);
      el.todoInput.value = "";
      el.todoInput.focus();
    });
  });

  el.retryBtn.addEventListener("click", () => {
    hideError();
    tryInitFirebase();
  });
}

function tryInitFirebase() {
  try {
    setStatus("Firebase 연결 중…", { retry: false });
    setLoading(true);
    disableTodoInput(true);

    const app = initializeApp(firebaseConfig);
    // Analytics는 선택 기능이며(필수 아님), 환경에 따라 지원되지 않을 수 있어 안전하게 처리합니다.
    if (firebaseConfig?.measurementId) {
      analyticsIsSupported()
        .then((ok) => {
          if (ok) getAnalytics(app);
        })
        .catch(() => {
          // ignore
        });
    }
    state.db = getFirestore(app);
    state.initialized = true;

    const pid = firebaseConfig?.projectId ? String(firebaseConfig.projectId) : "unknown-project";
    setStatus(`연결됨 (${pid})`, { retry: false });
    disableTodoInput(false);

    // 구독 시작
    subscribeSelectedDate();
    refreshMonthDots();
  } catch (err) {
    console.error(err);
    state.db = null;
    state.initialized = false;
    setStatus("연결 실패", { retry: true });
    showError("Firebase 초기화에 실패했어요. firebase.js 설정값을 확인해 주세요.");
    setLoading(false);
    disableTodoInput(true);
  }
}

// ---------------------------
// Calendar render
// ---------------------------
function renderHeader() {
  const y = state.viewMonth.getFullYear();
  const m = state.viewMonth.getMonth() + 1;
  el.monthLabel.textContent = `${y}년 ${m}월`;
  el.todayHint.textContent = `오늘: ${formatKoreanDate(state.today)}`;
}

function renderCalendar() {
  const grid = el.calendarGrid;
  grid.innerHTML = "";

  const first = firstDayOfMonth(state.viewMonth);
  const start = startOfCalendarGrid(first);
  const end = endOfCalendarGrid(first);

  const cursor = new Date(start);
  while (cursor <= end) {
    const isOutside = cursor.getMonth() !== first.getMonth();
    const iso = toIsoDate(cursor);

    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "day";
    if (isOutside) cell.classList.add("day--outside");
    if (sameDate(cursor, state.today)) cell.classList.add("day--today");
    if (sameDate(cursor, state.selectedDate)) cell.classList.add("day--selected");
    if (state.datesWithTodos.has(iso)) cell.classList.add("day--hasTodos");

    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-label", `${formatKoreanDate(cursor)} 선택`);
    cell.dataset.iso = iso;
    cell.addEventListener("click", () => {
      const d = parseIsoDate(cell.dataset.iso);
      selectDate(d);
    });

    const num = document.createElement("div");
    num.className = "day__num";
    num.textContent = String(cursor.getDate());

    const dot = document.createElement("div");
    dot.className = "day__dot";
    dot.setAttribute("aria-hidden", "true");

    cell.appendChild(num);
    cell.appendChild(dot);
    grid.appendChild(cell);

    cursor.setDate(cursor.getDate() + 1);
  }
}

function selectDate(dateNoTime) {
  state.selectedDate = stripTime(dateNoTime);
  renderSelectedDateLabel();
  renderCalendar();
  subscribeSelectedDate();
}

function renderSelectedDateLabel() {
  el.selectedDateLabel.textContent = formatKoreanDate(state.selectedDate);
}

function startOfCalendarGrid(firstOfMonth) {
  const start = new Date(firstOfMonth);
  const weekday = start.getDay(); // 0: Sun
  start.setDate(start.getDate() - weekday);
  return stripTime(start);
}

function endOfCalendarGrid(firstOfMonth) {
  const last = lastDayOfMonth(firstOfMonth);
  const end = new Date(last);
  const weekday = end.getDay();
  end.setDate(end.getDate() + (6 - weekday));
  return stripTime(end);
}

// ---------------------------
// Firestore: selected date subscription
// ---------------------------
function subscribeSelectedDate() {
  if (!state.db) return;

  if (state.unsubSelected) {
    state.unsubSelected();
    state.unsubSelected = null;
  }

  const iso = toIsoDate(state.selectedDate);
  const ref = doc(state.db, "todos", iso);

  setLoading(true);
  hideError();

  state.unsubSelected = onSnapshot(
    ref,
    (snap) => {
      const data = snap.exists() ? snap.data() : null;
      const items = Array.isArray(data?.items) ? data.items : [];
      state.todosById = new Map(items.map((t) => [t.id, t]));
      renderTodos();
      setLoading(false);

      // 선택한 날짜에 투두가 생기거나 없어지면 점 표시 갱신
      if (items.length > 0) state.datesWithTodos.add(iso);
      else state.datesWithTodos.delete(iso);
      renderCalendar();
    },
    (err) => {
      console.error(err);
      const code = err?.code ? String(err.code) : "unknown";
      const iso = toIsoDate(state.selectedDate);
      const pid = firebaseConfig?.projectId ? String(firebaseConfig.projectId) : "unknown-project";

      if (code === "permission-denied") {
        showError(
          `권한이 거부됐어요(permission-denied).\n\n` +
            `1) Firebase 콘솔에서 현재 프로젝트가 "${pid}"인지 확인\n` +
            `2) Firestore Database → Rules 탭에 아래 Rules를 붙여넣고 Publish\n\n` +
            `rules_version = '2';\n` +
            `service cloud.firestore {\n` +
            `  match /databases/{database}/documents {\n` +
            `    match /todos/{dateId} {\n` +
            `      allow read, write: if dateId.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$');\n` +
            `    }\n` +
            `    match /{document=**} {\n` +
            `      allow read, write: if false;\n` +
            `    }\n` +
            `  }\n` +
            `}\n\n` +
            `요청 경로: /todos/${iso}`
        );
      } else if (code === "unavailable") {
        showError("네트워크/Firestore 서비스가 일시적으로 unavailable 상태예요. 인터넷 연결 후 다시 시도해 주세요.");
      } else if (code === "failed-precondition") {
        showError("Firestore가 아직 준비되지 않았어요(failed-precondition). Firestore Database가 생성/활성화됐는지 확인해 주세요.");
      } else {
        showError(`데이터를 불러오지 못했어요. (code: ${code}) Firestore 규칙/네트워크를 확인해 주세요.`);
      }
      setLoading(false);
    }
  );
}

async function addTodo(text) {
  const iso = toIsoDate(state.selectedDate);
  const ref = doc(state.db, "todos", iso);
  const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random().toString(16).slice(2);

  const existingSnap = await getDoc(ref);
  const existing = existingSnap.exists() ? existingSnap.data() : { items: [] };
  const items = Array.isArray(existing.items) ? existing.items.slice() : [];

  items.push({
    id,
    text,
    completed: false,
    createdAt: Date.now(),
  });

  await setDoc(
    ref,
    {
      items,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

async function toggleTodo(id, completed) {
  const iso = toIsoDate(state.selectedDate);
  const ref = doc(state.db, "todos", iso);
  const existingSnap = await getDoc(ref);
  const existing = existingSnap.exists() ? existingSnap.data() : { items: [] };
  const items = Array.isArray(existing.items) ? existing.items.slice() : [];

  const idx = items.findIndex((t) => t.id === id);
  if (idx < 0) return;
  items[idx] = { ...items[idx], completed };

  await setDoc(ref, { items, updatedAt: serverTimestamp() }, { merge: true });
}

async function deleteTodo(id) {
  const iso = toIsoDate(state.selectedDate);
  const ref = doc(state.db, "todos", iso);
  const existingSnap = await getDoc(ref);
  const existing = existingSnap.exists() ? existingSnap.data() : { items: [] };
  const items = Array.isArray(existing.items) ? existing.items.slice() : [];
  const next = items.filter((t) => t.id !== id);

  await setDoc(ref, { items: next, updatedAt: serverTimestamp() }, { merge: true });
}

// ---------------------------
// Firestore: month dots
// ---------------------------
async function refreshMonthDots() {
  if (!state.db) return;
  if (state.monthDotsBusy) return;
  state.monthDotsBusy = true;

  try {
    const first = firstDayOfMonth(state.viewMonth);
    const startId = toIsoDate(first);
    const endId = toIsoDate(lastDayOfMonth(first));

    const q = query(
      collection(state.db, "todos"),
      orderBy(documentId()),
      startAt(startId),
      endAt(endId)
    );

    const snaps = await getDocs(q);
    const set = new Set();
    snaps.forEach((s) => {
      const data = s.data();
      const items = Array.isArray(data?.items) ? data.items : [];
      if (items.length > 0) set.add(s.id);
    });
    state.datesWithTodos = set;
    renderCalendar();
  } catch (err) {
    console.error(err);
    // 점 표시 실패는 치명적이지 않으니 UI만 유지
  } finally {
    state.monthDotsBusy = false;
  }
}

// ---------------------------
// Todos render + events
// ---------------------------
function renderTodos() {
  el.todoList.innerHTML = "";

  const todos = Array.from(state.todosById.values()).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  el.todoCount.textContent = `${todos.length}개`;

  if (todos.length === 0) {
    const empty = document.createElement("li");
    empty.className = "metaText";
    empty.textContent = "아직 할 일이 없어요. 위에서 추가해 보세요.";
    el.todoList.appendChild(empty);
    return;
  }

  for (const t of todos) {
    const li = document.createElement("li");
    li.className = "todoItem";
    if (t.completed) li.classList.add("todoItem--done");

    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "todoItem__check";
    check.checked = !!t.completed;
    check.addEventListener("change", async () => {
      if (!state.db) return;
      await withUiBusy(async () => {
        await toggleTodo(t.id, check.checked);
      });
    });

    const text = document.createElement("div");
    text.className = "todoItem__text";
    text.textContent = t.text;

    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn todoItem__delete";
    del.textContent = "삭제";
    del.addEventListener("click", async () => {
      if (!state.db) return;
      await withUiBusy(async () => {
        await deleteTodo(t.id);
      });
    });

    li.appendChild(check);
    li.appendChild(text);
    li.appendChild(del);
    el.todoList.appendChild(li);
  }
}

// ---------------------------
// UI helpers
// ---------------------------
function setLoading(on) {
  el.loadingRow.hidden = !on;
}

function showError(msg) {
  el.errorBox.textContent = msg;
  el.errorBox.hidden = false;
}

function hideError() {
  el.errorBox.hidden = true;
  el.errorBox.textContent = "";
}

function setStatus(text, { retry }) {
  el.statusText.textContent = text;
  el.retryBtn.hidden = !retry;
}

function disableTodoInput(disabled) {
  el.todoInput.disabled = disabled;
  el.todoForm.querySelector("button[type='submit']").disabled = disabled;
}

async function withUiBusy(fn) {
  hideError();
  setLoading(true);
  disableTodoInput(true);
  try {
    await fn();
  } catch (err) {
    console.error(err);
    showError("작업에 실패했어요. 잠시 후 다시 시도해 주세요.");
  } finally {
    setLoading(false);
    disableTodoInput(false);
  }
}

// ---------------------------
// Date helpers
// ---------------------------
function stripTime(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function firstDayOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function lastDayOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function addMonths(d, delta) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

function sameDate(a, b) {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toIsoDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseIsoDate(iso) {
  const [y, m, d] = iso.split("-").map((x) => Number(x));
  return new Date(y, m - 1, d);
}

function formatKoreanDate(d) {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return `${y}년 ${m}월 ${day}일 (${weekday})`;
}

