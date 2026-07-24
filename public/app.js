/* HelpDesk SPA — vanilla, mluví s /api. i18n CS/EN. */
(function () {
  const app = document.getElementById("app");
  { const th = localStorage.getItem("hd_theme"); if (th) document.documentElement.dataset.theme = th; }
  const state = {
    token: localStorage.getItem("hd_token") || "",
    lang: localStorage.getItem("hd_lang") || "cs",
    view: "login", env: "user",
    me: null, meta: null, projects: [], health: null, companies: [],
    tickets: [], current: null, createMode: "easy", filterProject: "",
  };

  const T = {
    cs: { app: "HelpDesk", login_p: "Zadejte přístupový token firmy", token_ph: "token firmy",
      connect: "Připojit", tickets: "Tickety", new_ticket: "Nový ticket", logout: "Odhlásit",
      back: "← Zpět", number: "Č.", title: "Název", status: "Stav", priority: "Priorita",
      created: "Vytvořeno", no_tickets: "Žádné tickety", no_msg: "Zatím žádné zprávy",
      project: "Projekt", all_projects: "Všechny projekty", description: "Popis problému",
      create: "Založit ticket", easy: "Easy", extended: "Extended",
      easy_hint: "Popiš problém vlastními slovy — název, zařazení i prioritu dopočítá AI.",
      easy_ph: "Popište, co se děje, kde a za jakých okolností…",
      request_type: "Typ", importance: "Důležitost", urgency: "Naléhavost",
      product_line: "Produktová řada", functional_area: "Funkční oblast", estimate: "Odhad (h)",
      messages: "Komunikace", add_message: "Přidat zprávu", message_ph: "Napište zprávu…",
      send: "Odeslat", shared: "Sdílené", internal: "Interní", internal_note: "interní",
      change_status: "Změnit stav", apply: "Použít", none: "—", bad_token: "Neplatný token",
      admin: "Admin", firms: "Firmy", env_user: "Tickety", new_firm: "Nová firma", firm_name: "Název firmy",
      expiry: "Expirace", no_expiry: "bez expirace", token_col: "Token", projects_col: "Projekty",
      actions: "Akce", regen: "Nový token", revoke: "Revokovat", expired: "vypršel", copy: "Kopírovat",
      copied: "Zkopírováno", m1: "1 měsíc", m6: "6 měsíců", m12: "12 měsíců", preset: "rychle",
      projects_nav: "Projekty", new_project: "Nový projekt", project_key: "Klíč", max_depth: "Max. hloubka",
      visibility_col: "Viditelnost", save: "Uložit", revoke_self: "Nelze revokovat vlastní přístup",
      admin_email: "E-mail admina", permanent: "trvalý 🔒", theme: "Motiv (světlý/tmavý)",
      tt_key: "Prefix v číslech ticketů (např. IT → IT-270)",
      tt_depth: "Kolik úrovní podúkolů lze zanořit pod úkol (epic → úkol → podúkol → …). Např. 5 = až 5 úrovní.",
      tt_vis: "Výchozí viditelnost ticketů projektu: sdílené (vidí i zákazník) / interní (jen tvoje strana)",
      tt_num: "Číslo ticketu ve formátu KLÍČ-N (číslováno zvlášť pro každý projekt)",
      tt_status: "Stav ticketu v životním cyklu (Nový → Otevřený → V řešení → …)",
      tt_prio: "Priorita: blokační / kritická / vysoká / nízká (ovlivňuje SLA)",
      tt_created: "Datum a čas vytvoření ticketu",
      tt_token: "Přístupový token firmy — kdo ho má, přihlásí se do jejího prostředí",
      tt_email: "E-mail admina — kotva pro obnovu přístupu",
      tt_exp: "Do kdy token platí (admin token je vždy trvalý)" },
    en: { app: "HelpDesk", login_p: "Enter your company access token", token_ph: "company token",
      connect: "Connect", tickets: "Tickets", new_ticket: "New ticket", logout: "Log out",
      back: "← Back", number: "No.", title: "Title", status: "Status", priority: "Priority",
      created: "Created", no_tickets: "No tickets", no_msg: "No messages yet",
      project: "Project", all_projects: "All projects", description: "Problem description",
      create: "Create ticket", easy: "Easy", extended: "Extended",
      easy_hint: "Describe the problem in your own words — AI fills in the title, category and priority.",
      easy_ph: "Describe what happens, where and under what conditions…",
      request_type: "Type", importance: "Importance", urgency: "Urgency",
      product_line: "Product line", functional_area: "Functional area", estimate: "Estimate (h)",
      messages: "Messages", add_message: "Add message", message_ph: "Write a message…",
      send: "Send", shared: "Shared", internal: "Internal", internal_note: "internal",
      change_status: "Change status", apply: "Apply", none: "—", bad_token: "Invalid token",
      admin: "Admin", firms: "Companies", env_user: "Tickets", new_firm: "New company", firm_name: "Company name",
      expiry: "Expiry", no_expiry: "no expiry", token_col: "Token", projects_col: "Projects",
      actions: "Actions", regen: "New token", revoke: "Revoke", expired: "expired", copy: "Copy",
      copied: "Copied", m1: "1 month", m6: "6 months", m12: "12 months", preset: "quick",
      projects_nav: "Projects", new_project: "New project", project_key: "Key", max_depth: "Max depth",
      visibility_col: "Visibility", save: "Save", revoke_self: "Cannot revoke your own access",
      admin_email: "Admin email", permanent: "permanent 🔒", theme: "Theme (light/dark)",
      tt_key: "Prefix in ticket numbers (e.g. IT → IT-270)",
      tt_depth: "How many subtask levels can nest under a task (epic → task → subtask → …). E.g. 5 = up to 5 levels.",
      tt_vis: "Default ticket visibility: shared (customer sees it) / internal (your side only)",
      tt_num: "Ticket number as KEY-N (numbered per project)",
      tt_status: "Ticket status in the lifecycle (New → Open → In progress → …)",
      tt_prio: "Priority: blocking / critical / high / low (drives SLA)",
      tt_created: "Ticket creation date and time",
      tt_token: "Company access token — whoever has it logs into that company",
      tt_email: "Admin email — recovery anchor",
      tt_exp: "Token validity (admin token is always permanent)" },
  };
  const t = (k) => (T[state.lang][k] ?? T.cs[k] ?? k);

  const STATUS_L = {
    cs: { new: "Nový", open: "Otevřený", customer_collab: "Součinnost", offer_sent: "Nabídka odeslána",
      in_progress: "V řešení", waiting_deploy: "Čeká na nasazení", third_party: "3. strana",
      on_hold: "Pozastaveno", accepted: "Akceptováno", closed_invoiced: "Uzavřeno (fakturace)",
      closed_not_invoiced: "Uzavřeno (bez fakturace)" },
    en: { new: "New", open: "Open", customer_collab: "Collaboration", offer_sent: "Offer sent",
      in_progress: "In progress", waiting_deploy: "Waiting for deploy", third_party: "Third party",
      on_hold: "On hold", accepted: "Accepted", closed_invoiced: "Closed (invoiced)",
      closed_not_invoiced: "Closed (no invoice)" },
  };
  const PRIO_L = { cs: { blocking: "Blokační", critical: "Kritická", high: "Vysoká", low: "Nízká" },
    en: { blocking: "Blocking", critical: "Critical", high: "High", low: "Low" } };
  const statusLabel = (s) => STATUS_L[state.lang][s] || s;
  const prioLabel = (p) => (p ? PRIO_L[state.lang][p] || p : "");
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtDate = (ts) => (ts ? new Date(ts * 1000).toLocaleString(state.lang === "cs" ? "cs-CZ" : "en-GB") : "");

  async function api(path, opts = {}) {
    const headers = Object.assign({ "content-type": "application/json" }, opts.headers || {});
    if (state.token) headers["x-helpdesk-token"] = state.token;
    const res = await fetch("/api" + path, Object.assign({}, opts, { headers }));
    const txt = await res.text();
    let data = null; try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
    if (!res.ok) throw { status: res.status, data };
    return data;
  }
  function toast(msg, err) {
    const c = document.getElementById("toast");
    const el = document.createElement("div");
    el.className = "toast" + (err ? " err" : ""); el.textContent = msg;
    c.appendChild(el); setTimeout(() => el.remove(), 3200);
  }

  // ---- data ----
  async function boot() {
    try { state.health = await fetch("/api/health").then((r) => r.json()); } catch {}
    if (!state.token) { state.view = "login"; return render(); }
    try {
      state.me = await api("/me");
      state.env = state.me.env || "user";
      state.meta = await api("/meta");
      state.projects = (await api("/projects")).projects || [];
      if (state.env === "admin") { await loadCompanies(); state.view = "admin"; render(); }
      else { state.view = "list"; await loadTickets(); }
    } catch (e) {
      if (e.status === 401) { localStorage.removeItem("hd_token"); state.token = ""; state.view = "login"; toast(t("bad_token"), true); }
      render();
    }
  }
  async function loadTickets() {
    const q = state.filterProject ? "?project=" + encodeURIComponent(state.filterProject) : "";
    state.tickets = (await api("/tickets" + q)).tickets || [];
    render();
  }
  async function loadCompanies() {
    state.companies = (await api("/admin/companies")).companies || [];
  }
  async function openTicket(id) {
    state.current = await api("/tickets/" + id); state.view = "detail"; render();
  }
  async function submitCreate() {
    const g = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
    const desc = g("c_desc");
    if (!desc) return toast(t("description"), true);
    let body;
    if (state.createMode === "extended") {
      body = { project_id: g("c_project"), title: g("c_title"), description: desc };
      if (!body.project_id || !body.title) return toast(t("project") + " + " + t("title"), true);
      body.request_type = g("c_type") || undefined; body.product_line = g("c_pl") || undefined;
      body.functional_area = g("c_fa") || undefined; body.importance = g("c_imp") || undefined;
      body.urgency = g("c_urg") || undefined; body.priority = g("c_prio") || undefined;
      const est = g("c_est"); if (est) body.estimate_hours = parseFloat(est);
    } else {
      // Easy: jen popis. Název / zařazení / prioritu dopočítá AI; zatím default projekt + odvozený název.
      const proj = state.projects[0];
      if (!proj) return toast(t("project"), true);
      const title = (desc.split("\n")[0] || desc).slice(0, 60);
      body = { project_id: proj.id, title, description: desc, easy: true };
    }
    const r = await api("/tickets", { method: "POST", body: JSON.stringify(body) });
    toast(r.key || ("Ticket #" + r.number)); await openTicket(r.id);
  }
  async function sendMessage() {
    const body = document.getElementById("m_body").value.trim(); if (!body) return;
    const vis = document.getElementById("m_vis").value;
    await api("/tickets/" + state.current.issue.id + "/messages", { method: "POST", body: JSON.stringify({ body_html: esc(body), visibility: vis }) });
    await openTicket(state.current.issue.id);
  }
  async function applyStatus() {
    const to = document.getElementById("s_to").value; if (!to) return;
    await api("/tickets/" + state.current.issue.id + "/status", { method: "POST", body: JSON.stringify({ to }) });
    toast(statusLabel(to)); await openTicket(state.current.issue.id);
  }
  async function showToken(tok) {
    if (!tok) return;
    try { await navigator.clipboard.writeText(tok); toast(t("copied") + ": " + tok); }
    catch { toast(tok); }
  }
  async function adminCreate() {
    const name = document.getElementById("nc_name").value.trim();
    if (!name) return toast(t("firm_name"), true);
    const exp = document.getElementById("nc_expd").value;
    const email = document.getElementById("nc_email").value.trim();
    const r = await api("/admin/companies", { method: "POST", body: JSON.stringify({ name, expires_at: exp || null, recovery_email: email || null }) });
    await showToken(r.token); await loadCompanies(); render();
  }
  async function adminRegen(id) {
    const expEl = document.getElementById("expd_" + id);
    const r = await api("/admin/companies/" + id + "/token", { method: "POST", body: JSON.stringify({ regenerate: true, expires_at: expEl ? expEl.value || null : null }) });
    // Regenerace VLASTNÍHO tokenu: bezešvě přepni session, ať nepřijdeš o přístup.
    if (r.token && state.me && id === state.me.id) { state.token = r.token; localStorage.setItem("hd_token", r.token); }
    await showToken(r.token); await loadCompanies(); render();
  }
  async function adminExpiry(id) {
    const expEl = document.getElementById("expd_" + id);
    const emEl = document.getElementById("em_" + id);
    const body = {};
    if (emEl) body.recovery_email = emEl.value.trim();
    if (expEl) body.expires_at = expEl.value || null;
    await api("/admin/companies/" + id + "/token", { method: "POST", body: JSON.stringify(body) });
    toast(t("save")); await loadCompanies(); render();
  }
  async function adminRevoke(id) {
    if (state.me && id === state.me.id) return toast(t("revoke_self"), true);
    await api("/admin/companies/" + id + "/revoke", { method: "POST" });
    toast(t("revoke")); await loadCompanies(); render();
  }
  async function projCreate() {
    const name = document.getElementById("np_name").value.trim(); if (!name) return toast(t("title"), true);
    const key = document.getElementById("np_key").value.trim();
    const depth = parseInt(document.getElementById("np_depth").value) || 5;
    const vis = document.getElementById("np_vis").value;
    await api("/projects", { method: "POST", body: JSON.stringify({ name, key, max_depth: depth, default_visibility: vis }) });
    state.projects = (await api("/projects")).projects || []; render();
  }
  async function projSave(id) {
    const name = document.getElementById("pn_" + id).value.trim();
    const key = document.getElementById("pk_" + id).value.trim();
    const depth = parseInt(document.getElementById("pd_" + id).value) || 5;
    const vis = document.getElementById("pv_" + id).value;
    await api("/projects/" + id, { method: "POST", body: JSON.stringify({ name, key, max_depth: depth, default_visibility: vis }) });
    toast(t("save")); state.projects = (await api("/projects")).projects || []; render();
  }

  // ---- views ----
  function header() {
    const ai = state.health && state.health.ai, on = ai && ai !== "off";
    const ticketsOn = ["list", "detail", "create"].includes(state.view);
    const nav = `${state.env === "admin" ? `<button class="btn ghost sm ${state.view === "admin" ? "on" : ""}" data-act="go-admin">${t("firms")}</button>` : ""}
      <button class="btn ghost sm ${ticketsOn ? "on" : ""}" data-act="go-tickets">${t("env_user")}</button>
      <button class="btn ghost sm ${state.view === "projects" ? "on" : ""}" data-act="go-projects">${t("projects_nav")}</button>`;
    return `<header class="top"><span class="brand">🎫 ${t("app")}</span>
      ${state.env === "admin" ? `<span class="chip"><span class="dot">●</span> ${t("admin")}</span>` : ""}
      <span class="spacer"></span>
      ${nav}
      <span class="chip ${on ? "" : "off"}"><span class="dot">●</span> ${on ? "AI · " + esc(ai) : "AI off"}</span>
      <span class="chip" title="commit ${esc((state.health && state.health.commit) || "dev")} · build ${esc((state.health && state.health.built) || "")}">${esc((state.health && state.health.commit) || "dev")}${state.health && state.health.built ? " · " + new Date(state.health.built).toLocaleString(state.lang === "cs" ? "cs-CZ" : "en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}</span>
      <button class="btn ghost sm" data-act="theme" title="${t("theme")}">${document.documentElement.dataset.theme === "dark" ? "☀" : "☾"}</button>
      <button class="btn ghost sm" data-act="lang">${state.lang.toUpperCase()}</button>
      <button class="btn ghost sm" data-act="logout">${t("logout")}</button></header>`;
  }
  function viewAdmin() {
    const presetSel = (target) => `<select data-change="preset" data-target="${target}" title="${t("preset")}" style="max-width:118px">
      <option value="">${t("preset")}</option>
      <option value="30">${t("m1")}</option>
      <option value="180">${t("m6")}</option>
      <option value="365">${t("m12")}</option></select>`;
    const dateInput = (id, ts) => `<input type="date" id="${id}" value="${ts ? new Date(ts * 1000).toISOString().slice(0, 10) : ""}" title="${t("expiry")}" style="max-width:150px"/>`;
    const rows = state.companies.map((c) => {
      const expCell = c.is_provider
        ? `<span class="tag-int" style="color:var(--accent);border-color:var(--accent)">${t("permanent")}</span>`
        : `${dateInput("expd_" + c.id, c.token_expires)}${presetSel("expd_" + c.id)}`;
      return `<tr>
        <td>${esc(c.name)} ${c.is_provider ? `<span class="tag-int" style="color:var(--accent);border-color:var(--accent)">admin</span>` : ""}</td>
        <td class="mono" data-act="copy" data-tok="${esc(c.token || "")}" title="${t("copy")}" style="cursor:pointer">${esc((c.token || "").slice(0, 10))}…</td>
        <td><input id="em_${c.id}" type="email" value="${esc(c.recovery_email || "")}" placeholder="${t("admin_email")}" data-change="cmail" data-id="${esc(c.id)}" style="max-width:180px"/></td>
        <td><div class="rowacts">${expCell}</div></td>
        <td class="num">${c.projects}</td>
        <td><div class="rowacts">
          <button class="btn sm" data-act="setexp" data-id="${esc(c.id)}">${t("apply")}</button>
          <button class="btn sm" data-act="regen" data-id="${esc(c.id)}">${t("regen")}</button>
          ${c.is_provider ? "" : `<button class="btn sm" data-act="revoke" data-id="${esc(c.id)}">${t("revoke")}</button>`}
        </div></td></tr>`;
    }).join("");
    return header() + `<main>
      <div class="toolbar"><h1>${t("firms")}</h1></div>
      <div class="card" style="margin-bottom:16px"><div class="toolbar">
        <input id="nc_name" placeholder="${t("firm_name")}" style="max-width:200px"/>
        <input id="nc_email" type="email" placeholder="${t("admin_email")}" style="max-width:180px"/>
        ${dateInput("nc_expd", null)}${presetSel("nc_expd")}
        <button class="btn primary" data-act="admincreate">+ ${t("new_firm")}</button>
      </div></div>
      <div class="tablewrap"><table><thead><tr>
        <th>${t("firm_name")}</th><th title="${t("tt_token")}">${t("token_col")}</th><th title="${t("tt_email")}">${t("admin_email")}</th><th title="${t("tt_exp")}">${t("expiry")}</th><th>${t("projects_col")}</th><th>${t("actions")}</th>
      </tr></thead><tbody>${rows}</tbody></table></div></main>`;
  }
  function viewLogin() {
    return `<div class="login"><div class="card">
      <h1>🎫 ${t("app")}</h1><p>${t("login_p")}</p>
      <div class="field"><input id="token" placeholder="${t("token_ph")}" value="${esc(state.token)}"/></div>
      <button class="btn primary" data-act="connect" style="width:100%">${t("connect")}</button>
      <div style="margin-top:14px"><button class="btn ghost sm" data-act="lang">${state.lang.toUpperCase()}</button>
      <button class="btn ghost sm" data-act="theme" title="${t("theme")}">${document.documentElement.dataset.theme === "dark" ? "☀" : "☾"}</button></div>
    </div></div>`;
  }
  function viewList() {
    const opts = ['<option value="">' + t("all_projects") + "</option>"]
      .concat(state.projects.map((p) => `<option value="${esc(p.id)}" ${p.id === state.filterProject ? "selected" : ""}>${esc(p.name)}</option>`)).join("");
    const rows = state.tickets.length
      ? state.tickets.map((x) => `<tr data-act="open" data-id="${esc(x.id)}">
          <td class="num">${esc(x.ticket_key || "#" + (x.number ?? ""))}</td><td>${esc(x.title)}</td>
          <td><span class="pill s-${x.status}">${statusLabel(x.status)}</span></td>
          <td>${x.priority ? `<span class="pill p-${x.priority}">${prioLabel(x.priority)}</span>` : ""}</td>
          <td class="num">${fmtDate(x.created_at)}</td></tr>`).join("")
      : `<tr><td colspan="5"><div class="empty">${t("no_tickets")}</div></td></tr>`;
    return header() + `<main>
      <div class="toolbar"><h1>${t("tickets")}</h1><span class="spacer"></span>
        <select id="fp" data-change="filter">${opts}</select>
        <button class="btn primary" data-act="goto-create">+ ${t("new_ticket")}</button></div>
      <div class="tablewrap"><table><thead><tr>
        <th title="${t("tt_num")}">${t("number")}</th><th>${t("title")}</th><th title="${t("tt_status")}">${t("status")}</th><th title="${t("tt_prio")}">${t("priority")}</th><th title="${t("tt_created")}">${t("created")}</th>
      </tr></thead><tbody>${rows}</tbody></table></div></main>`;
  }
  function viewCreate() {
    const ext = state.createMode === "extended";
    const projOpts = state.projects.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
    const o = (arr) => ['<option value=""></option>'].concat(arr.map((v) => `<option value="${v}">${v}</option>`)).join("");
    const prioOpts = ['<option value=""></option>'].concat((state.meta.priorities || []).map((v) => `<option value="${v}">${prioLabel(v)}</option>`)).join("");
    const fld = (id, lbl, opts) => `<div class="field"><label>${lbl}</label><select id="${id}">${opts}</select></div>`;
    return header() + `<main>
      <div class="toolbar"><button class="btn ghost" data-act="goto-list">${t("back")}</button><h1>${t("new_ticket")}</h1>
        <span class="spacer"></span>
        <span class="seg"><button data-act="mode" data-mode="easy" class="${ext ? "" : "on"}">${t("easy")}</button><button data-act="mode" data-mode="extended" class="${ext ? "on" : ""}">${t("extended")}</button></span></div>
      <div class="card">
        ${ext ? `
        <div class="field"><label>${t("project")} *</label><select id="c_project">${projOpts}</select></div>
        <div class="field"><label>${t("title")} *</label><input id="c_title"/></div>
        <div class="field"><label>${t("description")} *</label><textarea id="c_desc"></textarea></div>
        <div class="grid2">
          ${fld("c_type", t("request_type"), o(state.meta.request_types || []))}
          ${fld("c_prio", t("priority"), prioOpts)}
          ${fld("c_imp", t("importance"), o(["normal", "high", "critical"]))}
          ${fld("c_urg", t("urgency"), o(["normal", "high", "very_high"]))}
          <div class="field"><label>${t("product_line")}</label><input id="c_pl"/></div>
          <div class="field"><label>${t("functional_area")}</label><input id="c_fa"/></div>
          <div class="field"><label>${t("estimate")}</label><input id="c_est" type="number" step="0.5"/></div>
        </div>` : `
        <p style="margin-top:0;color:var(--muted)">${t("easy_hint")}</p>
        <div class="field"><label>${t("description")} *</label><textarea id="c_desc" style="min-height:170px" placeholder="${t("easy_ph")}"></textarea></div>`}
        <button class="btn primary" data-act="create">${t("create")}</button>
      </div></main>`;
  }
  function viewDetail() {
    const i = state.current.issue, msgs = state.current.messages || [];
    const allowed = (state.meta.transitions[i.status] || []);
    const sOpts = ['<option value="">' + t("change_status") + "…</option>"]
      .concat(allowed.map((s) => `<option value="${s}">${statusLabel(s)}</option>`)).join("");
    const rows = [["#", esc(i.ticket_key || "#" + (i.number ?? ""))], [t("status"), `<span class="pill s-${i.status}">${statusLabel(i.status)}</span>`],
      [t("priority"), i.priority ? `<span class="pill p-${i.priority}">${prioLabel(i.priority)}</span>` : t("none")],
      [t("request_type"), esc(i.request_type || t("none"))], [t("product_line"), esc(i.product_line || t("none"))],
      [t("functional_area"), esc(i.functional_area || t("none"))], [t("created"), fmtDate(i.created_at)]];
    const metaHtml = rows.map(([k, v]) => `<div><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");
    const thread = msgs.length
      ? msgs.map((m) => `<div class="msg ${m.visibility === "internal" ? "internal" : ""}">
          <div class="head">${fmtDate(m.created_at)} ${m.visibility === "internal" ? `<span class="tag-int">${t("internal_note")}</span>` : ""}</div>
          <div class="body">${m.body_html || ""}</div></div>`).join("")
      : `<div class="empty">${t("no_msg")}</div>`;
    return header() + `<main>
      <div class="toolbar"><button class="btn ghost" data-act="goto-list">${t("back")}</button>
        <h1><span class="mono" style="color:var(--muted)">${esc(i.ticket_key || "#" + (i.number ?? ""))}</span> ${esc(i.title)}</h1></div>
      <div class="card"><div class="meta-grid">${metaHtml}</div>
        ${i.description ? `<div style="margin-top:8px"><div class="k">${t("description")}</div><div>${esc(i.description)}</div></div>` : ""}
        ${allowed.length ? `<div class="toolbar" style="margin-top:16px"><select id="s_to" style="max-width:240px">${sOpts}</select><button class="btn" data-act="status">${t("apply")}</button></div>` : ""}
      </div>
      <h2>${t("messages")}</h2><div class="thread">${thread}</div>
      <div class="card" style="margin-top:14px">
        <div class="field"><label>${t("add_message")}</label><textarea id="m_body" placeholder="${t("message_ph")}"></textarea></div>
        <div class="toolbar"><select id="m_vis" style="max-width:200px"><option value="shared">${t("shared")}</option><option value="internal">${t("internal")}</option></select><button class="btn primary" data-act="send">${t("send")}</button></div>
      </div></main>`;
  }
  function viewProjects() {
    const visSel = (id, cur) => `<select id="${id}"><option value="shared" ${cur === "shared" ? "selected" : ""}>${t("shared")}</option><option value="internal" ${cur === "internal" ? "selected" : ""}>${t("internal")}</option></select>`;
    const rows = state.projects.map((p) => `<tr>
      <td><input id="pk_${p.id}" value="${esc(p.key || "")}" class="mono" style="max-width:90px"/></td>
      <td><input id="pn_${p.id}" value="${esc(p.name)}" style="max-width:220px"/></td>
      <td><input id="pd_${p.id}" type="number" min="1" max="20" value="${p.max_depth}" style="max-width:70px"/></td>
      <td>${visSel("pv_" + p.id, p.default_visibility)}</td>
      <td><button class="btn sm" data-act="projsave" data-id="${esc(p.id)}">${t("save")}</button></td></tr>`).join("");
    return header() + `<main>
      <div class="toolbar"><h1>${t("projects_nav")}</h1></div>
      <div class="card" style="margin-bottom:16px"><div class="toolbar">
        <input id="np_name" placeholder="${t("title")}" style="max-width:220px"/>
        <input id="np_key" placeholder="${t("project_key")}" class="mono" style="max-width:110px"/>
        <input id="np_depth" type="number" min="1" max="20" value="5" title="${t("max_depth")}" style="max-width:80px"/>
        ${visSel("np_vis", "shared")}
        <button class="btn primary" data-act="projcreate">+ ${t("new_project")}</button>
      </div></div>
      <div class="tablewrap"><table><thead><tr>
        <th title="${t("tt_key")}">${t("project_key")}</th><th>${t("title")}</th><th title="${t("tt_depth")}">${t("max_depth")}</th><th title="${t("tt_vis")}">${t("visibility_col")}</th><th>${t("actions")}</th>
      </tr></thead><tbody>${rows}</tbody></table></div></main>`;
  }
  function render() {
    app.innerHTML = state.view === "login" ? viewLogin()
      : state.view === "admin" ? viewAdmin()
      : state.view === "projects" ? viewProjects()
      : state.view === "create" ? viewCreate()
      : state.view === "detail" ? viewDetail() : viewList();
  }

  // ---- events ----
  app.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-act]"); if (!el) return;
    const act = el.dataset.act;
    try {
      if (act === "connect") { const v = document.getElementById("token").value.trim(); if (!v) return; state.token = v; localStorage.setItem("hd_token", v); await boot(); }
      else if (act === "logout") { localStorage.removeItem("hd_token"); state.token = ""; state.current = null; state.view = "login"; render(); }
      else if (act === "lang") { state.lang = state.lang === "cs" ? "en" : "cs"; localStorage.setItem("hd_lang", state.lang); render(); }
      else if (act === "theme") { const n = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = n; localStorage.setItem("hd_theme", n); render(); }
      else if (act === "goto-create") { state.view = "create"; render(); }
      else if (act === "goto-list") { state.view = "list"; await loadTickets(); }
      else if (act === "open") { await openTicket(el.dataset.id); }
      else if (act === "mode") { state.createMode = el.dataset.mode; render(); }
      else if (act === "create") { await submitCreate(); }
      else if (act === "send") { await sendMessage(); }
      else if (act === "status") { await applyStatus(); }
      else if (act === "go-admin") { state.view = "admin"; await loadCompanies(); render(); }
      else if (act === "go-tickets") { state.view = "list"; await loadTickets(); }
      else if (act === "admincreate") { await adminCreate(); }
      else if (act === "regen") { await adminRegen(el.dataset.id); }
      else if (act === "setexp") { await adminExpiry(el.dataset.id); }
      else if (act === "revoke") { await adminRevoke(el.dataset.id); }
      else if (act === "copy") { try { await navigator.clipboard.writeText(el.dataset.tok); toast(t("copied")); } catch {} }
      else if (act === "go-projects") { state.projects = (await api("/projects")).projects || []; state.view = "projects"; render(); }
      else if (act === "projcreate") { await projCreate(); }
      else if (act === "projsave") { await projSave(el.dataset.id); }
    } catch (err) { toast((err.data && err.data.error) || ("Chyba " + (err.status || "")), true); }
  });
  app.addEventListener("change", async (e) => {
    const el = e.target.closest("[data-change]"); if (!el) return;
    if (el.dataset.change === "filter") { state.filterProject = el.value; await loadTickets(); }
    else if (el.dataset.change === "preset") {
      const target = document.getElementById(el.dataset.target);
      if (target) target.value = el.value ? new Date(Date.now() + parseInt(el.value) * 86400000).toISOString().slice(0, 10) : "";
      el.value = "";
    }
    else if (el.dataset.change === "cmail") {
      try { await api("/admin/companies/" + el.dataset.id + "/email", { method: "POST", body: JSON.stringify({ email: el.value.trim() }) }); toast(t("save")); }
      catch (err) { toast((err.data && err.data.error) || "Chyba", true); }
    }
  });

  boot();
})();
