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

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function clientName(id) {
  return state.clients.find((client) => client.id === id)?.name || "Cliente nao encontrado";
}

function personName(id) {
  return state.people.find((person) => person.id === id)?.name || "Pessoa nao encontrada";
}

function peopleChips(ids = []) {
  return ids.map((id) => `<span class="chip">${personName(id)}</span>`).join("");
}

function weekdayName(value) {
  const names = { 1: "Segunda", 2: "Terca", 3: "Quarta", 4: "Quinta", 5: "Sexta" };
  return names[String(value)] || value;
}

function homeDaysText(days = []) {
  return days.length ? days.map(weekdayName).join(", ") : "Sem dia fixo";
}

function statusClass(status) {
  return (status || "").split(" ")[0];
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
    ["#homeOfficeClientSelect", "Sem cliente especifico"],
    ["#documentClientSelect", null]
  ].forEach(([selector, placeholder]) => fillSelect($(selector), state.clients, placeholder));

  [
    "#taskPeopleSelect",
    "#assignmentPeopleSelect",
    "#reimbursementPersonSelect",
    "#vacationPersonSelect",
    "#homeOfficePersonSelect"
  ].forEach((selector) => fillSelect($(selector), state.people));

  fillSelect($("#taskClientFilter"), state.clients, "Todos os clientes");
}

function renderDashboard() {
  const pendingTasks = state.tasks.filter((task) => task.status !== "Concluida");
  const overdueTasks = state.tasks.filter((task) => task.status === "Atrasada");
  const pendingReimbursements = state.reimbursements.filter((item) => item.status !== "Pago");
  const reimbursementTotal = pendingReimbursements.reduce((sum, item) => sum + Number(item.amount), 0);

  $("#metricsGrid").innerHTML = [
    ["Clientes ativos", state.clients.filter((client) => client.status === "Ativo").length],
    ["Atividades abertas", pendingTasks.length],
    ["Reembolsos pendentes", money(reimbursementTotal)],
    ["Demandas atrasadas", overdueTasks.length]
  ].map(([label, value]) => `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`).join("");

  $("#todayLabel").textContent = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  $("#dashboardTasks").innerHTML = state.tasks
    .filter((task) => task.status !== "Concluida")
    .slice(0, 5)
    .map(taskCard)
    .join("") || `<div class="empty">Nenhuma atividade aberta.</div>`;

  const agenda = [
    ...state.vacations.map((item) => ({ type: "Ferias", date: item.start_date, title: personName(item.person_id), text: `${formatDate(item.start_date)} a ${formatDate(item.end_date)}` })),
    ...state.homeOffice.map((item) => ({ type: "Home office", date: item.work_date, title: personName(item.person_id), text: `${formatDate(item.work_date)} - ${item.client_id ? clientName(item.client_id) : "Sem cliente especifico"}` }))
  ].sort((a, b) => a.date.localeCompare(b.date));

  $("#teamAgenda").innerHTML = agenda.map((item) => `
    <article class="timeline-item">
      <span class="badge">${item.type}</span>
      <h3>${item.title}</h3>
      <p class="small">${item.text}</p>
    </article>
  `).join("") || `<div class="empty">Agenda sem registros.</div>`;
}

function taskCard(task) {
  return `
    <article class="task-card">
      <strong>${task.title}</strong>
      <div class="task-meta">
        <span class="badge ${statusClass(task.status)}">${task.status}</span>
        <span>${clientName(task.client_id)}</span>
        <span>Prazo: ${formatDate(task.due_date)}</span>
        <span>${task.priority}</span>
      </div>
      <div>${peopleChips(task.people_ids)}</div>
      ${task.description ? `<p class="small">${task.description}</p>` : ""}
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
            <button type="button" data-edit-client="${client.id}">Editar</button>
            <button class="danger" type="button" data-delete-client="${client.id}">Excluir</button>
          </div>
        </td>
      </tr>
    `);
  $("#clientsTable").innerHTML = rows.join("") || `<tr><td colspan="6">Nenhum cliente encontrado.</td></tr>`;
  $("#clientCount").textContent = `${state.clients.length} cadastrados`;
}

