// ===== VERSÃO DO ARQUIVO =====
// Toda vez que eu mexer nesse arquivo, esse valor muda.
// Se precisar confirmar se está com a versão mais nova, procura por "APP_VERSION".
const APP_VERSION = "2026-09-02-01";
console.log("Weekly Tracker — script.js versão:", APP_VERSION);

// ===== CONFIG =====
// Cole aqui o UID da SUA conta (use o botão "<i class="fa-solid fa-key"></i> Meu UID" no menu depois de logar).
// Só essa conta vai ver/poder usar os botões de ADM.
const ADMIN_UID = "TpNnTJ77XuejJMjuFjjbjFXIIWE3";
const ADM_PASSWORD = "1234"; // camada extra: mesmo sendo ADM, ainda pede senha pra agir

const DAILY_POOL = 1000;
const YEAR_TOTAL_XP = 365000;
const MAX_LEVEL_FOR_TOTAL = 65;
const TASK_CAP_IMMEDIATE = 10; // até esse número, tarefa nova já vale essa semana

const THRESHOLD_BONUS = { 50: 10, 80: 25, 100: 50 };
const STREAK_BONUS_7 = 150;
const STREAK_BONUS_30 = 750;

const dayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const quotes = [
  "Disciplina é orar com ações.",
  "Quem é fiel no pouco domina o muito.",
  "Constância vence talento disperso.",
  "Deus honra quem honra o processo.",
  "Você não treina por motivação, mas por identidade.",
  "A constância é uma forma de fé.",
  "Hoje você honra o que pediu ontem.",
  "Obediência precede resultados.",
  "O foco é um altar.",
  "Você já decidiu quem quer ser."
];
// fim quotes

const firebaseConfig = {
  apiKey: "AIzaSyA8wXVboOeJ538f4XcKtoRwdyKyUz1QlqE",
  authDomain: "teste-2daf8.firebaseapp.com",
  projectId: "teste-2daf8",
  storageBucket: "teste-2daf8.firebasestorage.app",
  messagingSenderId: "820107636215",
  appId: "1:820107636215:web:9b2fd3b7408a42513212f2",
  measurementId: "G-X27XSZEXEC"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {
  auth.setPersistence(firebase.auth.Auth.Persistence.NONE);
});

let currentUser = null;
let currentNickname = null;
let authMode = "login";
let currentUid = "guest"; // namespace de armazenamento local — troca quando troca de conta
let viewedProfileUid = null; // quando != null, a tela de perfil mostra o perfil de outra pessoa
let profileEditMode = false;
// fim firebase setup

function isAdmin() {
  return !!currentUser && currentUser.uid === ADMIN_UID;
}
// fim isAdmin

// ===== NOTIFICAÇÕES =====
function createNotification(toUid, type, title, message, meta) {
  if (!toUid) return;
  db.collection("notifications").add({
    toUid, type, title, message, meta: meta || {}, read: false, createdAt: Date.now()
  }).catch(e => console.error(e));
}
// fim createNotification

function notifySharedAgendaMembers(message, excludeUid) {
  if (!sharedAgendaMembers || sharedAgendaMembers.length === 0) return;
  sharedAgendaMembers.forEach(uid => {
    if (uid === (excludeUid || currentUser.uid)) return;
    createNotification(uid, "shared_agenda_update", "Agenda Compartilhada", message);
  });
}
// fim notifySharedAgendaMembers

function refreshNotifBadge() {
  const badge = document.getElementById("notifBadge");
  if (!currentUser) { badge.classList.add("hidden"); return; }
  db.collection("notifications").where("toUid", "==", currentUser.uid).where("read", "==", false).get().then(snap => {
    if (snap.size > 0) {
      badge.textContent = snap.size > 9 ? "9+" : String(snap.size);
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  });
}
// fim refreshNotifBadge

function loadNotificationsScreen() {
  const content = document.getElementById("notificationsContent");
  if (!currentUser) { content.innerHTML = "<p>Faça login pra ver notificações.</p>"; return; }
  content.innerHTML = "<p>Carregando...</p>";

  db.collection("notifications").where("toUid", "==", currentUser.uid).orderBy("createdAt", "desc").limit(50).get().then(snap => {
    let rows = "";
    const batch = db.batch();
    let hasUnread = false;

    snap.forEach(d => {
      const data = d.data();
      const date = new Date(data.createdAt).toLocaleString("pt-BR");
      rows += `
        <div class="friend-row" style="flex-direction:column; align-items:flex-start; ${data.read ? "opacity:.6;" : ""}">
          <strong>${data.title}</strong>
          <span style="font-size:11px; opacity:.7;">${date}</span>
          <p style="margin:6px 0 0 0; font-size:13px;">${data.message}</p>
        </div>`;
      if (!data.read) {
        hasUnread = true;
        batch.update(d.ref, { read: true });
      }
    });

    content.innerHTML = rows || "<p style='font-size:12px;opacity:.7;'>Nenhuma notificação ainda.</p>";

    if (hasUnread) {
      batch.commit().then(() => refreshNotifBadge());
    }
  }).catch(e => {
    content.innerHTML = `<p>Erro: ${e.message}</p>`;
  });
}
// fim loadNotificationsScreen

// ===== NAVEGAÇÃO ENTRE TELAS =====
const SCREEN_IDS = {
  home: "screenHome", stats: "screenStats", profile: "screenProfile",
  ranking: "screenRanking", hallOfFame: "screenHallOfFame",
  duel: "screenDuel", friends: "screenFriends", admin: "screenAdmin",
  help: "screenHelp", notifications: "screenNotifications", settings: "screenSettings",
  checklist: "screenChecklist", chat: "screenChat", agenda: "screenAgenda"
};

function showScreen(name) {
  Object.keys(SCREEN_IDS).forEach(key => {
    document.getElementById(SCREEN_IDS[key]).classList.toggle("hidden", key !== name);
  });
  window.scrollTo(0, 0);
  closeSidebar();
  if (name !== "chat" && chatUnsubscribe) { chatUnsubscribe(); chatUnsubscribe = null; }
  if (name === "profile") loadProfileScreen();
  if (name === "ranking") loadRankingScreen();
  if (name === "hallOfFame") loadHallOfFameScreen();
  if (name === "duel") loadDuelScreen();
  if (name === "friends") loadFriendsScreen();
  if (name === "admin") renderAdminScreen();
  if (name === "stats") { buildBars(); calculateWeekScore(); renderPastWeekTabs(); }
  if (name === "notifications") loadNotificationsScreen();
  if (name === "checklist") loadChecklistScreen();
  if (name === "agenda") loadAgendaScreen();
}
// fim showScreen

function openMyProfile() {
  viewedProfileUid = null;
  profileEditMode = false;
  showScreen("profile");
}
// fim openMyProfile

function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  sidebar.classList.contains("open") ? closeSidebar() : openSidebar();
}
function openSidebar() {
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("sidebarBackdrop").classList.remove("hidden");
}
function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebarBackdrop").classList.add("hidden");
}
// fim sidebar

function slugRank(rankName) {
  const r = RANKS.find(r => r.name === rankName);
  return r ? r.class : "rank-soldado";
}
// fim slugRank

function awardMedal(rankName) {
  if (!currentUser) return;
  const payload = {
    medals: firebase.firestore.FieldValue.arrayUnion({ rank: rankName, date: todayKey })
  };
  if (rankName === "Marechal") payload.hasMarechalMedal = true;
  db.collection("users").doc(currentUser.uid).update(payload).catch(e => console.error(e));
}
// fim awardMedal

function renderStreakDisplay() {
  const el = document.getElementById("streakDisplay");
  if (!el) return;
  const streak = parseInt(localStorage.getItem(`wt_streak_${currentUid}`)) || 0;
  el.innerText = streak > 0 ? `🔥 ${streak} dia${streak > 1 ? "s" : ""} de streak` : "";
}
// fim renderStreakDisplay

