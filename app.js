const STORAGE_KEY = "serur-reembolso-local-v3";
const USER_KEY = "serur-reembolso-local-user-v3";

const emptyState = {
  clients: [],
  people: [],
  tasks: [],
  assignments: [],
  reimbursements: [],
  vacations: [],
  homeOffice: [],
  documents: []
};

const tableNames = {
  clients: "clients",
  people: "team_members",
  tasks: "tasks",
  assignments: "monthly_assignments",
  reimbursements: "reimbursements",
  vacations: "vacations",
  homeOffice: "home_office_days",
  documents: "documents"
};

let state = structuredClone(emptyState);
let activeView = "dashboard";
let activeActivityTab = "tasks";
let authMode = "login";
let currentUser = null;
let currentMember = null;
let calendarCursor = new Date();
let selectedCalendarDate = new Date().toISOString().slice(0, 10);
const TASK_STATUSES = ["A Fazer", "Em Andamento", "Em Revisão", "Concluído"];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const supabaseSettings = window.SERUR_SUPABASE || {};
const hasSupabaseConfig =
  supabaseSettings.url &&
  supabaseSettings.anonKey &&
  !supabaseSettings.url.includes("COLE_AQUI") &&
  !supabaseSettings.anonKey.includes("COLE_AQUI") &&
  window.supabase;

const db = hasSupabaseConfig ? window.supabase.createClient(supabaseSettings.url, supabaseSettings.anonKey) : null;

function loadLocalState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved ? JSON.parse(saved) : structuredClone(emptyState);
}

function saveLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid(prefix) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
}