function renderTasks() {
  const statuses = ["Pendente", "Em andamento", "Aguardando cliente", "Concluida", "Atrasada"];
  const statusFilter = $("#taskStatusFilter").value;
  const clientFilter = $("#taskClientFilter").value;
  const filtered = state.tasks.filter((task) => {
    const haystack = `${task.title} ${clientName(task.client_id)} ${(task.people_ids || []).map(personName).join(" ")}`;
    return matchesSearch(haystack) && (!statusFilter || task.status === statusFilter) && (!clientFilter || task.client_id === clientFilter);
  });

  $("#taskColumns").innerHTML = statuses.map((status) => {
    const tasks = filtered.filter((task) => task.status === status);
    return `
      <section class="task-column">
        <h3>${status}<span>${tasks.length}</span></h3>
        ${tasks.map(taskCard).join("") || `<div class="empty">Sem atividades.</div>`}
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
    </article>
  `).join("") || `<div class="empty">Nenhuma distribuicao cadastrada.</div>`;
}

function renderReimbursements() {
  const total = state.reimbursements.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const pending = state.reimbursements.filter((item) => item.status !== "Pago").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const overdue = state.reimbursements.filter((item) => item.status === "Vencido").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  $("#reimbursementMetrics").innerHTML = [
    ["Total", money(total)],
    ["Pendente", money(pending)],
    ["Vencido", money(overdue)],
    ["Registros", state.reimbursements.length]
  ].map(([label, value]) => `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`).join("");

  $("#reimbursementsTable").innerHTML = state.reimbursements.map((item) => `
    <tr>
      <td><span class="badge">${formatMonth(item.period)}</span></td>
      <td><strong>${item.description || "-"}</strong><br><span class="small">${item.expense_type || "Sem tipo"}</span></td>
      <td>${clientName(item.client_id)}</td>
      <td>${personName(item.person_id)}</td>
      <td>${formatDate(item.due_date)}</td>
      <td><strong>${money(item.amount)}</strong></td>
      <td><span class="badge ${statusClass(item.status)}">${item.status}</span></td>
      <td>${item.document_number || "-"}</td>
    </tr>
  `).join("") || `<tr><td colspan="8">Nenhum reembolso cadastrado.</td></tr>`;
}

function renderVacations() {
  $("#vacationCount").textContent = `${state.vacations.length} periodos`;
  $("#vacationList").innerHTML = state.vacations.map((item) => `
    <article class="calendar-item">
      <span class="badge ${statusClass(item.status)}">${item.status}</span>
      <h3>${personName(item.person_id)}</h3>
      <p class="small">${formatDate(item.start_date)} a ${formatDate(item.end_date)}</p>
      ${item.note ? `<p>${item.note}</p>` : ""}
    </article>
  `).join("") || `<div class="empty">Nenhum periodo cadastrado.</div>`;
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
      <p class="small">${formatDate(item.work_date)} - ${item.client_id ? clientName(item.client_id) : "Sem cliente especifico"}</p>
      ${item.note ? `<p>${item.note}</p>` : ""}
    </article>
  `).join("") || `<div class="empty">Nenhum home office cadastrado.</div>`;
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
              <div class="small">${doc.type}</div>
            </div>
            <span>${doc.link || "Sem link"}</span>
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
    </article>
  `).join("") || `<div class="empty">Nenhum membro cadastrado.</div>`;
}

function renderSession() {
  const signedIn = isSignedIn();
  $("#loginScreen").classList.toggle("hidden", signedIn);
  $("#appShell").classList.toggle("hidden", !signedIn);
  $("#currentUserName").textContent = currentMember?.name || currentUser?.email || "";
  $("#authHint").textContent = hasSupabaseConfig
    ? "Use seu e-mail e senha. Se ainda nao tiver acesso, crie a primeira conta ou solicite cadastro."
    : "Modo local de teste. Configure o Supabase para publicar com banco de dados compartilhado.";
  $("#loginMode").classList.toggle("active", authMode === "login");
  $("#signupMode").classList.toggle("active", authMode === "signup");
  $("#signupFields").classList.toggle("hidden", authMode !== "signup");
  $("#signupName").required = authMode === "signup";
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
}