// ===== PATENTES =====
const RANKS = [
  { name: "Soldado", minLevel: 1, class: "rank-soldado" },
  { name: "Cabo", minLevel: 3, class: "rank-cabo" },
  { name: "3º Sargento", minLevel: 6, class: "rank-sargento" },
  { name: "2º Sargento", minLevel: 8, class: "rank-sargento" },
  { name: "1º Sargento", minLevel: 10, class: "rank-sargento" },
  { name: "Subtenente", minLevel: 13, class: "rank-subtenente" },
  { name: "Aspirante", minLevel: 16, class: "rank-aspirante" },
  { name: "2º Tenente", minLevel: 20, class: "rank-oficial" },
  { name: "1º Tenente", minLevel: 24, class: "rank-oficial" },
  { name: "Capitão", minLevel: 28, class: "rank-capitao" },
  { name: "Major", minLevel: 32, class: "rank-major" },
  { name: "Tenente-Coronel", minLevel: 36, class: "rank-coronel" },
  { name: "Coronel", minLevel: 40, class: "rank-coronel" },
  { name: "General de Brigada", minLevel: 45, class: "rank-general" },
  { name: "General de Divisão", minLevel: 50, class: "rank-general" },
  { name: "General de Exército", minLevel: 55, class: "rank-general" },
  { name: "General de Exército Sênior", minLevel: 60, class: "rank-general-senior" },
  { name: "Marechal", minLevel: 65, class: "rank-marechal" } // honorário
];

function getRankFromLevel(level) {
  let currentRank = RANKS[0].name;
  for (let i = 0; i < RANKS.length; i++) {
    if (level >= RANKS[i].minLevel) currentRank = RANKS[i].name;
  }
  return currentRank;
}
// fim getRankFromLevel

function getXPForNextLevel(level) {
  return Math.round(YEAR_TOTAL_XP * (level * level) / (MAX_LEVEL_FOR_TOTAL * MAX_LEVEL_FOR_TOTAL));
}
// fim getXPForNextLevel

function getLevelFromXP(xp) {
  let level = 1;
  while (xp >= getXPForNextLevel(level)) level++;
  return level - 1;
}
// fim getLevelFromXP

// ===== DATAS =====
function toDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function getSundayOf(d) {
  const copy = new Date(d);
  copy.setHours(0,0,0,0);
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}
function addDays(d, n) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}
// fim datas

const today = new Date();
today.setHours(0,0,0,0);
const todayKey = toDateKey(today);
const currentSunday = getSundayOf(today);
const currentSundayKey = toDateKey(currentSunday);

// ===== ESTADO (isolado por conta) =====
let tasks = [];
let pendingTasks = [];
let history = {};
let xp = 0;
let weekStart = null;
let lastRank = null;
let subtaskBlocks = [];

let openTaskId = null;
let adminDayMode = false;
let taskManagerTab = "tasks";
let openLinkTaskId = null;
let openSubtaskBlockId = null;
let checklists = [];
let agendaItems = [];
let openChecklistId = null;
let currentChatId = null;
let currentChatOtherUid = null;
let currentChatOtherNick = "";
let chatUnsubscribe = null;

function migrateSubtaskData(blocks, taskList) {
  // Formato antigo: cada "bloco" era, na real, uma subtarefa solta (sem "items").
  // Migração: vira um bloco com 1 item dentro, MESMO id — histórico e links continuam valendo.
  const migratedBlocks = (blocks || []).map(b => {
    if (b.items) return b;
    return { id: b.id, name: b.name, items: [{ id: b.id, name: b.name }] };
  });
  const migratedTasks = (taskList || []).map(t => ({
    ...t,
    linkedBlocks: t.linkedBlocks || t.linkedSubtasks || []
  }));
  return { blocks: migratedBlocks, tasks: migratedTasks };
}
// fim migrateSubtaskData

function loadStateForCurrentUser() {
  tasks = JSON.parse(localStorage.getItem(`wt_tasks_${currentUid}`)) || [];
  pendingTasks = JSON.parse(localStorage.getItem(`wt_pendingTasks_${currentUid}`)) || [];
  history = JSON.parse(localStorage.getItem(`wt_history_${currentUid}`)) || {};
  xp = parseInt(localStorage.getItem(`wt_xp_${currentUid}`)) || 0;
  weekStart = localStorage.getItem(`wt_weekStart_${currentUid}`) || null;
  lastRank = localStorage.getItem(`wt_lastRank_${currentUid}`);
  subtaskBlocks = JSON.parse(localStorage.getItem(`wt_subtaskBlocks_${currentUid}`)) || [];
  checklists = JSON.parse(localStorage.getItem(`wt_checklists_${currentUid}`)) || [];
  agendaItems = JSON.parse(localStorage.getItem(`wt_agendaItems_${currentUid}`)) || [];
  openTaskId = null;
  adminDayMode = false;
  taskManagerTab = "tasks";
  openLinkTaskId = null;
  openSubtaskBlockId = null;
  openChecklistId = null;

  const migrated = migrateSubtaskData(subtaskBlocks, tasks);
  subtaskBlocks = migrated.blocks;
  tasks = migrated.tasks.map(t => ({ ...t, days: (t.days && t.days.length) ? t.days : [0,1,2,3,4,5,6] }));
  const migratedPending = migrateSubtaskData(subtaskBlocks, pendingTasks);
  pendingTasks = migratedPending.tasks.map(t => ({ ...t, days: (t.days && t.days.length) ? t.days : [0,1,2,3,4,5,6] }));

  if (weekStart !== currentSundayKey) {
    if (pendingTasks.length > 0) {
      tasks = tasks.concat(pendingTasks);
      pendingTasks = [];
    }
    weekStart = currentSundayKey;
  }
  saveLocalOnly();
}
// fim loadStateForCurrentUser

function saveLocalOnly() {
  localStorage.setItem(`wt_tasks_${currentUid}`, JSON.stringify(tasks));
  localStorage.setItem(`wt_pendingTasks_${currentUid}`, JSON.stringify(pendingTasks));
  localStorage.setItem(`wt_history_${currentUid}`, JSON.stringify(history));
  localStorage.setItem(`wt_xp_${currentUid}`, xp);
  localStorage.setItem(`wt_weekStart_${currentUid}`, weekStart);
  localStorage.setItem(`wt_subtaskBlocks_${currentUid}`, JSON.stringify(subtaskBlocks));
  localStorage.setItem(`wt_checklists_${currentUid}`, JSON.stringify(checklists));
  localStorage.setItem(`wt_agendaItems_${currentUid}`, JSON.stringify(agendaItems));
}
// fim saveLocalOnly

function saveState() {
  saveLocalOnly();
  syncTasksToFirestore();
}
// fim saveState

// ===== TAREFAS =====
function addTask() {
  const input = document.getElementById("newTaskInput");
  const name = input.value.trim();
  if (!name) return;

  const task = { id: "t" + Date.now() + Math.floor(Math.random() * 1000), name, days: [0,1,2,3,4,5,6], linkedBlocks: [] };

  if (tasks.length < TASK_CAP_IMMEDIATE) {
    tasks.push(task);
  } else {
    pendingTasks.push(task);
  }

  input.value = "";
  saveState();
  render();
}
// fim addTask

function toggleTaskActions(id) {
  openTaskId = (openTaskId === id) ? null : id;
  renderTaskManager();
}
// fim toggleTaskActions

function toggleTaskDay(id, dayIndex) {
  const task = tasks.find(t => t.id === id) || pendingTasks.find(t => t.id === id);
  if (!task) return;
  if (!task.days) task.days = [0,1,2,3,4,5,6];
  const idx = task.days.indexOf(dayIndex);
  if (idx === -1) {
    task.days.push(dayIndex);
  } else {
    if (task.days.length === 1) { showToast("A tarefa precisa valer pelo menos 1 dia."); return; }
    task.days.splice(idx, 1);
  }
  saveState();
  render();
}
// fim toggleTaskDay