function formatMonth(value) {
  if (!value) return "-";
  const [year, month] = value.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function isoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromIso(value) {
  return new Date(`${value}T12:00:00`);
}

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fileSizeLabel(bytes) {
  const size = Number(bytes || 0);
  if (!size) return "";
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function safeFilePart(value) {
  return String(value || "arquivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function fullSignupName() {
  return `${$("#signupFirstName").value.trim()} ${$("#signupLastName").value.trim()}`.trim();
}

function displayUserName() {
  return currentMember?.name || currentUser?.user_metadata?.full_name || "Usuário";
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function icon(name) {
  return `<i data-lucide="${name}" aria-hidden="true"></i>`;
}

function clientName(id) {
  return state.clients.find((client) => client.id === id)?.name || "Cliente não encontrado";
}

function personName(id) {
  return state.people.find((person) => person.id === id)?.name || "Pessoa não encontrada";
}

function peopleChips(ids = []) {
  return ids.map((id) => `<span class="chip">${personName(id)}</span>`).join("");
}

function weekdayName(value) {
  const names = { 1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta" };
  return names[String(value)] || value;
}

function homeDaysText(days = []) {
  return days.length ? days.map(weekdayName).join(", ") : "Sem dia fixo";
}

function statusClass(status) {
  return (status || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll(" ", "-");
}

function taskStatus(status) {
  const aliases = {
    "Pendente": "A Fazer",
    "A fazer": "A Fazer",
    "Fazendo": "Em Andamento",
    "Em andamento": "Em Andamento",
    "Aguardando cliente": "A Fazer",
    "Em Revisao": "Em Revisão",
    "Concluida": "Concluído",
    "Concluído": "Concluído",
    "Atrasada": "A Fazer"
  };
  return aliases[status] || status || "A Fazer";
}

function taskStatusOptions(selectedStatus) {
  const selected = taskStatus(selectedStatus);
  return TASK_STATUSES.map((status) => `<option value="${status}" ${status === selected ? "selected" : ""}>${status}</option>`).join("");
}

function reimbursementStatus(status) {
  return status === "Em analise" ? "Em análise" : status;
}

function vacationStatus(status) {
  return status === "Concluida" ? "Concluída" : status;
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  window.setTimeout(() => element.classList.remove("show"), 2400);
}

function selectedValues(select) {
  return Array.from(select.selectedOptions).map((option) => option.value);
}

function fillSelect(select, items, placeholder = null) {
  const current = select.value;
  select.innerHTML = placeholder ? `<option value="">${placeholder}</option>` : "";
  items.forEach((item) => {
    select.insertAdjacentHTML("beforeend", `<option value="${item.id}">${item.name}</option>`);
  });
  select.value = current;
}

function matchesSearch(text) {
  const term = $("#globalSearch").value.trim().toLowerCase();
  return !term || text.toLowerCase().includes(term);
}

function isSignedIn() {
  return hasSupabaseConfig ? Boolean(currentUser) : Boolean(currentUser);
}

async function getCurrentSession() {
  if (!hasSupabaseConfig) {
    const localUserId = localStorage.getItem(USER_KEY);
    const localState = loadLocalState();
    currentUser = localState.people.find((person) => person.id === localUserId) || null;
    currentMember = currentUser;
    return;
  }

  const { data, error } = await db.auth.getSession();
  if (error) throw error;
  currentUser = data.session?.user || null;
  currentMember = null;
}

async function loadRemoteState() {
  if (!hasSupabaseConfig) {
    state = loadLocalState();
    return;
  }

  const requests = Object.entries(tableNames).map(async ([key, table]) => {
    const { data, error } = await db.from(table).select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return [key, data || []];
  });

  const entries = await Promise.all(requests);
  state = Object.fromEntries(entries);
  currentMember = state.people.find((person) => person.user_id === currentUser?.id) || null;
}

async function insertRecord(key, payload) {
  if (!hasSupabaseConfig) {
    const record = { id: uid(key.slice(0, 1)), ...payload };
    state[key].push(record);
    saveLocalState();
    return record;
  }

  const { data, error } = await db.from(tableNames[key]).insert(payload).select().single();
  if (error) throw error;
  return data;
}

async function updateRecord(key, id, payload) {
  if (!hasSupabaseConfig) {
    state[key] = state[key].map((record) => (record.id === id ? { ...record, ...payload } : record));
    saveLocalState();
    return;
  }

  const { error } = await db.from(tableNames[key]).update(payload).eq("id", id);
  if (error) throw error;
}

async function deleteRecord(key, id) {
  if (!hasSupabaseConfig) {
    state[key] = state[key].filter((record) => record.id !== id);
    saveLocalState();
    return;
  }

  const { error } = await db.from(tableNames[key]).delete().eq("id", id);
  if (error) throw error;
}

async function uploadDocumentFile(file, clientId) {
  if (!file || !file.name) return null;
  if (!hasSupabaseConfig) {
    toast("Anexo selecionado apenas para teste local. No site publicado, o arquivo será salvo no Supabase.");
    return {
      file_name: file.name,
      file_type: file.type || "Arquivo",
      file_size: file.size || 0,
      file_path: "",
      link: ""
    };
  }

  const path = `${clientId || "sem-cliente"}/${Date.now()}-${safeFilePart(file.name)}`;
  const { error: uploadError } = await db.storage.from("documents").upload(path, file, { upsert: true });
  if (uploadError) throw uploadError;

  const { data } = db.storage.from("documents").getPublicUrl(path);
  return {
    file_name: file.name,
    file_type: file.type || "Arquivo",
    file_size: file.size || 0,
    file_path: path,
    link: data.publicUrl
  };
}

async function removeDocumentFile(path) {
  if (!path || !hasSupabaseConfig) return;
  await db.storage.from("documents").remove([path]);
}

async function refreshData() {
  await getCurrentSession();
  if (isSignedIn()) {
    await loadRemoteState();
  } else {
    state = structuredClone(emptyState);
  }
  renderAll();
}

function fillAllSelects() {
  [
    ["#taskClientSelect", null],
    ["#assignmentClientSelect", null],
    ["#reimbursementClientSelect", null],
    ["#reimbursementClientFilter", "Todos os clientes"],
    ["#documentClientSelect", null]
  ].forEach(([selector, placeholder]) => fillSelect($(selector), state.clients, placeholder));

  [
    "#taskPeopleSelect",
    "#assignmentPeopleSelect",
    "#reimbursementPersonSelect",
    "#vacationPersonSelect",
    "#homeOfficePersonSelect"
  ].forEach((selector) => fillSelect($(selector), state.people));

  fillSelect($("#reimbursementPersonFilter"), state.people, "Todos os responsáveis");
  fillSelect($("#taskClientFilter"), state.clients, "Todos os clientes");
}

function renderDashboard() {
  const pendingTasks = state.tasks.filter((task) => taskStatus(task.status) !== "Concluído");
  const inProgressTasks = state.tasks.filter((task) => taskStatus(task.status) === "Em Andamento");
  const completedTasks = state.tasks.filter((task) => taskStatus(task.status) === "Concluído");
  const today = new Date().toISOString().slice(0, 10);
  const overdueTasks = state.tasks.filter((task) => taskStatus(task.status) !== "Concluído" && task.due_date && task.due_date < today);
  const totalReimbursements = state.reimbursements.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const pendingReimbursements = state.reimbursements
    .filter((item) => item.status === "Pendente" || reimbursementStatus(item.status) === "Em análise")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const paidReimbursements = state.reimbursements
    .filter((item) => item.status === "Pago")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const overdueReimbursements = state.reimbursements
    .filter((item) => item.status === "Vencido")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const firstName = displayUserName().split(" ")[0];
  $("#dashboardGreeting").textContent = `Olá, ${firstName}`;
  $("#dashboardDate").textContent = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  $("#metricsGrid").innerHTML = [
    ["Total de Atividades", state.tasks.length, "square-check-big", ""],
    ["Em Andamento", inProgressTasks.length, "clock", "icon-blue"],
    ["Concluídas", completedTasks.length, "trending-up", "icon-green"],
    ["Atrasadas", overdueTasks.length, "circle-alert", "icon-red"]
  ].map(([label, value, icon, theme]) => `
    <article class="metric ${theme}">
      <div class="metric-icon"><i data-lucide="${icon}"></i></div>
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `).join("");

  $("#dashboardReimbursementMetrics").innerHTML = [
    ["Total", money(totalReimbursements), "receipt-text", ""],
    ["Pendente", money(pendingReimbursements), "hourglass", "icon-blue"],
    ["Pago", money(paidReimbursements), "badge-check", "icon-green"],
    ["Vencido", money(overdueReimbursements), "circle-alert", "icon-red"]
  ].map(([label, value, iconName, theme]) => `
    <article class="metric ${theme}">
      <div class="metric-icon"><i data-lucide="${iconName}"></i></div>
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `).join("");

  $("#dashboardReimbursements").innerHTML = state.reimbursements
    .slice()
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
    .slice(0, 5)
    .map((item) => `
      <tr>
        <td><strong>${item.description || "-"}</strong><br><span class="small">${item.expense_type || "Sem tipo"}</span></td>
        <td>${clientName(item.client_id)}</td>
        <td>${personName(item.person_id)}</td>
        <td><strong>${money(item.amount)}</strong></td>
        <td><span class="badge ${statusClass(reimbursementStatus(item.status))}">${reimbursementStatus(item.status)}</span></td>
        <td>${formatDate(item.due_date)}</td>
      </tr>
    `).join("") || `<tr><td colspan="6">Nenhum reembolso cadastrado.</td></tr>`;

  $("#todayLabel").textContent = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  $("#dashboardTasks").innerHTML = state.tasks
    .filter((task) => taskStatus(task.status) !== "Concluído")
    .slice(0, 5)
    .map((task) => taskCard(task, false))
    .join("") || `<div class="empty">Nenhuma atividade aberta.</div>`;

  const agenda = [
    ...state.vacations.map((item) => ({ type: "Férias", date: item.start_date, title: personName(item.person_id), text: `${formatDate(item.start_date)} a ${formatDate(item.end_date)}` })),
    ...state.homeOffice.map((item) => ({ type: "Home office", date: item.work_date, title: personName(item.person_id), text: `${formatDate(item.work_date)} - ${item.action_type || "Ajuste"}` }))
  ].sort((a, b) => a.date.localeCompare(b.date));

  $("#teamAgenda").innerHTML = agenda.map((item) => `
    <article class="timeline-item">
      <span class="badge">${item.type}</span>
      <h3>${item.title}</h3>
      <p class="small">${item.text}</p>
    </article>
  `).join("") || `<div class="empty">Agenda sem registros.</div>`;
}

function taskCard(task, editable = true) {
  const currentStatus = taskStatus(task.status);
  return `
    <article class="task-card">
      <strong>${task.title}</strong>
      <div class="task-meta">
        <span class="badge ${statusClass(currentStatus)}">${currentStatus}</span>
        <span>${icon("building-2")}${clientName(task.client_id)}</span>
        <span>${icon("calendar")}Prazo: ${formatDate(task.due_date)}</span>
        <span>${task.priority}</span>
      </div>
      <div>${peopleChips(task.people_ids)}</div>
      ${task.description ? `<p class="small">${task.description}</p>` : ""}
      ${editable ? `
      <label class="task-status-control">Andamento
        <select data-task-status="${task.id}">
          ${taskStatusOptions(currentStatus)}
        </select>
      </label>
      <div class="task-card-actions">
        <button type="button" data-edit-task="${task.id}">${icon("pencil")}Editar</button>
        <button class="danger" type="button" data-delete-task="${task.id}">Excluir</button>
      </div>
      ` : ""}
    </article>
  `;
}

function renderClients() {
  const rows = state.clients
    .filter((client) => matchesSearch(`${client.name} ${client.company || ""} ${client.owner || ""} ${client.tax_id || ""}`))
    .map((client) => `
      <tr>
        <td><strong>${client.name}</strong><br><span class="small">${client.company || "-"}</span></td>
        <td>${client.tax_id || "-"}</td>
        <td>${client.email || "-"}<br><span class="small">${client.phone || ""}</span></td>
        <td>${client.owner || "-"}</td>
        <td><span class="badge">${client.status}</span></td>
        <td>
          <div class="row-actions">
            <button type="button" data-edit-client="${client.id}">${icon("pencil")}Editar</button>
            <button class="danger" type="button" data-delete-client="${client.id}">${icon("trash-2")}Excluir</button>
          </div>
        </td>
      </tr>
    `);
  $("#clientsTable").innerHTML = rows.join("") || `<tr><td colspan="6">Nenhum cliente encontrado.</td></tr>`;
  $("#clientCount").textContent = `${state.clients.length} cadastrados`;
}

function renderTasks() {
  const statusFilter = $("#taskStatusFilter").value;
  const clientFilter = $("#taskClientFilter").value;
  const filtered = state.tasks.filter((task) => {
    const haystack = `${task.title} ${clientName(task.client_id)} ${(task.people_ids || []).map(personName).join(" ")}`;
    const currentStatus = taskStatus(task.status);
    return matchesSearch(haystack) && (!statusFilter || currentStatus === statusFilter) && (!clientFilter || task.client_id === clientFilter);
  });

  $("#taskColumns").innerHTML = TASK_STATUSES.map((status) => {
    const tasks = filtered.filter((task) => taskStatus(task.status) === status);
    return `
      <section class="task-column">
        <h3>${status}<span>${tasks.length}</span></h3>
        ${tasks.map((task) => taskCard(task, true)).join("") || `<div class="empty">Sem atividades.</div>`}
      </section>
    `;
  }).join("");
}

function renderAssignments() {
  $("#assignmentCount").textContent = `${state.assignments.length} registros`;
  $("#assignmentGrid").innerHTML = state.assignments.map((item) => `
    <article class="assignment-card">
      <span class="badge">${formatMonth(item.month)}</span>
      <h3>${clientName(item.client_id)}</h3>
      <div>${peopleChips(item.people_ids)}</div>
      ${item.note ? `<p class="small">${item.note}</p>` : ""}
      <div class="row-actions">
        <button type="button" data-edit-assignment="${item.id}">${icon("pencil")}Editar</button>
        <button class="danger" type="button" data-delete-assignment="${item.id}">${icon("trash-2")}Excluir</button>
      </div>
    </article>
  `).join("") || `<div class="empty">Nenhuma distribuição cadastrada.</div>`;
}

function filteredReimbursements() {
  const period = $("#reimbursementPeriodFilter").value;
  const status = $("#reimbursementStatusFilter").value;
  const client = $("#reimbursementClientFilter").value;
  const person = $("#reimbursementPersonFilter").value;
  const type = $("#reimbursementTypeFilter").value;
  const text = $("#reimbursementTextFilter").value.trim().toLowerCase();

  return state.reimbursements.filter((item) => {
    const haystack = `${item.description || ""} ${item.document_number || ""} ${clientName(item.client_id)} ${personName(item.person_id)}`.toLowerCase();
    return (!period || item.period === period)
      && (!status || reimbursementStatus(item.status) === status)
      && (!client || item.client_id === client)
      && (!person || item.person_id === person)
      && (!type || item.expense_type === type)
      && (!text || haystack.includes(text));
  });
}

function renderReimbursements() {
  const items = filteredReimbursements();
  const total = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const pending = items.filter((item) => item.status === "Pendente" || reimbursementStatus(item.status) === "Em análise").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const paid = items.filter((item) => item.status === "Pago").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const overdue = items.filter((item) => item.status === "Vencido").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  $("#reimbursementMetrics").innerHTML = [
    ["Total", money(total)],
    ["Pendente", money(pending)],
    ["Pago", money(paid)],
    ["Vencido", money(overdue)],
    ["Registros", items.length]
  ].map(([label, value]) => `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`).join("");

  $("#reimbursementsTable").innerHTML = items.map((item) => `
    <tr>
      <td><span class="badge">${formatMonth(item.period)}</span></td>
      <td><strong>${item.description || "-"}</strong><br><span class="small">${item.expense_type || "Sem tipo"}</span></td>
      <td>${clientName(item.client_id)}</td>
      <td>${personName(item.person_id)}</td>
      <td>${formatDate(item.due_date)}</td>
      <td><strong>${money(item.amount)}</strong></td>
      <td><span class="badge ${statusClass(reimbursementStatus(item.status))}">${reimbursementStatus(item.status)}</span></td>
      <td>${item.document_number || "-"}</td>
      <td>
        <div class="row-actions">
          <button type="button" data-edit-reimbursement="${item.id}">${icon("pencil")}Editar</button>
          <button class="danger" type="button" data-delete-reimbursement="${item.id}">${icon("trash-2")}Excluir</button>
        </div>
      </td>
    </tr>
  `).join("") || `<tr><td colspan="9">Nenhum reembolso cadastrado.</td></tr>`;
}

function renderVacations() {
  $("#vacationCount").textContent = `${state.vacations.length} períodos`;
  $("#vacationList").innerHTML = state.vacations.map((item) => `
    <article class="calendar-item">
      <span class="badge ${statusClass(vacationStatus(item.status))}">${vacationStatus(item.status)}</span>
      <h3>${personName(item.person_id)}</h3>
      <p class="small">${formatDate(item.start_date)} a ${formatDate(item.end_date)}</p>
      ${item.note ? `<p>${item.note}</p>` : ""}
      <div class="row-actions">
        <button type="button" data-edit-vacation="${item.id}">${icon("pencil")}Editar</button>
        <button class="danger" type="button" data-delete-vacation="${item.id}">${icon("trash-2")}Excluir</button>
      </div>
    </article>
  `).join("") || `<div class="empty">Nenhum período cadastrado.</div>`;
}

function renderHomeOffice() {
  const activePeople = state.people.filter((person) => person.status !== "Inativo");
  const weekdays = ["1", "2", "3", "4", "5"];
  $("#deskGrid").innerHTML = weekdays.map((day) => {
    const fixedHome = activePeople.filter((person) => (person.fixed_home_days || []).includes(day)).length;
    const inOffice = activePeople.length - fixedHome;
    const freeDesks = 10 - inOffice;
    return `
      <article class="desk-card ${freeDesks < 0 ? "warning" : ""}">
        <strong>${weekdayName(day)}</strong>
        <div class="desk-count">${Math.max(freeDesks, 0)}</div>
        <span class="small">${inOffice} presenciais previstos de 10 baias</span>
      </article>
    `;
  }).join("");

  $("#homeOfficeList").innerHTML = state.homeOffice.map((item) => `
    <article class="calendar-item">
      <span class="badge">${item.action_type || "Home office"}</span>
      <h3>${personName(item.person_id)}</h3>
      <p class="small">${formatDate(item.work_date)}</p>
      ${item.note ? `<p>${item.note}</p>` : ""}
      <div class="row-actions">
        <button type="button" data-edit-home-office="${item.id}">${icon("pencil")}Editar</button>
        <button class="danger" type="button" data-delete-home-office="${item.id}">${icon("trash-2")}Excluir</button>
      </div>
    </article>
  `).join("") || `<div class="empty">Nenhum home office cadastrado.</div>`;

  renderTeamCalendar();
}

function peopleOnFixedHomeDate(dateValue) {
  const day = String(dateFromIso(dateValue).getDay());
  if (day === "0" || day === "6") return [];
  return state.people.filter((person) => person.status !== "Inativo" && (person.fixed_home_days || []).includes(day));
}

function vacationsOnDate(dateValue) {
  return state.vacations.filter((item) => item.start_date <= dateValue && item.end_date >= dateValue);
}

function adjustmentsOnDate(dateValue) {
  return state.homeOffice.filter((item) => item.work_date === dateValue);
}

function countOfficeDesks(dateValue) {
  const activePeople = state.people.filter((person) => person.status !== "Inativo");
  const fixedHomeIds = new Set(peopleOnFixedHomeDate(dateValue).map((person) => person.id));
  const vacationIds = new Set(vacationsOnDate(dateValue).map((item) => item.person_id));
  const adjustments = adjustmentsOnDate(dateValue);
  adjustments.forEach((item) => {
    if (item.action_type === "Home office extra" || item.action_type === "Troca de dia") fixedHomeIds.add(item.person_id);
    if (item.action_type === "Presencial extra") fixedHomeIds.delete(item.person_id);
  });
  const inOffice = activePeople.filter((person) => !fixedHomeIds.has(person.id) && !vacationIds.has(person.id)).length;
  return { inOffice, freeDesks: 10 - inOffice };
}

function renderTeamCalendar() {
  const monthSelect = $("#calendarMonth");
  const yearSelect = $("#calendarYear");
  if (!monthSelect.options.length) {
    const monthLabels = Array.from({ length: 12 }, (_, index) => new Date(2026, index, 1).toLocaleDateString("pt-BR", { month: "short" }));
    monthSelect.innerHTML = monthLabels.map((label, index) => `<option value="${index}">${label}</option>`).join("");
    const currentYear = new Date().getFullYear();
    yearSelect.innerHTML = Array.from({ length: 7 }, (_, index) => currentYear - 2 + index)
      .map((year) => `<option value="${year}">${year}</option>`)
      .join("");
  }

  monthSelect.value = String(calendarCursor.getMonth());
  yearSelect.value = String(calendarCursor.getFullYear());

  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const today = isoDate(new Date());
  const cells = [];

  for (let index = 0; index < 42; index += 1) {
    const cellDate = new Date(start);
    cellDate.setDate(start.getDate() + index);
    const value = isoDate(cellDate);
    const fixedHome = peopleOnFixedHomeDate(value);
    const vacations = vacationsOnDate(value);
    const adjustments = adjustmentsOnDate(value);
    cells.push(`
      <button class="calendar-day ${cellDate.getMonth() !== month ? "other-month" : ""} ${value === selectedCalendarDate ? "selected" : ""} ${value === today ? "today" : ""}" data-calendar-date="${value}" type="button">
        <span class="day-number">${cellDate.getDate()}</span>
        <span class="day-markers">
          ${fixedHome.length ? `<span class="day-marker home">H ${fixedHome.length}</span>` : ""}
          ${vacations.length ? `<span class="day-marker vacation">F ${vacations.length}</span>` : ""}
          ${adjustments.length ? `<span class="day-marker adjust">A ${adjustments.length}</span>` : ""}
        </span>
      </button>
    `);
  }

  $("#teamCalendar").innerHTML = cells.join("");
  renderCalendarDetail();
}

function renderCalendarDetail() {
  const fixedHome = peopleOnFixedHomeDate(selectedCalendarDate);
  const vacations = vacationsOnDate(selectedCalendarDate);
  const adjustments = adjustmentsOnDate(selectedCalendarDate);
  const desks = countOfficeDesks(selectedCalendarDate);
  const periodStart = $("#periodStart").value;
  const periodEnd = $("#periodEnd").value;
  const periodItems = periodStart && periodEnd
    ? [
        ...state.vacations
          .filter((item) => item.start_date <= periodEnd && item.end_date >= periodStart)
          .map((item) => `Férias: ${personName(item.person_id)} (${formatDate(item.start_date)} a ${formatDate(item.end_date)})`),
        ...state.homeOffice
          .filter((item) => item.work_date >= periodStart && item.work_date <= periodEnd)
          .map((item) => `${item.action_type || "Ajuste"}: ${personName(item.person_id)} (${formatDate(item.work_date)})`)
      ]
    : [];

  $("#calendarDetail").innerHTML = `
    <h3>${formatDate(selectedCalendarDate)}</h3>
    <div class="calendar-detail-block">
      <strong>Baias</strong>
      <p class="small">${Math.max(desks.freeDesks, 0)} livres de 10. ${desks.inOffice} pessoas presenciais previstas.</p>
    </div>
    <div class="calendar-detail-block">
      <strong>Home office fixo</strong>
      <p class="small">${fixedHome.length ? fixedHome.map((person) => person.name).join(", ") : "Ninguém em home fixo."}</p>
    </div>
    <div class="calendar-detail-block">
      <strong>Férias</strong>
      <p class="small">${vacations.length ? vacations.map((item) => personName(item.person_id)).join(", ") : "Nenhuma férias marcada."}</p>
    </div>
    <div class="calendar-detail-block">
      <strong>Ajustes e trocas</strong>
      <p class="small">${adjustments.length ? adjustments.map((item) => `${personName(item.person_id)} - ${item.action_type || "Ajuste"}`).join("<br>") : "Nenhum ajuste registrado."}</p>
    </div>
    <div class="calendar-detail-block">
      <button class="primary compact" id="newAdjustmentFromCalendar" type="button">Registrar ajuste nesta data</button>
    </div>
    ${periodItems.length ? `
      <div class="calendar-detail-block">
        <strong>Período selecionado</strong>
        <p class="small">${periodItems.join("<br>")}</p>
      </div>
    ` : ""}
  `;
}

function renderDocuments() {
  $("#documentCount").textContent = `${state.documents.length} documentos`;
  $("#documentsGrid").innerHTML = state.clients.map((client) => {
    const docs = state.documents.filter((doc) => doc.client_id === client.id);
    return `
      <article class="folder-card">
        <div class="folder-title">
          <h3>${client.name}</h3>
          <span class="badge">${docs.length}</span>
        </div>
        ${docs.map((doc) => `
          <div class="doc-line">
            <div>
              <strong>${doc.name}</strong>
              <div class="small">${doc.type}${doc.file_name ? ` - ${doc.file_name}` : ""}${doc.file_size ? ` (${fileSizeLabel(doc.file_size)})` : ""}</div>
            </div>
            <div class="doc-link">
              ${doc.link ? `<a href="${doc.link}" target="_blank" rel="noopener">${icon("external-link")}Abrir</a>` : `<span>Sem anexo</span>`}
            </div>
            <div class="row-actions">
              <button type="button" data-edit-document="${doc.id}">${icon("pencil")}Editar</button>
              <button class="danger" type="button" data-delete-document="${doc.id}">${icon("trash-2")}Excluir</button>
            </div>
          </div>
        `).join("") || `<p class="small">Pasta sem documentos.</p>`}
      </article>
    `;
  }).join("") || `<div class="empty">Cadastre clientes para organizar documentos por pasta.</div>`;
}

function renderTeam() {
  $("#teamCount").textContent = `${state.people.length} membros`;
  $("#teamGrid").innerHTML = state.people.map((person) => `
    <article class="team-card">
      <div class="avatar">${person.name.slice(0, 1)}</div>
      <h3>${person.name}</h3>
      <p class="small">${person.role}</p>
      <p>${person.email || "-"}</p>
      <p class="small">Home office fixo: ${homeDaysText(person.fixed_home_days || [])}</p>
      <span class="badge">${person.status}</span>
      <div class="row-actions">
        <button type="button" data-edit-team="${person.id}">${icon("pencil")}Editar</button>
        <button class="danger" type="button" data-delete-team="${person.id}">${icon("trash-2")}Excluir</button>
      </div>
    </article>
  `).join("") || `<div class="empty">Nenhum membro cadastrado.</div>`;
}

function renderSession() {
  const signedIn = isSignedIn();
  $("#loginScreen").classList.toggle("hidden", signedIn);
  $("#appShell").classList.toggle("hidden", !signedIn);
  $("#currentUserName").textContent = signedIn ? displayUserName() : "";
  $("#sidebarUserName").textContent = signedIn ? displayUserName() : "Usuário";
  $("#sidebarUserInitial").textContent = (signedIn ? displayUserName() : "S").slice(0, 1).toUpperCase();
  $("#authHint").textContent = hasSupabaseConfig
    ? "Use seu e-mail e senha. Se ainda não tiver acesso, crie a primeira conta ou solicite cadastro."
    : "Modo local de teste. Configure o Supabase para publicar com banco de dados compartilhado.";
  $("#loginMode").classList.toggle("active", authMode === "login");
  $("#signupMode").classList.toggle("active", authMode === "signup");
  $("#signupFields").classList.toggle("hidden", authMode !== "signup");
  $("#signupFirstName").required = authMode === "signup";
  $("#signupLastName").required = authMode === "signup";
  $("#signupRole").required = authMode === "signup";
  $("#authSubmit").textContent = authMode === "signup" ? "Criar conta" : "Entrar";
}

function renderActivityTab() {
  $("[data-activity-tab='tasks']").classList.toggle("active", activeActivityTab === "tasks");
  $("[data-activity-tab='assignments']").classList.toggle("active", activeActivityTab === "assignments");
  $("#assignmentTab").classList.toggle("hidden", activeActivityTab !== "assignments");
  $("#taskColumns").parentElement.classList.toggle("hidden", activeActivityTab !== "tasks");
  $(".toolbar").classList.toggle("hidden", activeActivityTab !== "tasks");
}

function renderAll() {
  fillAllSelects();
  renderSession();
  renderActivityTab();
  renderDashboard();
  renderClients();
  renderTasks();
  renderAssignments();
  renderReimbursements();
  renderVacations();
  renderHomeOffice();
  renderDocuments();
  renderTeam();
  refreshIcons();
}

function openModal(id, options = {}) {
  const { reset = true } = options;
  const modal = document.getElementById(id);
  if (!modal) return;
  $$(".modal-card").forEach((item) => item.classList.add("hidden"));
  if (reset) {
    modal.reset();
    if (id === "clientForm") resetClientForm(false);
    if (id === "teamForm") resetTeamForm(false);
    if (id === "taskForm") resetTaskForm(false);
    if (id === "assignmentForm") resetAssignmentForm(false);
    if (id === "reimbursementForm") resetReimbursementForm(false);
    if (id === "vacationForm") resetVacationForm(false);
    if (id === "homeOfficeForm") resetHomeOfficeForm(false);
    if (id === "documentForm") resetDocumentForm(false);
  }
  $("#modalBackdrop").classList.remove("hidden");
  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeModals(reset = true) {
  $$(".modal-card").forEach((modal) => {
    modal.classList.add("hidden");
    if (reset) modal.reset();
  });
  $("#modalBackdrop").classList.add("hidden");
  document.body.classList.remove("modal-open");
  if (reset) resetClientForm(false);
  if (reset) resetTeamForm(false);
  if (reset) resetTaskForm(false);
  if (reset) resetAssignmentForm(false);
  if (reset) resetReimbursementForm(false);
  if (reset) resetVacationForm(false);
  if (reset) resetHomeOfficeForm(false);
  if (reset) resetDocumentForm(false);
}

function resetClientForm(close = false) {
  const form = $("#clientForm");
  form.reset();
  form.elements.id.value = "";
  $("#clientFormTitle").textContent = "Novo cliente";
  $("#clientSubmit").textContent = "Cadastrar cliente";
  $("#cancelClientEdit").classList.add("hidden");
  if (close) closeModals(false);
}

function resetTeamForm(close = false) {
  const form = $("#teamForm");
  form.reset();
  form.elements.id.value = "";
  $("#teamFormTitle").textContent = "Novo membro";
  $("#teamSubmit").textContent = "Cadastrar membro";
  $("#cancelTeamEdit").classList.add("hidden");
  if (close) closeModals(false);
}

function resetEditForm(formId, titleId, title, submitId, submitText, cancelId, close = false) {
  const form = $(`#${formId}`);
  form.reset();
  form.elements.id.value = "";
  $(`#${titleId}`).textContent = title;
  $(`#${submitId}`).textContent = submitText;
  $(`#${cancelId}`).classList.add("hidden");
  if (close) closeModals(false);
}

function resetTaskForm(close = false) {
  resetEditForm("taskForm", "taskFormTitle", "Nova atividade", "taskSubmit", "Criar atividade", "cancelTaskEdit", close);
}

function resetAssignmentForm(close = false) {
  resetEditForm("assignmentForm", "assignmentFormTitle", "Nova distribuição", "assignmentSubmit", "Salvar distribuição", "cancelAssignmentEdit", close);
}

function resetReimbursementForm(close = false) {
  resetEditForm("reimbursementForm", "reimbursementFormTitle", "Novo reembolso", "reimbursementSubmit", "Cadastrar reembolso", "cancelReimbursementEdit", close);
}

function resetVacationForm(close = false) {
  resetEditForm("vacationForm", "vacationFormTitle", "Novo período", "vacationSubmit", "Registrar férias", "cancelVacationEdit", close);
}

function resetHomeOfficeForm(close = false) {
  resetEditForm("homeOfficeForm", "homeOfficeFormTitle", "Novo ajuste", "homeOfficeSubmit", "Registrar ajuste", "cancelHomeOfficeEdit", close);
}

function resetDocumentForm(close = false) {
  resetEditForm("documentForm", "documentFormTitle", "Novo documento", "documentSubmit", "Adicionar documento", "cancelDocumentEdit", close);
}

function setSelectedValues(select, values = []) {
  Array.from(select.options).forEach((option) => {
    option.selected = values.includes(option.value);
  });
}

function editClient(id) {
  const client = state.clients.find((item) => item.id === id);
  if (!client) return;
  const form = $("#clientForm");
  form.elements.id.value = client.id;
  form.elements.name.value = client.name || "";
  form.elements.tax_id.value = client.tax_id || "";
  form.elements.company.value = client.company || "";
  form.elements.email.value = client.email || "";
  form.elements.phone.value = client.phone || "";
  form.elements.owner.value = client.owner || "";
  form.elements.status.value = client.status || "Ativo";
  form.elements.notes.value = client.notes || "";
  $("#clientFormTitle").textContent = "Editar cliente";
  $("#clientSubmit").textContent = "Salvar alterações";
  $("#cancelClientEdit").classList.remove("hidden");
  openModal("clientForm", { reset: false });
}

function editTeamMember(id) {
  const person = state.people.find((item) => item.id === id);
  if (!person) return;
  const form = $("#teamForm");
  form.elements.id.value = person.id;
  form.elements.name.value = person.name || "";
  form.elements.role.value = person.role || "";
  form.elements.email.value = person.email || "";
  form.elements.status.value = person.status || "Ativo";
  Array.from(form.elements.fixed_home_days.options).forEach((option) => {
    option.selected = (person.fixed_home_days || []).includes(option.value);
  });
  $("#teamFormTitle").textContent = "Editar membro";
  $("#teamSubmit").textContent = "Salvar alterações";
  $("#cancelTeamEdit").classList.remove("hidden");
  openModal("teamForm", { reset: false });
}

function editTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  const form = $("#taskForm");
  form.elements.id.value = task.id;
  form.elements.title.value = task.title || "";
  form.elements.client.value = task.client_id || "";
  setSelectedValues(form.elements.people, task.people_ids || []);
  form.elements.category.value = task.category || "Reembolso";
  form.elements.priority.value = task.priority === "Media" ? "Média" : task.priority || "Média";
  form.elements.due.value = task.due_date || "";
  form.elements.status.value = taskStatus(task.status);
  form.elements.description.value = task.description || "";
  $("#taskFormTitle").textContent = "Editar atividade";
  $("#taskSubmit").textContent = "Salvar alterações";
  $("#cancelTaskEdit").classList.remove("hidden");
  openModal("taskForm", { reset: false });
}

function editAssignment(id) {
  const item = state.assignments.find((record) => record.id === id);
  if (!item) return;
  const form = $("#assignmentForm");
  form.elements.id.value = item.id;
  form.elements.month.value = item.month || "";
  form.elements.client.value = item.client_id || "";
  setSelectedValues(form.elements.people, item.people_ids || []);
  form.elements.note.value = item.note || "";
  $("#assignmentFormTitle").textContent = "Editar distribuição";
  $("#assignmentSubmit").textContent = "Salvar alterações";
  $("#cancelAssignmentEdit").classList.remove("hidden");
  openModal("assignmentForm", { reset: false });
}

function editReimbursement(id) {
  const item = state.reimbursements.find((record) => record.id === id);
  if (!item) return;
  const form = $("#reimbursementForm");
  form.elements.id.value = item.id;
  form.elements.period.value = item.period || "";
  form.elements.due_date.value = item.due_date || "";
  form.elements.description.value = item.description || "";
  form.elements.expense_type.value = item.expense_type === "Diligencia" ? "Diligência" : item.expense_type || "Custas";
  form.elements.client.value = item.client_id || "";
  form.elements.person.value = item.person_id || "";
  form.elements.amount.value = item.amount || "";
  form.elements.status.value = reimbursementStatus(item.status) || "Pendente";
  form.elements.document_number.value = item.document_number || "";
  form.elements.notes.value = item.notes || "";
  $("#reimbursementFormTitle").textContent = "Editar reembolso";
  $("#reimbursementSubmit").textContent = "Salvar alterações";
  $("#cancelReimbursementEdit").classList.remove("hidden");
  openModal("reimbursementForm", { reset: false });
}

function editVacation(id) {
  const item = state.vacations.find((record) => record.id === id);
  if (!item) return;
  const form = $("#vacationForm");
  form.elements.id.value = item.id;
  form.elements.person.value = item.person_id || "";
  form.elements.start.value = item.start_date || "";
  form.elements.end.value = item.end_date || "";
  form.elements.status.value = vacationStatus(item.status) || "Programada";
  form.elements.note.value = item.note || "";
  $("#vacationFormTitle").textContent = "Editar período";
  $("#vacationSubmit").textContent = "Salvar alterações";
  $("#cancelVacationEdit").classList.remove("hidden");
  openModal("vacationForm", { reset: false });
}

function editHomeOffice(id) {
  const item = state.homeOffice.find((record) => record.id === id);
  if (!item) return;
  const form = $("#homeOfficeForm");
  form.elements.id.value = item.id;
  form.elements.person.value = item.person_id || "";
  form.elements.date.value = item.work_date || "";
  form.elements.action_type.value = item.action_type || "Home office extra";
  form.elements.note.value = item.note || "";
  $("#homeOfficeFormTitle").textContent = "Editar ajuste";
  $("#homeOfficeSubmit").textContent = "Salvar alterações";
  $("#cancelHomeOfficeEdit").classList.remove("hidden");
  openModal("homeOfficeForm", { reset: false });
}

function editDocument(id) {
  const item = state.documents.find((record) => record.id === id);
  if (!item) return;
  const form = $("#documentForm");
  form.elements.id.value = item.id;
  form.elements.client.value = item.client_id || "";
  form.elements.name.value = item.name || "";
  form.elements.type.value = item.type === "Padrao de atividade" ? "Padrão de atividade" : item.type === "Orientacao" ? "Orientação" : item.type || "Passo a passo";
  form.elements.link.value = item.link || "";
  form.elements.document_file.value = "";
  $("#documentFormTitle").textContent = "Editar documento";
  $("#documentSubmit").textContent = "Salvar alterações";
  $("#cancelDocumentEdit").classList.remove("hidden");
  openModal("documentForm", { reset: false });
}

async function handleSubmit(form, work, message) {
  const data = Object.fromEntries(new FormData(form).entries());
  await work(data, form);
  if (isSignedIn()) await loadRemoteState();
  form.reset();
  renderAll();
  closeModals(false);
  toast(message);
}

async function changeTaskStatus(id, status) {
  await updateRecord("tasks", id, { status });
  if (isSignedIn()) await loadRemoteState();
  renderAll();
  toast("Andamento atualizado.");
}

async function deleteTask(id) {
  const confirmed = window.confirm("Excluir esta atividade?");
  if (!confirmed) return;
  await deleteRecord("tasks", id);
  if (isSignedIn()) await loadRemoteState();
  renderAll();
  toast("Atividade excluída.");
}

async function deleteEntity(key, id, message, confirmMessage = "Excluir este registro?") {
  const confirmed = window.confirm(confirmMessage);
  if (!confirmed) return;
  await deleteRecord(key, id);
  if (isSignedIn()) await loadRemoteState();
  renderAll();
  toast(message);
}

function setupForms() {
  $("#clientForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleSubmit(event.currentTarget, (data) => {
      const payload = {
        name: data.name,
        tax_id: data.tax_id,
        company: data.company,
        email: data.email,
        phone: data.phone,
        owner: data.owner,
        status: data.status,
        notes: data.notes
      };
      return data.id ? updateRecord("clients", data.id, payload) : insertRecord("clients", payload);
    }, event.currentTarget.elements.id.value ? "Cliente atualizado." : "Cliente cadastrado.");
    resetClientForm();
  });

  $("#teamForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleSubmit(event.currentTarget, (data, form) => {
      const payload = {
        name: data.name,
        role: data.role,
        email: data.email,
        fixed_home_days: selectedValues(form.elements.fixed_home_days),
        status: data.status
      };
      return data.id ? updateRecord("people", data.id, payload) : insertRecord("people", payload);
    }, event.currentTarget.elements.id.value ? "Membro atualizado." : "Membro cadastrado.");
    resetTeamForm();
  });

  $("#taskForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleSubmit(event.currentTarget, (data, form) => {
      const payload = {
        title: data.title,
        client_id: data.client,
        people_ids: selectedValues(form.elements.people),
        category: data.category,
        priority: data.priority,
        due_date: data.due,
        status: data.status,
        description: data.description
      };
      return data.id ? updateRecord("tasks", data.id, payload) : insertRecord("tasks", payload);
    }, event.currentTarget.elements.id.value ? "Atividade atualizada." : "Atividade criada.");
    resetTaskForm();
  });

  $("#assignmentForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleSubmit(event.currentTarget, (data, form) => {
      const payload = {
        month: data.month,
        client_id: data.client,
        people_ids: selectedValues(form.elements.people),
        note: data.note
      };
      return data.id ? updateRecord("assignments", data.id, payload) : insertRecord("assignments", payload);
    }, event.currentTarget.elements.id.value ? "Distribuição atualizada." : "Distribuição salva.");
    resetAssignmentForm();
  });

  $("#reimbursementForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleSubmit(event.currentTarget, (data) => {
      const payload = {
        client_id: data.client,
        person_id: data.person,
        period: data.period,
        due_date: data.due_date || null,
        description: data.description,
        expense_type: data.expense_type,
        amount: Number(data.amount),
        status: data.status,
        document_number: data.document_number,
        notes: data.notes
      };
      return data.id ? updateRecord("reimbursements", data.id, payload) : insertRecord("reimbursements", payload);
    }, event.currentTarget.elements.id.value ? "Reembolso atualizado." : "Reembolso cadastrado.");
    resetReimbursementForm();
  });

  $("#vacationForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleSubmit(event.currentTarget, (data) => {
      const payload = {
        person_id: data.person,
        start_date: data.start,
        end_date: data.end,
        status: data.status,
        note: data.note
      };
      return data.id ? updateRecord("vacations", data.id, payload) : insertRecord("vacations", payload);
    }, event.currentTarget.elements.id.value ? "Férias atualizadas." : "Férias registradas.");
    resetVacationForm();
  });

  $("#homeOfficeForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleSubmit(event.currentTarget, (data) => {
      const payload = {
        person_id: data.person,
        client_id: null,
        work_date: data.date,
        action_type: data.action_type,
        note: data.note
      };
      return data.id ? updateRecord("homeOffice", data.id, payload) : insertRecord("homeOffice", payload);
    }, event.currentTarget.elements.id.value ? "Home office atualizado." : "Home office registrado.");
    resetHomeOfficeForm();
  });

  $("#documentForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleSubmit(event.currentTarget, async (data, form) => {
      const current = data.id ? state.documents.find((item) => item.id === data.id) : null;
      const file = form.elements.document_file.files[0];
      const upload = file ? await uploadDocumentFile(file, data.client) : null;
      const payload = {
        client_id: data.client,
        name: data.name,
        type: data.type,
        link: upload?.link || data.link || current?.link || "",
        file_name: upload?.file_name || current?.file_name || "",
        file_type: upload?.file_type || current?.file_type || "",
        file_size: upload?.file_size || current?.file_size || null,
        file_path: upload?.file_path || current?.file_path || ""
      };
      if (upload?.file_path && current?.file_path && current.file_path !== upload.file_path) {
        await removeDocumentFile(current.file_path);
      }
      return data.id ? updateRecord("documents", data.id, payload) : insertRecord("documents", payload);
    }, event.currentTarget.elements.id.value ? "Documento atualizado." : "Documento adicionado.");
    resetDocumentForm();
  });
}