function openModal(id, options = {}) {
  const { reset = true } = options;
  const modal = document.getElementById(id);
  if (!modal) return;
  $$(".modal-card").forEach((item) => item.classList.add("hidden"));
  if (reset) {
    modal.reset();
    if (id === "clientForm") resetClientForm(false);
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
  $("#clientSubmit").textContent = "Salvar alteracoes";
  $("#cancelClientEdit").classList.remove("hidden");
  openModal("clientForm", { reset: false });
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
    await handleSubmit(event.currentTarget, (data, form) => insertRecord("people", {
      name: data.name,
      role: data.role,
      email: data.email,
      fixed_home_days: selectedValues(form.elements.fixed_home_days),
      status: data.status
    }), "Membro cadastrado.");
  });

  $("#taskForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleSubmit(event.currentTarget, (data, form) => insertRecord("tasks", {
      title: data.title,
      client_id: data.client,
      people_ids: selectedValues(form.elements.people),
      category: data.category,
      priority: data.priority,
      due_date: data.due,
      status: data.status,
      description: data.description
    }), "Atividade criada.");
  });

  $("#assignmentForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleSubmit(event.currentTarget, (data, form) => insertRecord("assignments", {
      month: data.month,
      client_id: data.client,
      people_ids: selectedValues(form.elements.people),
      note: data.note
    }), "Distribuicao salva.");
  });

  $("#reimbursementForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleSubmit(event.currentTarget, (data) => insertRecord("reimbursements", {
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
    }), "Reembolso cadastrado.");
  });

  $("#vacationForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleSubmit(event.currentTarget, (data) => insertRecord("vacations", {
      person_id: data.person,
      start_date: data.start,
      end_date: data.end,
      status: data.status,
      note: data.note
    }), "Ferias registradas.");
  });

  $("#homeOfficeForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleSubmit(event.currentTarget, (data) => insertRecord("homeOffice", {
      person_id: data.person,
      client_id: data.client || null,
      work_date: data.date,
      action_type: data.action_type,
      note: data.note
    }), "Home office registrado.");
  });

  $("#documentForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleSubmit(event.currentTarget, (data) => insertRecord("documents", {
      client_id: data.client,
      name: data.name,
      type: data.type,
      link: data.link
    }), "Documento adicionado.");
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
}

function exportCsv() {
  const rows = [["Cliente", "Responsavel", "Competencia", "Valor", "Status"]];
  state.reimbursements.forEach((item) => {
    rows.push([clientName(item.client_id), personName(item.person_id), formatMonth(item.period), item.amount, item.status]);
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
        name: $("#signupName").value.trim(),
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
    const { data, error } = await db.auth.signUp({ email, password });
    if (error) throw error;
    currentUser = data.user;
    if (currentUser) {
      await insertRecord("people", {
        user_id: currentUser.id,
        name: $("#signupName").value.trim(),
        role: $("#signupRole").value.trim(),
        email,
        fixed_home_days: [],
        status: "Ativo"
      });
    }
    toast("Conta criada. Confira o e-mail se a confirmacao estiver ativa.");
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

  $$("[data-activity-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      activeActivityTab = button.dataset.activityTab;
      renderActivityTab();
    });
  });

  $("#cancelClientEdit").addEventListener("click", () => resetClientForm(true));

  $("#clientsTable").addEventListener("click", async (event) => {
    const editId = event.target.dataset.editClient;
    const deleteId = event.target.dataset.deleteClient;
    if (editId) {
      editClient(editId);
      return;
    }
    if (deleteId) {
      const confirmed = window.confirm("Excluir este cliente? Atividades e documentos vinculados tambem podem ser afetados.");
      if (!confirmed) return;
      await deleteRecord("clients", deleteId);
      await loadRemoteState();
      renderAll();
      toast("Cliente excluido.");
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
    submitAuth(event).catch((error) => toast(error.message || "Nao foi possivel acessar."));
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