function dayOfWeekFromKey(dateKey) {
  for (let i = 0; i < 7; i++) {
    if (toDateKey(addDays(currentSunday, i)) === dateKey) return i;
  }
  return null;
}
// fim dayOfWeekFromKey

function taskAppliesOnDate(task, date) {
  const type = task.scheduleType || "weekly";
  if (type === "once") return toDateKey(date) === task.onceDate;
  if (type === "monthly") return date.getDate() === task.monthDay;
  return (task.days || [0,1,2,3,4,5,6]).includes(date.getDay());
}
// fim taskAppliesOnDate

function activeTasksOnDate(dateKey) {
  const date = new Date(dateKey + "T00:00:00");
  return tasks.filter(t => taskAppliesOnDate(t, date));
}
// fim activeTasksOnDate

// ===== SUBTAREFAS (bloco com subtarefas dentro) =====
function addSubtaskBlock() {
  const input = document.getElementById("newSubtaskInput");
  const name = input.value.trim();
  if (!name) return;
  subtaskBlocks.push({ id: "blk" + Date.now() + Math.floor(Math.random() * 1000), name, items: [] });
  input.value = "";
  saveState();
  render();
}
// fim addSubtaskBlock

function addItemToBlock(blockId) {
  const input = document.getElementById(`newItemInput_${blockId}`);
  const name = input.value.trim();
  if (!name) return;
  const block = subtaskBlocks.find(b => b.id === blockId);
  if (!block) return;
  if (!block.items) block.items = [];
  block.items.push({ id: "it" + Date.now() + Math.floor(Math.random() * 1000), name });
  input.value = "";
  saveState();
  render();
}
// fim addItemToBlock

function deleteItemFromBlock(blockId, itemId) {
  const block = subtaskBlocks.find(b => b.id === blockId);
  if (!block) return;
  block.items = (block.items || []).filter(it => it.id !== itemId);
  saveState();
  render();
}
// fim deleteItemFromBlock

function toggleSubtaskBlockOpen(id) {
  openSubtaskBlockId = (openSubtaskBlockId === id) ? null : id;
  renderTaskManager();
}
// fim toggleSubtaskBlockOpen

function deleteSubtaskBlock(id) {
  openModal({
    title: "Excluir esse bloco de subtarefas? Ele será removido de todas as tarefas que o usam.",
    type: "confirm",
    confirmLabel: "Excluir",
    onConfirm: () => {
      subtaskBlocks = subtaskBlocks.filter(b => b.id !== id);
      tasks.forEach(t => { if (t.linkedBlocks) t.linkedBlocks = t.linkedBlocks.filter(bid => bid !== id); });
      saveState();
      render();
    }
  });
}
// fim deleteSubtaskBlock

function switchTaskManagerTab(tab) {
  taskManagerTab = tab;
  render();
}
// fim switchTaskManagerTab

function toggleLinkPanel(taskId) {
  openLinkTaskId = (openLinkTaskId === taskId) ? null : taskId;
  renderTaskManager();
}
// fim toggleLinkPanel

function toggleLinkBlock(taskId, blockId) {
  const task = tasks.find(t => t.id === taskId) || pendingTasks.find(t => t.id === taskId);
  if (!task) return;
  if (!task.linkedBlocks) task.linkedBlocks = [];
  const idx = task.linkedBlocks.indexOf(blockId);
  if (idx === -1) task.linkedBlocks.push(blockId);
  else task.linkedBlocks.splice(idx, 1);
  saveState();
  render();
}
// fim toggleLinkBlock

function taskCompletionFraction(task, dateKey) {
  const blockIds = task.linkedBlocks || [];
  if (blockIds.length > 0) {
    const subState = (history[dateKey] && history[dateKey].subtasks) || {};
    let total = 0, done = 0;
    blockIds.forEach(bid => {
      const block = subtaskBlocks.find(b => b.id === bid);
      if (!block) return;
      (block.items || []).forEach(item => {
        total++;
        if (subState[item.id]) done++;
      });
    });
    return total > 0 ? done / total : 0;
  }
  const isDone = !!(history[dateKey] && history[dateKey][task.id]);
  return isDone ? 1 : 0;
}
// fim taskCompletionFraction

function recalcTaskXP(taskId, dateKey) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  const activeTasks = activeTasksOnDate(dateKey);
  const perTask = activeTasks.length > 0 ? DAILY_POOL / activeTasks.length : 0;
  const fraction = taskCompletionFraction(task, dateKey);
  const newValue = Math.round(perTask * fraction);

  if (!history[dateKey]) history[dateKey] = {};
  if (!history[dateKey]._taskXP) history[dateKey]._taskXP = {};
  const oldValue = history[dateKey]._taskXP[taskId] || 0;

  xp = Math.max(0, xp + (newValue - oldValue));
  history[dateKey]._taskXP[taskId] = newValue;
}
// fim recalcTaskXP

function toggleSubtask(itemId, dateKey) {
  const canEdit = (dateKey === todayKey) || adminDayMode;
  if (!canEdit) return;

  if (!history[dateKey]) history[dateKey] = {};
  if (!history[dateKey].subtasks) history[dateKey].subtasks = {};
  history[dateKey].subtasks[itemId] = !history[dateKey].subtasks[itemId];

  tasks.forEach(t => {
    const usesIt = (t.linkedBlocks || []).some(bid => {
      const block = subtaskBlocks.find(b => b.id === bid);
      return block && (block.items || []).some(it => it.id === itemId);
    });
    if (usesIt) recalcTaskXP(t.id, dateKey);
  });

  recalcThresholdBonus(dateKey);
  saveState();
  updateLevelUI();
  render();
}
// fim toggleSubtask


// ===== CHECKLIST LIVRE (mercado, farmácia, etc — sem XP, sem ligação com tarefas) =====
function addChecklist() {
  const input = document.getElementById("newChecklistInput");
  const name = input.value.trim();
  if (!name) return;
  checklists.push({ id: "cl" + Date.now() + Math.floor(Math.random() * 1000), name, items: [] });
  input.value = "";
  saveState();
  loadChecklistScreen();
}
// fim addChecklist

function deleteChecklist(id) {
  openModal({
    title: "Excluir esse checklist inteiro?",
    type: "confirm",
    confirmLabel: "Excluir",
    onConfirm: () => {
      checklists = checklists.filter(c => c.id !== id);
      saveState();
      loadChecklistScreen();
    }
  });
}
// fim deleteChecklist

function toggleChecklistOpen(id) {
  openChecklistId = (openChecklistId === id) ? null : id;
  loadChecklistScreen();
}
// fim toggleChecklistOpen

function addChecklistItem(checklistId) {
  const input = document.getElementById(`newChecklistItemInput_${checklistId}`);
  const name = input.value.trim();
  if (!name) return;
  const list = checklists.find(c => c.id === checklistId);
  if (!list) return;
  if (!list.items) list.items = [];
  list.items.push({ id: "cli" + Date.now() + Math.floor(Math.random() * 1000), name, done: false });
  input.value = "";
  saveState();
  loadChecklistScreen();
}
// fim addChecklistItem

function toggleChecklistItem(checklistId, itemId) {
  const list = checklists.find(c => c.id === checklistId);
  if (!list) return;
  const item = (list.items || []).find(i => i.id === itemId);
  if (!item) return;
  item.done = !item.done;
  saveState();
  loadChecklistScreen();
}
// fim toggleChecklistItem

function deleteChecklistItem(checklistId, itemId) {
  const list = checklists.find(c => c.id === checklistId);
  if (!list) return;
  list.items = (list.items || []).filter(i => i.id !== itemId);
  saveState();
  loadChecklistScreen();
}
// fim deleteChecklistItem