function setupNavigation() {
  $$(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      activeView = button.dataset.view;
      $$(".nav-item").forEach((item) => item.classList.toggle("active", item === button));
      $$(".view").forEach((view) => view.classList.toggle("active", view.id === activeView));
      $("#pageTitle").textContent = button.textContent;
    });
  });
}

function setupFilters() {
  $("#globalSearch").addEventListener("input", renderAll);
  $("#taskStatusFilter").addEventListener("change", renderTasks);
  $("#taskClientFilter").addEventListener("change", renderTasks);
  $("#taskColumns").addEventListener("change", async (event) => {
    const id = event.target.dataset.taskStatus;
    if (!id) return;
    await changeTaskStatus(id, event.target.value);
  });
  $("#taskColumns").addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-task]");
    const deleteButton = event.target.closest("[data-delete-task]");
    if (editButton) {
      editTask(editButton.dataset.editTask);
      return;
    }
    if (deleteButton) await deleteTask(deleteButton.dataset.deleteTask);
  });
  [
    "#reimbursementPeriodFilter",
    "#reimbursementStatusFilter",
    "#reimbursementClientFilter",
    "#reimbursementPersonFilter",
    "#reimbursementTypeFilter"
  ].forEach((selector) => $(selector).addEventListener("change", renderReimbursements));
  $("#reimbursementTextFilter").addEventListener("input", renderReimbursements);

  $("#clearReimbursementFilters").addEventListener("click", () => {
    $("#reimbursementPeriodFilter").value = "";
    $("#reimbursementStatusFilter").value = "";
    $("#reimbursementClientFilter").value = "";
    $("#reimbursementPersonFilter").value = "";
    $("#reimbursementTypeFilter").value = "";
    $("#reimbursementTextFilter").value = "";
    renderReimbursements();
  });

  $("#assignmentGrid").addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-assignment]");
    const deleteButton = event.target.closest("[data-delete-assignment]");
    if (editButton) {
      editAssignment(editButton.dataset.editAssignment);
      return;
    }
    if (deleteButton) await deleteEntity("assignments", deleteButton.dataset.deleteAssignment, "Distribuição excluída.");
  });

  $("#reimbursementsTable").addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-reimbursement]");
    const deleteButton = event.target.closest("[data-delete-reimbursement]");
    if (editButton) {
      editReimbursement(editButton.dataset.editReimbursement);
      return;
    }
    if (deleteButton) await deleteEntity("reimbursements", deleteButton.dataset.deleteReimbursement, "Reembolso excluído.");
  });

  $("#vacationList").addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-vacation]");
    const deleteButton = event.target.closest("[data-delete-vacation]");
    if (editButton) {
      editVacation(editButton.dataset.editVacation);
      return;
    }
    if (deleteButton) await deleteEntity("vacations", deleteButton.dataset.deleteVacation, "Férias excluídas.");
  });

  $("#homeOfficeList").addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-home-office]");
    const deleteButton = event.target.closest("[data-delete-home-office]");
    if (editButton) {
      editHomeOffice(editButton.dataset.editHomeOffice);
      return;
    }
    if (deleteButton) await deleteEntity("homeOffice", deleteButton.dataset.deleteHomeOffice, "Home office excluído.");
  });

  $("#documentsGrid").addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-document]");
    const deleteButton = event.target.closest("[data-delete-document]");
    if (editButton) {
      editDocument(editButton.dataset.editDocument);
      return;
    }
    if (deleteButton) {
      const id = deleteButton.dataset.deleteDocument;
      const item = state.documents.find((record) => record.id === id);
      const confirmed = window.confirm("Excluir este documento?");
      if (!confirmed) return;
      await removeDocumentFile(item?.file_path);
      await deleteRecord("documents", id);
      if (isSignedIn()) await loadRemoteState();
      renderAll();
      toast("Documento excluído.");
    }
  });
}