function clearCheckedItems(checklistId) {
  const list = checklists.find(c => c.id === checklistId);
  if (!list) return;
  (list.items || []).forEach(i => { i.done = false; });
  saveState();
  loadChecklistScreen();
}
// fim clearCheckedItems

function deleteAllChecklistItems(checklistId) {
  openModal({
    title: "Excluir TODOS os itens desse checklist? Não tem como desfazer.",
    type: "confirm",
    confirmLabel: "Excluir todos",
    onConfirm: () => {
      const list = checklists.find(c => c.id === checklistId);
      if (!list) return;
      list.items = [];
      saveState();
      loadChecklistScreen();
    }
  });
}
// fim deleteAllChecklistItems

function loadChecklistScreen() {
  const body = document.getElementById("checklistManagerBody");
  const list = document.getElementById("checklistListBody");
  if (!body || !list) return;

  body.innerHTML = `
    <input type="text" id="newChecklistInput" placeholder="Nome do checklist (ex: Mercado)">
    <button class="aura-btn" onclick="addChecklist()"><i class="fa-solid fa-plus"></i> Criar checklist</button>
  `;

  list.innerHTML = "";
  checklists.forEach(cl => {
    const isOpen = openChecklistId === cl.id;
    const items = cl.items || [];
    const doneCount = items.filter(i => i.done).length;

    list.innerHTML += `
      <div class="task-row" onclick="toggleChecklistOpen('${cl.id}')">
        <i class="fa-solid fa-list-check"></i> ${cl.name}
        <span style="font-size:10px; opacity:.7; margin-left:6px;">(${doneCount}/${items.length})</span>
        ${isOpen ? `
          <div class="task-actions" onclick="event.stopPropagation();">
            <button class="aura-btn" onclick="clearCheckedItems('${cl.id}')"><i class="fa-solid fa-broom"></i> Limpar marcados</button>
            <button class="aura-btn" onclick="shareChecklistViaChat('${cl.id}')"><i class="fa-solid fa-share"></i> Compartilhar</button>
            <button class="aura-danger" onclick="deleteAllChecklistItems('${cl.id}')"><i class="fa-solid fa-trash-can"></i> Excluir todos</button>
            <button class="aura-danger" onclick="deleteChecklist('${cl.id}')"><i class="fa-solid fa-trash"></i> Excluir</button>
          </div>
          <div class="task-days-row" onclick="event.stopPropagation();" style="flex-direction:column; align-items:stretch;">
            <input type="text" id="newChecklistItemInput_${cl.id}" placeholder="Novo item">
            <button class="aura-btn" onclick="addChecklistItem('${cl.id}')"><i class="fa-solid fa-plus"></i> Adicionar item</button>
            ${items.map(item => `
              <div class="friend-row" style="cursor:pointer;" onclick="toggleChecklistItem('${cl.id}', '${item.id}')">
                <span style="${item.done ? "opacity:.5; text-decoration:line-through;" : ""}">
                  ${item.done ? '<i class="fa-solid fa-square-check"></i>' : '<i class="fa-regular fa-square"></i>'} ${item.name}
                </span>
                <button class="menu-btn-small menu-btn-danger" onclick="event.stopPropagation(); deleteChecklistItem('${cl.id}', '${item.id}')"><i class="fa-solid fa-trash"></i></button>
              </div>
            `).join("")}
          </div>` : ""}
      </div>`;
  });

  if (checklists.length === 0) {
    list.innerHTML = `<p style="font-size:12px; opacity:.7; margin-top:10px;">Nenhum checklist ainda. Crie um acima ☝️</p>`;
  }
}
// fim loadChecklistScreen

function editTask(id) {
  const task = tasks.find(t => t.id === id) || pendingTasks.find(t => t.id === id);
  if (!task) return;
  openModal({
    title: "Novo nome da tarefa:",
    type: "text",
    defaultValue: task.name,
    confirmLabel: "Salvar",
    onConfirm: (newName) => {
      if (newName && newName.trim()) {
        task.name = newName.trim();
        saveState();
        render();
      }
    }
  });
}
// fim editTask

function deleteTask(id) {
  openModal({
    title: "Excluir essa tarefa? O XP já ganho com ela continua salvo no seu total, só o histórico de marcações dela some.",
    type: "confirm",
    confirmLabel: "Sim, excluir",
    onConfirm: () => {
      tasks = tasks.filter(t => t.id !== id);
      pendingTasks = pendingTasks.filter(t => t.id !== id);
      Object.keys(history).forEach(dateKey => {
        if (history[dateKey][id] !== undefined) delete history[dateKey][id];
      });
      openTaskId = null;
      saveState();
      render();
      showToast("Tarefa excluída.");
    }
  });
}
// fim deleteTask

// ===== BÔNUS DE LIMIAR DIÁRIO (50/80/100%) =====
function recalcThresholdBonus(dateKey) {
  const activeTasks = activeTasksOnDate(dateKey);
  if (activeTasks.length === 0 || !history[dateKey]) return;

  let sumFraction = 0;
  activeTasks.forEach(t => { sumFraction += taskCompletionFraction(t, dateKey); });
  const percent = Math.round(sumFraction / activeTasks.length * 100);

  if (!history[dateKey]._bonus) history[dateKey]._bonus = {};

  Object.keys(THRESHOLD_BONUS).forEach(thStr => {
    const th = parseInt(thStr);
    const value = THRESHOLD_BONUS[th];
    const already = !!history[dateKey]._bonus[th];
    const qualifies = percent >= th;

    if (qualifies && !already) {
      xp += value;
      history[dateKey]._bonus[th] = true;
    } else if (!qualifies && already) {
      xp = Math.max(0, xp - value);
      history[dateKey]._bonus[th] = false;
    }
  });
}
// fim recalcThresholdBonus

// ===== TOGGLE =====
function toggle(taskId, dateKey) {
  const canEdit = (dateKey === todayKey) || adminDayMode;
  if (!canEdit) return;

  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  const dateObj = new Date(dateKey + "T00:00:00");
  if (!taskAppliesOnDate(task, dateObj)) return;

  if (!history[dateKey]) history[dateKey] = {};
  history[dateKey][taskId] = !history[dateKey][taskId];

  recalcTaskXP(taskId, dateKey);
  recalcThresholdBonus(dateKey);
  saveState();
  updateLevelUI();
  render();
}
// fim toggle

// ===== STREAK =====
function processStreak() {
  const yesterday = addDays(today, -1);
  const yesterdayKey = toDateKey(yesterday);
  const checkedKey = `wt_streakChecked_${currentUid}`;
  const streakKey = `wt_streak_${currentUid}`;

  const lastChecked = localStorage.getItem(checkedKey);
  if (lastChecked === yesterdayKey) return;

  let streak = parseInt(localStorage.getItem(streakKey)) || 0;

  if (history[yesterdayKey] && tasks.length > 0) {
    let done = 0;
    tasks.forEach(t => { if (history[yesterdayKey][t.id]) done++; });
    const percent = Math.round(done / tasks.length * 100);
    streak = (percent >= 60) ? streak + 1 : 0;
  } else {
    streak = 0;
  }

  localStorage.setItem(streakKey, streak);
  localStorage.setItem(checkedKey, yesterdayKey);

  let msg = "";
  if (streak > 0 && streak % 30 === 0) {
    xp += STREAK_BONUS_30;
    msg = `🔥 Streak de ${streak} dias! +${STREAK_BONUS_30} XP`;
  } else if (streak > 0 && streak % 7 === 0) {
    xp += STREAK_BONUS_7;
    msg = `🔥 Streak de ${streak} dias! +${STREAK_BONUS_7} XP`;
  }

  if (msg) {
    saveState();
    showToast(msg);
  }
}
// fim processStreak

// ===== MODO ADM: editar qualquer dia =====
function toggleAdminDayMode() {
  if (!isAdmin()) { showToast("Só o ADM pode usar isso."); return; }
  if (!adminDayMode) {
    openModal({
      title: "Senha de ADM:",
      type: "password",
      confirmLabel: "Entrar",
      onConfirm: (pass) => {
        if (pass !== ADM_PASSWORD) { showToast("❌ Senha incorreta."); return; }
        adminDayMode = true;
        renderAdmBanner();
        buildTable();
        showToast("Modo ADM de dias ativado. Volte pra Home pra editar.");
      }
    });
  } else {
    adminDayMode = false;
    renderAdmBanner();
    buildTable();
  }
}
// fim toggleAdminDayMode

function renderAdmBanner() {
  const banner = document.getElementById("admBanner");
  banner.innerHTML = adminDayMode
    ? `<div class="adm-banner"><i class="fa-solid fa-lock-open"></i> Modo ADM ativo — qualquer dia da semana pode ser marcado/desmarcado. <span style="text-decoration:underline;cursor:pointer;" onclick="toggleAdminDayMode()">Sair</span></div>`
    : "";
}
// fim renderAdmBanner

// ===== NÍVEL / XP / PATENTE =====
function updateLevelUI() {
  const level = getLevelFromXP(xp);
  const currentXP = getXPForNextLevel(level);
  const nextXP = getXPForNextLevel(level + 1);
  const newRank = getRankFromLevel(level);
  const rankData = RANKS.find(r => r.name === newRank);
  const progress = Math.max(0, Math.min(100, Math.round(((xp - currentXP) / (nextXP - currentXP)) * 100)));

  document.getElementById("levelText").innerText = `Lv ${level}`;
  document.getElementById("xpCurrent").innerText = `${xp} XP`;

  const bar = document.getElementById("xpBar");
  const dot = document.getElementById("xpDot");
  bar.style.width = `${progress}%`;
  dot.style.left = `${progress}%`;
  dot.innerText = `${progress}%`;

  const rankEl = document.getElementById("rank");
  const rankChanged = lastRank && newRank !== lastRank;
  rankEl.textContent = newRank;
  rankEl.className = `rank-display ${rankData.class}`;

  if (rankChanged) {
    void rankEl.offsetWidth;
    rankEl.classList.add("rank-up");
    showPromotion(newRank);
    vibrateRankUp();
  }

  lastRank = newRank;
  localStorage.setItem(`wt_lastRank_${currentUid}`, newRank);

  renderStreakDisplay();
  syncXPToFirestore();
}
// fim updateLevelUI

function vibrateRankUp() {
  if (!("vibrate" in navigator)) return;
  navigator.vibrate([120, 80, 200, 80, 320]);
}

function showPromotion(rankName) {
  const overlay = document.getElementById("promotionOverlay");
  document.getElementById("promotionRank").textContent = rankName;
  overlay.classList.remove("hidden");
  setTimeout(() => overlay.classList.add("hidden"), 3000);
}
// fim showPromotion

// ===== RENDER: gerenciador de tarefas =====
function renderTaskManager() {
  const tabs = document.getElementById("taskManagerTabs");
  tabs.innerHTML = `
    <button class="menu-btn-small ${taskManagerTab === "tasks" ? "" : "menu-btn-danger"}" style="${taskManagerTab === "tasks" ? "opacity:1;" : "opacity:.5;"}" onclick="switchTaskManagerTab('tasks')"><i class="fa-solid fa-list-check"></i> Tarefas</button>
    <button class="menu-btn-small" style="${taskManagerTab === "subtasks" ? "opacity:1;" : "opacity:.5;"}" onclick="switchTaskManagerTab('subtasks')"><i class="fa-solid fa-diagram-project"></i> Subtarefas</button>
  `;

  const body = document.getElementById("taskManagerBody");
  const list = document.getElementById("taskListBody");
  const note = document.getElementById("pendingNote");

  if (taskManagerTab === "subtasks") {
    body.innerHTML = `
      <input type="text" id="newSubtaskInput" placeholder="Nome do bloco (ex: Estudar)">
      <button class="aura-btn" onclick="addSubtaskBlock()"><i class="fa-solid fa-plus"></i> Gerar bloco</button>
    `;
    list.innerHTML = "";
    subtaskBlocks.forEach(block => {
      const isBlockOpen = openSubtaskBlockId === block.id;
      const items = block.items || [];
      const usedBy = tasks.filter(t => t.linkedBlocks && t.linkedBlocks.includes(block.id));
      list.innerHTML += `
        <div class="task-row" onclick="toggleSubtaskBlockOpen('${block.id}')">
          ${block.name}
          <span style="font-size:10px; opacity:.7; margin-left:6px;">(${items.length} subtarefa${items.length === 1 ? "" : "s"})</span>
          ${usedBy.length > 0 ? `<span style="font-size:10px; opacity:.7; margin-left:6px;">usado em: ${usedBy.map(t => t.name).join(", ")}</span>` : ""}
          ${isBlockOpen ? `
            <div class="task-actions" onclick="event.stopPropagation();">
              <button class="aura-danger" onclick="deleteSubtaskBlock('${block.id}')"><i class="fa-solid fa-trash"></i> Excluir bloco</button>
            </div>
            <div class="task-days-row" onclick="event.stopPropagation();" style="flex-direction:column; align-items:stretch;">
              <input type="text" id="newItemInput_${block.id}" placeholder="Nova subtarefa dentro do bloco">
              <button class="aura-btn" onclick="addItemToBlock('${block.id}')"><i class="fa-solid fa-plus"></i> Adicionar subtarefa</button>
              ${items.map(item => `
                <div class="friend-row">
                  <span>${item.name}</span>
                  <button class="menu-btn-small menu-btn-danger" onclick="deleteItemFromBlock('${block.id}', '${item.id}')"><i class="fa-solid fa-trash"></i></button>
                </div>
              `).join("")}
            </div>` : ""}
        </div>`;
    });
    note.innerText = "";
    return;
  }

  body.innerHTML = `
    <input type="text" id="newTaskInput" placeholder="Nome da nova tarefa">
    <button class="aura-btn" onclick="addTask()"><i class="fa-solid fa-plus"></i> Adicionar</button>
  `;

  list.innerHTML = "";
  tasks.forEach(task => {
    const isOpen = openTaskId === task.id;
    const isLinking = openLinkTaskId === task.id;
    const taskDays = task.days || [0,1,2,3,4,5,6];
    const linked = task.linkedBlocks || [];

    list.innerHTML += `
      <div class="task-row" onclick="toggleTaskActions('${task.id}')">
        ${task.name}
        ${task.fromAgenda ? `<span style="font-size:10px; opacity:.7; margin-left:6px;"><i class="fa-solid fa-calendar-days"></i> ${task.scheduleType === "once" ? task.onceDate : "todo dia " + task.monthDay}</span>` :
          (taskDays.length < 7 ? `<span style="font-size:10px; opacity:.7; margin-left:6px;">(${taskDays.map(i => dayLabels[i]).join(", ")})</span>` : "")}
        ${linked.length > 0 ? `<span style="font-size:10px; opacity:.7; margin-left:6px;"><i class="fa-solid fa-link"></i> ${linked.length} bloco(s)</span>` : ""}
        ${isOpen ? `
          <div class="task-actions" onclick="event.stopPropagation();">
            <button class="aura-btn" onclick="editTask('${task.id}')"><i class="fa-solid fa-pen"></i> Editar</button>
            <button class="aura-btn" onclick="toggleLinkPanel('${task.id}')"><i class="fa-solid fa-link"></i> Linkar Bloco</button>
            <button class="aura-danger" onclick="deleteTask('${task.id}')"><i class="fa-solid fa-trash"></i> Excluir</button>
          </div>
          <div class="task-days-row" onclick="event.stopPropagation();">
            ${task.fromAgenda ? `<span style="font-size:11px; opacity:.7;"><i class="fa-solid fa-calendar-days"></i> Agendada via Agenda — edite a data por lá.</span>` :
              dayLabels.map((lbl, i) => `
              <button class="day-toggle ${taskDays.includes(i) ? "active" : ""}" onclick="toggleTaskDay('${task.id}', ${i})">${lbl}</button>
            `).join("")}
          </div>
          ${isLinking ? `
          <div class="task-days-row" onclick="event.stopPropagation(); " style="flex-direction:column; align-items:stretch;">
            ${subtaskBlocks.length === 0 ? `<span style="font-size:11px; opacity:.7;">Nenhum bloco criado ainda. Vá na aba Subtarefas pra criar.</span>` :
              subtaskBlocks.map(block => `
                <button class="day-toggle ${linked.includes(block.id) ? "active" : ""}" style="width:100%; text-align:left; margin-bottom:4px;" onclick="toggleLinkBlock('${task.id}', '${block.id}')">
                  ${linked.includes(block.id) ? '<i class="fa-solid fa-square-check"></i>' : '<i class="fa-regular fa-square"></i>'} ${block.name} (${(block.items||[]).length})
                </button>
              `).join("")}
          </div>` : ""}` : ""}
      </div>`;
  });

  note.innerText = pendingTasks.length > 0
    ? `${pendingTasks.length} tarefa(s) entram a partir da próxima semana (limite de ${TASK_CAP_IMMEDIATE} atingido): ${pendingTasks.map(t => t.name).join(", ")}`
    : "";
}
// fim renderTaskManager