function exportCsv() {
  const rows = [["Competência", "Descrição", "Cliente", "Responsável", "Vencimento", "Tipo", "Valor", "Status", "Nº Doc."]];
  filteredReimbursements().forEach((item) => {
    rows.push([formatMonth(item.period), item.description || "", clientName(item.client_id), personName(item.person_id), formatDate(item.due_date), item.expense_type || "", item.amount, reimbursementStatus(item.status), item.document_number || ""]);
  });
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "serur-reembolsos.csv";
  link.click();
  URL.revokeObjectURL(url);
}

async function submitAuth(event) {
  event.preventDefault();
  const email = $("#authEmail").value.trim();
  const password = $("#authPassword").value;

  if (!hasSupabaseConfig) {
    const localState = loadLocalState();
    let person = localState.people.find((item) => item.email === email);
    if (!person && authMode === "signup") {
      person = {
        id: uid("p"),
        name: fullSignupName(),
        role: $("#signupRole").value.trim(),
        email,
        fixed_home_days: [],
        status: "Ativo"
      };
      localState.people.push(person);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(localState));
    }
    if (!person) {
      toast("Crie uma conta local para testar.");
      return;
    }
    localStorage.setItem(USER_KEY, person.id);
    await refreshData();
    toast("Acesso liberado.");
    return;
  }

  if (authMode === "signup") {
    const fullName = fullSignupName();
    const { data, error } = await db.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          first_name: $("#signupFirstName").value.trim(),
          last_name: $("#signupLastName").value.trim()
        }
      }
    });
    if (error) throw error;
    currentUser = data.user;
    if (currentUser) {
      await insertRecord("people", {
        user_id: currentUser.id,
        name: fullName,
        role: $("#signupRole").value.trim(),
        email,
        fixed_home_days: [],
        status: "Ativo"
      });
    }
    toast("Conta criada. Confira o e-mail se a confirmação estiver ativa.");
  } else {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user;
    toast("Acesso liberado.");
  }

  await refreshData();
}