function render() {
  renderTaskManager();
  renderAdmBanner();
  buildTable();
  renderTodaySubtasks();
}
// fim render

// ===== TABELA =====
function buildTable() {
  const table = document.getElementById("tracker");
  table.innerHTML = "";

  if (tasks.length === 0) {
    table.innerHTML = `<tr><td style="padding:14px; text-align:center;">Nenhuma tarefa ainda. Adicione acima <i class="fa-solid fa-hand-point-up"></i></td></tr>`;
    return;
  }

  let header = `<tr><th class="task-col">Tarefa</th>`;
  const weekDates = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(currentSunday, i);
    weekDates.push(d);
    header += `<th>${dayLabels[i]}<br>${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}</th>`;
  }
  header += `<th>%</th></tr>`;
  table.innerHTML += header;

  tasks.forEach(task => {
    const fromAgendaIcon = task.fromAgenda ? ' <i class="fa-solid fa-calendar-days" style="font-size:10px; opacity:.6;" title="Criada pela Agenda"></i>' : '';
    let row = `<tr><td class="task-col task">${task.name}${(task.linkedBlocks && task.linkedBlocks.length > 0) ? ' <i class="fa-solid fa-link" style="font-size:10px; opacity:.6;"></i>' : ''}${fromAgendaIcon}</td>`;
    let done = 0, activeDayCount = 0;

    weekDates.forEach((d, i) => {
      const dateKey = toDateKey(d);

      if (!taskAppliesOnDate(task, d)) {
        row += `<td class="cell inactive">—</td>`;
        return;
      }
      activeDayCount++;

      const fraction = taskCompletionFraction(task, dateKey);
      done += fraction;

      const clickable = (dateKey === todayKey) || adminDayMode;
      let cls = "cell";
      let onclick = "";

      if (clickable) {
        if (fraction >= 1) cls += " done";
        else if (fraction > 0) cls += " partial";
        onclick = `onclick="toggle('${task.id}', '${dateKey}')"`;
      } else if (d < today) {
        cls += fraction >= 1 ? " done locked" : (fraction > 0 ? " partial locked" : " locked");
      } else {
        cls += " future";
      }

      row += `<td class="${cls}" ${onclick}></td>`;
    });

    const percent = activeDayCount > 0 ? Math.round(done / activeDayCount * 100) : 0;
    row += `<td class="percent">${percent}%</td></tr>`;
    table.innerHTML += row;
  });
}
// fim buildTable

function buildBars() {
  const bars = document.getElementById("bars");
  bars.innerHTML = "<h3>Desempenho Diário</h3>";
  if (tasks.length === 0) return;

  for (let i = 0; i < 7; i++) {
    const d = addDays(currentSunday, i);
    const dateKey = toDateKey(d);
    const activeTasksToday = tasks.filter(t => taskAppliesOnDate(t, d));
    let done = 0;
    activeTasksToday.forEach(task => { done += taskCompletionFraction(task, dateKey); });
    const percent = activeTasksToday.length > 0 ? Math.round(done / activeTasksToday.length * 100) : 0;
    bars.innerHTML += `<div>${dayLabels[i]}</div><div class="bar"><div class="bar-fill" style="width:${percent}%">${percent}%</div></div>`;
  }
}
// fim buildBars

function calculateWeekScore() {
  if (tasks.length === 0) {
    document.getElementById("weekScore").innerText = "Score semanal: —";
    return;
  }
  let done = 0, total = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(currentSunday, i);
    const dateKey = toDateKey(d);
    tasks.forEach(task => {
      if (taskAppliesOnDate(task, d)) {
        total++;
        done += taskCompletionFraction(task, dateKey);
      }
    });
  }
  const percent = Math.round(done / total * 100 || 0);
  document.getElementById("weekScore").innerText = `Score semanal: ${percent}%`;
  syncDuelScore(percent);
}
// fim calculateWeekScore

// ===== ADM: editar meu XP =====
function adminEditXP() {
  if (!isAdmin()) { showToast("Só o ADM pode usar isso."); return; }
  openModal({
    title: "Senha de ADM:",
    type: "password",
    confirmLabel: "Continuar",
    onConfirm: (pass) => {
      if (pass !== ADM_PASSWORD) { showToast("❌ Senha incorreta."); return; }
      openModal({
        title: "Digite o novo total de XP:",
        type: "text",
        defaultValue: String(xp),
        confirmLabel: "Salvar",
        onConfirm: (value) => {
          const num = parseInt(value);
          if (!isNaN(num) && num >= 0) {
            xp = num;
            saveState();
            updateLevelUI();
            showToast("✅ XP alterado com sucesso.");
          } else {
            showToast("⚠️ Valor inválido.");
          }
        }
      });
    }
  });
}
// fim adminEditXP

// ===== ADM: dar XP pra outro jogador (via nickname) =====
function adminGrantXP() {
  if (!isAdmin()) { showToast("Só o ADM pode usar isso."); return; }
  openModal({
    title: "Senha de ADM:",
    type: "password",
    confirmLabel: "Continuar",
    onConfirm: (pass) => {
      if (pass !== ADM_PASSWORD) { showToast("❌ Senha incorreta."); return; }
      openModal({
        title: "Nickname do jogador que vai receber XP:",
        type: "text",
        confirmLabel: "Buscar",
        onConfirm: (nick) => {
          const target = (nick || "").trim();
          if (!target) return;
          db.collection("users").where("nicknameLower", "==", target.toLowerCase()).limit(1).get().then(snap => {
            if (snap.empty) { showToast("Nickname não encontrado."); return; }
            const targetDoc = snap.docs[0];
            openModal({
              title: `Quanto XP dar pra ${target}? (pode ser negativo pra remover)`,
              type: "text",
              confirmLabel: "Dar XP",
              onConfirm: (amountStr) => {
                const amount = parseInt(amountStr);
                if (isNaN(amount)) { showToast("Valor inválido."); return; }
                targetDoc.ref.update({ xp: firebase.firestore.FieldValue.increment(amount) }).then(() => {
                  showToast(`${amount >= 0 ? "+" : ""}${amount} XP aplicado a ${target}.`);
                }).catch(e => showToast("Erro: " + e.message));
              }
            });
          }).catch(e => showToast("Erro: " + e.message));
        }
      });
    }
  });
}
// fim adminGrantXP

function reportBug() {
  if (!currentUser) { showToast("Faça login pra relatar um bug."); return; }
  openModal({
    title: "Descreva o bug ou sugestão:",
    type: "textarea",
    placeholder: "O que aconteceu?",
    confirmLabel: "Enviar",
    onConfirm: (msg) => {
      const text = (msg || "").trim();
      if (!text) return;
      db.collection("bugReports").add({
        uid: currentUser.uid,
        nickname: currentNickname || currentUser.email,
        message: text,
        createdAt: Date.now(),
        status: "open"
      }).then(() => {
        showToast("Obrigado! Relato enviado.");
      }).catch(e => showToast("Erro: " + e.message));
    }
  });
}
// fim reportBug

function loadBugReportsInAdmin() {
  const box = document.getElementById("bugReportsBox");
  box.innerHTML = "<p>Carregando...</p>";
  db.collection("bugReports").orderBy("createdAt", "desc").limit(50).get().then(snap => {
    let rows = "";
    snap.forEach(d => {
      const data = d.data();
      const date = new Date(data.createdAt).toLocaleString("pt-BR");
      rows += `
        <div class="friend-row" style="flex-direction:column; align-items:flex-start;">
          <strong>${data.nickname}</strong>
          <span style="font-size:11px; opacity:.7;">${date}</span>
          <p style="margin:6px 0 0 0; font-size:13px;">${data.message}</p>
        </div>`;
    });
    box.innerHTML = rows || "<p style='font-size:12px;opacity:.7;'>Nenhum relato ainda.</p>";
  }).catch(e => { box.innerHTML = `<p>Erro: ${e.message}</p>`; });
}
// fim loadBugReportsInAdmin

function renderAdminScreen() {
  const content = document.getElementById("adminContent");
  if (!isAdmin()) { content.innerHTML = "<p>Acesso restrito.</p>"; return; }
  content.innerHTML = `
    <button class="menu-btn menu-btn-adm" onclick="adminEditXP()"><i class="fa-solid fa-gear"></i> Editar meu XP</button>
    <button class="menu-btn menu-btn-adm" onclick="toggleAdminDayMode()"><i class="fa-solid fa-lock-open"></i> Editar dias (volte à Home depois)</button>
    <button class="menu-btn menu-btn-adm" onclick="adminGrantXP()"><i class="fa-solid fa-gift"></i> Dar XP a alguém</button>
    <button class="menu-btn menu-btn-adm" onclick="loadBugReportsInAdmin()"><i class="fa-solid fa-bug"></i> Ver Relatos de Bugs</button>
    <div id="bugReportsBox"></div>
  `;
}
// fim renderAdminScreen

// ===== RELATÓRIO =====
function copyReport() {
  let text = `${today.toLocaleDateString("pt-BR")}\n\n`;
  tasks.forEach(task => {
    if (task.fromAgenda) return;
    let d = 0, total = 0;
    for (let i = 0; i < 7; i++) {
      const dateObj = addDays(currentSunday, i);
      if (!taskAppliesOnDate(task, dateObj)) continue;
      total++;
      const dateKey = toDateKey(dateObj);
      d += taskCompletionFraction(task, dateKey);
    }
    if (total === 0) return;
    text += `${task.name}: ${Math.round(d*10)/10}/${total} (${total > 0 ? Math.round(d/total*100) : 0}%)\n`;
  });
  text += `\nXP total: ${xp}`;
  navigator.clipboard.writeText(text);
  showToast("Relatório copiado!");
}
// fim copyReport

// ===== SEMANAS ANTERIORES (só leitura) =====
let pastWeekTab = 1;

function getPastWeekDates(weeksAgo) {
  const sunday = addDays(currentSunday, -7 * weeksAgo);
  const dates = [];
  for (let i = 0; i < 7; i++) dates.push(addDays(sunday, i));
  return dates;
}
// fim getPastWeekDates

function calculatePastWeekReport(weeksAgo) {
  const dates = getPastWeekDates(weeksAgo);
  let totalFraction = 0, totalSlots = 0;
  const perTask = [];

  tasks.forEach(task => {
    const taskDays = task.days || [0,1,2,3,4,5,6];
    let doneSum = 0, total = 0;
    dates.forEach(d => {
      const dow = d.getDay();
      if (!taskDays.includes(dow)) return;
      total++;
      doneSum += taskCompletionFraction(task, toDateKey(d));
    });
    if (total > 0) {
      perTask.push({ name: task.name, done: doneSum, total, percent: Math.round(doneSum / total * 100) });
      totalFraction += doneSum;
      totalSlots += total;
    }
  });

  const percent = totalSlots > 0 ? Math.round(totalFraction / totalSlots * 100) : 0;
  return { dates, percent, perTask };
}
// fim calculatePastWeekReport

function switchPastWeekTab(weeksAgo) {
  pastWeekTab = weeksAgo;
  renderPastWeekTabs();
}
// fim switchPastWeekTab

function renderPastWeekTabs() {
  const tabsBox = document.getElementById("pastWeekTabs");
  if (!tabsBox) return;

  tabsBox.innerHTML = [1, 2, 3].map(n => `
    <button class="menu-btn-small" style="${pastWeekTab === n ? "opacity:1;" : "opacity:.5;"}" onclick="switchPastWeekTab(${n})">
      ${n === 1 ? "Semana Passada" : n + " Semanas Atrás"}
    </button>
  `).join("");

  const report = calculatePastWeekReport(pastWeekTab);
  const content = document.getElementById("pastWeekContent");

  const sunday = report.dates[0];
  const saturday = report.dates[6];
  const rangeLabel = `${String(sunday.getDate()).padStart(2,"0")}/${String(sunday.getMonth()+1).padStart(2,"0")} a ${String(saturday.getDate()).padStart(2,"0")}/${String(saturday.getMonth()+1).padStart(2,"0")}`;

  let html = `<p style="font-size:12px; opacity:.75; margin-bottom:8px;">${rangeLabel}</p>`;
  html += `<div class="week-score">Score da semana: ${report.percent}%</div>`;

  if (report.perTask.length === 0) {
    html += `<p style="font-size:12px; opacity:.7; margin-top:10px;">Nenhum dado registrado nessa semana.</p>`;
  } else {
    report.perTask.forEach(t => {
      html += `<div class="friend-row"><span>${t.name}</span><span>${Math.round(t.done*10)/10}/${t.total} (${t.percent}%)</span></div>`;
    });
  }

  html += `<button class="aura-btn" style="margin-top:12px;" onclick="copyPastWeekReport(${pastWeekTab})"><i class="fa-solid fa-clipboard"></i> Copiar relatório dessa semana</button>`;

  // estatísticas rápidas comparando as 3 semanas
  const w1 = calculatePastWeekReport(1), w2 = calculatePastWeekReport(2), w3 = calculatePastWeekReport(3);
  const weeks = [{ n: 1, p: w1.percent }, { n: 2, p: w2.percent }, { n: 3, p: w3.percent }];
  const media = Math.round((w1.percent + w2.percent + w3.percent) / 3);
  const melhor = weeks.reduce((a, b) => (b.p > a.p ? b : a));
  const pior = weeks.reduce((a, b) => (b.p < a.p ? b : a));

  html += `
    <div class="player-card" style="margin-top:16px;">
      <h3 style="margin-top:0;"><i class="fa-solid fa-chart-simple"></i> Últimas 3 semanas</h3>
      <p style="font-size:13px; margin:6px 0;">Média: <strong>${media}%</strong></p>
      <p style="font-size:13px; margin:6px 0;">Melhor: <strong>${melhor.n === 1 ? "Semana passada" : melhor.n + " semanas atrás"} (${melhor.p}%)</strong></p>
      <p style="font-size:13px; margin:6px 0;">Pior: <strong>${pior.n === 1 ? "Semana passada" : pior.n + " semanas atrás"} (${pior.p}%)</strong></p>
    </div>`;

  content.innerHTML = html;
}
// fim renderPastWeekTabs