function setupActions() {
  $$("[data-open-modal]").forEach((button) => {
    button.addEventListener("click", () => openModal(button.dataset.openModal));
  });

  $$("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => closeModals());
  });

  $("#modalBackdrop").addEventListener("click", () => closeModals());

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModals();
  });

  $("#prevCalendarMonth").addEventListener("click", () => {
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1);
    renderTeamCalendar();
  });

  $("#nextCalendarMonth").addEventListener("click", () => {
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1);
    renderTeamCalendar();
  });

  $("#todayCalendar").addEventListener("click", () => {
    calendarCursor = new Date();
    selectedCalendarDate = isoDate(new Date());
    renderTeamCalendar();
  });

  $("#calendarMonth").addEventListener("change", (event) => {
    calendarCursor = new Date(calendarCursor.getFullYear(), Number(event.target.value), 1);
    renderTeamCalendar();
  });

  $("#calendarYear").addEventListener("change", (event) => {
    calendarCursor = new Date(Number(event.target.value), calendarCursor.getMonth(), 1);
    renderTeamCalendar();
  });

  $("#periodStart").addEventListener("change", renderCalendarDetail);
  $("#periodEnd").addEventListener("change", renderCalendarDetail);

  $("#teamCalendar").addEventListener("click", (event) => {
    const button = event.target.closest("[data-calendar-date]");
    if (!button) return;
    selectedCalendarDate = button.dataset.calendarDate;
    calendarCursor = dateFromIso(selectedCalendarDate);
    renderTeamCalendar();
  });

  $("#calendarDetail").addEventListener("click", (event) => {
    if (event.target.id !== "newAdjustmentFromCalendar") return;
    openModal("homeOfficeForm");
    $("#homeOfficeForm").elements.date.value = selectedCalendarDate;
  });

  $$("[data-activity-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      activeActivityTab = button.dataset.activityTab;
      renderActivityTab();
    });
  });

  $("#cancelClientEdit").addEventListener("click", () => resetClientForm(true));
  $("#cancelTeamEdit").addEventListener("click", () => resetTeamForm(true));
  $("#cancelTaskEdit").addEventListener("click", () => resetTaskForm(true));
  $("#cancelAssignmentEdit").addEventListener("click", () => resetAssignmentForm(true));
  $("#cancelReimbursementEdit").addEventListener("click", () => resetReimbursementForm(true));
  $("#cancelVacationEdit").addEventListener("click", () => resetVacationForm(true));
  $("#cancelHomeOfficeEdit").addEventListener("click", () => resetHomeOfficeForm(true));
  $("#cancelDocumentEdit").addEventListener("click", () => resetDocumentForm(true));

  $("#clientsTable").addEventListener("click", async (event) => {
    const editId = event.target.dataset.editClient;
    const deleteId = event.target.dataset.deleteClient;
    if (editId) {
      editClient(editId);
      return;
    }
    if (deleteId) {
      const confirmed = window.confirm("Excluir este cliente? Atividades e documentos vinculados também podem ser afetados.");
      if (!confirmed) return;
      await deleteRecord("clients", deleteId);
      await loadRemoteState();
      renderAll();
      toast("Cliente excluído.");
    }
  });

  $("#teamGrid").addEventListener("click", async (event) => {
    const editId = event.target.dataset.editTeam;
    const deleteId = event.target.dataset.deleteTeam;
    if (editId) {
      editTeamMember(editId);
      return;
    }
    if (deleteId) {
      const linkedRecords = [
        ...state.tasks.filter((item) => (item.people_ids || []).includes(deleteId)),
        ...state.assignments.filter((item) => (item.people_ids || []).includes(deleteId)),
        ...state.reimbursements.filter((item) => item.person_id === deleteId),
        ...state.vacations.filter((item) => item.person_id === deleteId),
        ...state.homeOffice.filter((item) => item.person_id === deleteId)
      ];
      const message = linkedRecords.length
        ? "Este membro possui registros vinculados. Excluir pode afetar atividades, reembolsos, férias ou home office. Deseja continuar?"
        : "Excluir este membro da equipe?";
      const confirmed = window.confirm(message);
      if (!confirmed) return;
      await deleteRecord("people", deleteId);
      await loadRemoteState();
      renderAll();
      toast("Membro excluído.");
    }
  });

  $("#loginMode").addEventListener("click", () => {
    authMode = "login";
    renderSession();
  });
  $("#signupMode").addEventListener("click", () => {
    authMode = "signup";
    renderSession();
  });
  $("#loginForm").addEventListener("submit", (event) => {
    submitAuth(event).catch((error) => toast(error.message || "Não foi possível acessar."));
  });
  $("#logout").addEventListener("click", async () => {
    if (hasSupabaseConfig) {
      await db.auth.signOut();
    } else {
      localStorage.removeItem(USER_KEY);
    }
    currentUser = null;
    currentMember = null;
    state = structuredClone(emptyState);
    renderAll();
  });
  $("#resetData").addEventListener("click", async () => {
    if (hasSupabaseConfig) {
      await refreshData();
      toast("Dados atualizados.");
    } else {
      await refreshData();
      toast("Dados locais atualizados.");
    }
  });
  $("#exportCsv").addEventListener("click", exportCsv);
}

async function init() {
  setupNavigation();
  setupForms();
  setupFilters();
  setupActions();
  await refreshData();
}

init().catch((error) => {
  console.error(error);
  toast(error.message || "Erro ao carregar o sistema.");
  renderAll();
});