function copyPastWeekReport(weeksAgo) {
  const report = calculatePastWeekReport(weeksAgo);
  const sunday = report.dates[0];
  let text = `Relatório de ${weeksAgo === 1 ? "semana passada" : weeksAgo + " semanas atrás"} (${sunday.toLocaleDateString("pt-BR")})\n\n`;
  report.perTask.forEach(t => {
    text += `${t.name}: ${Math.round(t.done*10)/10}/${t.total} (${t.percent}%)\n`;
  });
  text += `\nScore da semana: ${report.percent}%`;
  navigator.clipboard.writeText(text);
  showToast("Relatório copiado!");
}
// fim copyPastWeekReport

// ===== FRASE DO DIA =====
function renderQuote() {
  const dateStr = today.toLocaleDateString("pt-BR");
  document.getElementById("date").innerText = dateStr;
  document.getElementById("weekrange").innerText = `Semana: ${toDateKey(currentSunday)} a ${toDateKey(addDays(currentSunday,6))}`;

  const savedDate = localStorage.getItem("wt_quoteDate");
  if (savedDate !== dateStr) {
    const q = quotes[Math.floor(Math.random() * quotes.length)];
    localStorage.setItem("wt_quote", q);
    localStorage.setItem("wt_quoteDate", dateStr);
  }
  document.getElementById("quote").innerText = localStorage.getItem("wt_quote");
}
// fim renderQuote

// ===== MODAL PRÓPRIO =====
let modal = null;

function openModal(opts) { modal = opts; renderModal(); }
function closeModal() { modal = null; renderModal(); }

function submitModal() {
  if (!modal) return;
  let value = null;
  if (modal.type === "text" || modal.type === "password" || modal.type === "textarea") {
    const el = document.getElementById("modalInput");
    value = el ? el.value : "";
  }
  const cb = modal.onConfirm;
  modal = null;
  renderModal();
  cb(value);
}
// fim submitModal

function renderModal() {
  const overlay = document.getElementById("modalOverlay");
  if (!modal) {
    overlay.classList.add("hidden");
    overlay.innerHTML = "";
    return;
  }
  overlay.classList.remove("hidden");

  let inputHtml = "";
  if (modal.type === "text") {
    inputHtml = `<input type="text" id="modalInput" autocomplete="off" value="${(modal.defaultValue || "").replace(/"/g,"&quot;")}">`;
  } else if (modal.type === "password") {
    inputHtml = `<input type="password" id="modalInput" placeholder="Senha">`;
  } else if (modal.type === "textarea") {
    inputHtml = `<textarea id="modalInput" rows="4" placeholder="${modal.placeholder || ""}"></textarea>`;
  }

  overlay.innerHTML = `
    <div class="modal-box">
      <p>${modal.title}</p>
      ${inputHtml}
      <div class="modal-actions">
        <button class="aura-btn" onclick="submitModal()">${modal.confirmLabel || "Confirmar"}</button>
        <button class="aura-danger" onclick="closeModal()">Cancelar</button>
      </div>
    </div>`;

  const input = document.getElementById("modalInput");
  if (input) {
    input.focus();
    if (modal.type !== "textarea") {
      input.addEventListener("keydown", e => { if (e.key === "Enter") submitModal(); });
    }
  }
}
// fim renderModal

function showToast(msg) {
  const t = document.getElementById("toast");
  t.innerText = msg;
  t.classList.remove("hidden");
  clearTimeout(window._toastTimeout);
  window._toastTimeout = setTimeout(() => t.classList.add("hidden"), 2600);
}
// fim showToast

// ===== MENU LATERAL (login, navegação, ADM) =====
function renderAuth() {
  const box = document.getElementById("sidebarMenu");
  let html = "";

  if (currentUser) {
    html += `<div class="sidebar-user">Logado como <strong>${currentNickname || currentUser.email}</strong></div>`;
    html += `<button class="menu-btn" onclick="showScreen('home')"><i class="fa-solid fa-house"></i> Página Inicial</button>`;
    html += `<button class="menu-btn" onclick="openMyProfile()"><i class="fa-solid fa-face-smile"></i> Meu Perfil</button>`;
    html += `<button class="menu-btn" onclick="showScreen('stats')"><i class="fa-solid fa-chart-column"></i> Desempenho da Semana</button>`;
    html += `<button class="menu-btn" onclick="showScreen('ranking')"><i class="fa-solid fa-trophy"></i> Ranking</button>`;
    html += `<button class="menu-btn" onclick="showScreen('hallOfFame')"><i class="fa-solid fa-landmark"></i> Salão dos Marechais</button>`;
    html += `<button class="menu-btn" onclick="showScreen('duel')"><i class="fa-solid fa-hand-fist"></i> Duelo</button>`;
    html += `<button class="menu-btn" onclick="showScreen('friends')"><i class="fa-solid fa-user-group"></i> Amigos</button>`;
    html += `<button class="menu-btn" onclick="showScreen('checklist')"><i class="fa-solid fa-list-check"></i> Checklist</button>`;
    html += `<button class="menu-btn" onclick="showScreen('agenda')"><i class="fa-solid fa-calendar-days"></i> Agenda</button>`;
    if (isAdmin()) {
      html += `<button class="menu-btn menu-btn-adm" onclick="showScreen('admin')"><i class="fa-solid fa-gear"></i> Painel ADM</button>`;
    }
  } else {
    html += `<button class="menu-btn" onclick="showScreen('home')"><i class="fa-solid fa-house"></i> Página Inicial</button>`;
    html += `<button class="menu-btn" onclick="showScreen('stats')"><i class="fa-solid fa-chart-column"></i> Desempenho da Semana</button>`;
    html += `<button class="menu-btn" onclick="showScreen('help')"><i class="fa-solid fa-circle-question"></i> Ajuda / Tutorial</button>`;
    html += `<button class="menu-btn" onclick="doGoogleLogin()"><i class="fa-brands fa-google"></i> Entrar com Google</button>`;
    html += `
      <div class="sidebar-authform">
        <input type="email" id="authEmail" placeholder="Email">
        <input type="password" id="authPass" placeholder="Senha">
        ${authMode === "signup" ? `<input type="text" id="authNick" placeholder="Nickname">` : ""}
        <button class="menu-btn" onclick="${authMode === "signup" ? "doEmailSignup()" : "doEmailLogin()"}">${authMode === "signup" ? "Criar conta" : "Entrar"}</button>
        <div class="auth-toggle-link" onclick="toggleAuthMode()">${authMode === "signup" ? "Já tenho conta" : "Criar conta nova"}</div>
      </div>`;
  }

  box.innerHTML = html;

  const homeBanner = document.getElementById("homeLoginBanner");
  if (homeBanner) {
    homeBanner.innerHTML = currentUser ? "" : `
      <div class="task-manager" style="text-align:center;">
        <p style="font-size:13px; margin-bottom:10px;">Faça login pra salvar seu progresso e desbloquear tudo:</p>
        <button class="aura-btn" onclick="doGoogleLogin()"><i class="fa-brands fa-google"></i> Entrar com Google</button>
      </div>`;
  }
}
// fim renderAuth

function toggleAuthMode() {
  authMode = authMode === "signup" ? "login" : "signup";
  renderAuth();
}
// fim toggleAuthMode

function showMyUID() {
  if (!currentUser) return;
  openModal({
    title: "Seu UID (copie e cole em ADMIN_UID no topo do script.js):",
    type: "text",
    defaultValue: currentUser.uid,
    confirmLabel: "OK",
    onConfirm: () => {}
  });
}
// fim showMyUID
