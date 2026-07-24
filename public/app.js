/* HelpDesk SPA — vanilla, mluví s /api. i18n CS/EN. */
(function () {
  const app = document.getElementById("app");
  const state = {
    token: localStorage.getItem("hd_token") || "",
    lang: localStorage.getItem("hd_lang") || "cs",
    view: "login",
    meta: null, projects: [], health: null,
    tickets: [], current: null, createMode: "easy", filterProject: "",
  };

  const T = {
    cs: { app: "HelpDesk", login_p: "Zadejte přístupový token firmy", token_ph: "token firmy",
      connect: "Připojit", tickets: "Tickety", new_ticket: "Nový ticket", logout: "Odhlásit",
      back: "← Zpět", number: "Č.", title: "Název", status: "Stav", priority: "Priorita",
      created: "Vytvořeno", no_tickets: "Žádné tickety", no_msg: "Zatím žádné zprávy",
      project: "Projekt", all_projects: "Všechny projekty", description: "Popis problému",
      create: "Založit ticket", easy: "Easy", extended: "Extended",
      easy_hint: "Popiš problém vlastními slovy — zařazení a prioritu navrhne AI.",
      request_type: "Typ", importance: "Důležitost", urgency: "Naléhavost",
      product_line: "Produktová řada", functional_area: "Funkční oblast", estimate: "Odhad (h)",
      messages: "Komunikace", add_message: "Přidat zprávu", message_ph: "Napište zprávu…",
      send: "Odeslat", shared: "Sdílené", internal: "Interní", internal_note: "interní",
      change_status: "Změnit stav", apply: "Použít", none: "—", bad_token: "Neplatný token" },
    en: { app: "HelpDesk", login_p: "Enter your company access token", token_ph: "company token",
      connect: "Connect", tickets: "Tickets", new_ticket: "New ticket", logout: "Log out",
      back: "← Back", number: "No.", title: "Title", status: "Status", priority: "Priority",
      created: "Created", no_tickets: "No tickets", no_msg: "No messages yet",
      project: "Project", all_projects: "All projects", description: "Problem description",
      create: "Create ticket", easy: "Easy", extended: "Extended",
      easy_hint: "Describe the problem in your own words — AI suggests category and priority.",
      request_type: "Type", importance: "Importance", urgency: "Urgency",
      product_line: "Product line", functional_area: "Functional area", estimate: "Estimate (h)",
      messages: "Messages", add_message: "Add message", message_ph: "Write a message…",
      send: "Send", shared: "Shared", internal: "Internal", internal_note: "internal",
      change_status: "Change status", apply: "Apply", none: "—", bad_token: "Invalid token" },
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
      state.meta = await api("/meta");
      state.projects = (await api("/projects")).projects || [];
      state.view = "list"; await loadTickets();
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
  async function openTicket(id) {
    state.current = await api("/tickets/" + id); state.view = "detail"; render();
  }
  async function submitCreate() {
    const g = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
    const body = { project_id: g("c_project"), title: g("c_title"), description: g("c_desc") };
    if (!body.project_id || !body.title) return toast(t("project") + " + " + t("title"), true);
    if (state.createMode === "extended") {
      body.request_type = g("c_type") || undefined; body.product_line = g("c_pl") || undefined;
      body.functional_area = g("c_fa") || undefined; body.importance = g("c_imp") || undefined;
      body.urgency = g("c_urg") || undefined; body.priority = g("c_prio") || undefined;
      const est = g("c_est"); if (est) body.estimate_hours = parseFloat(est);
    }
    const r = await api("/tickets", { method: "POST", body: JSON.stringify(body) });
    toast("Ticket #" + r.number); await openTicket(r.id);
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

  // ---- views ----
  function header() {
    const ai = state.health && state.health.ai, on = ai && ai !== "off";
    return `<header class="top"><span class="brand">🎫 ${t("app")}</span>
      <span class="chip ${on ? "" : "off"}"><span class="dot">●</span> ${on ? "AI · " + esc(ai) : "AI off"}</span>
      <span class="spacer"></span>
      <button class="btn ghost sm" data-act="lang">${state.lang.toUpperCase()}</button>
      <button class="btn ghost sm" data-act="logout">${t("logout")}</button></header>`;
  }
  function viewLogin() {
    return `<div class="login"><div class="card">
      <h1>🎫 ${t("app")}</h1><p>${t("login_p")}</p>
      <div class="field"><input id="token" placeholder="${t("token_ph")}" value="${esc(state.token)}"/></div>
      <button class="btn primary" data-act="connect" style="width:100%">${t("connect")}</button>
      <div style="margin-top:14px"><button class="btn ghost sm" data-act="lang">${state.lang.toUpperCase()}</button></div>
    </div></div>`;
  }
  function viewList() {
    const opts = ['<option value="">' + t("all_projects") + "</option>"]
      .concat(state.projects.map((p) => `<option value="${esc(p.id)}" ${p.id === state.filterProject ? "selected" : ""}>${esc(p.name)}</option>`)).join("");
    const rows = state.tickets.length
      ? state.tickets.map((x) => `<tr data-act="open" data-id="${esc(x.id)}">
          <td class="num">#${x.number ?? ""}</td><td>${esc(x.title)}</td>
          <td><span class="pill s-${x.status}">${statusLabel(x.status)}</span></td>
          <td>${x.priority ? `<span class="pill p-${x.priority}">${prioLabel(x.priority)}</span>` : ""}</td>
          <td class="num">${fmtDate(x.created_at)}</td></tr>`).join("")
      : `<tr><td colspan="5"><div class="empty">${t("no_tickets")}</div></td></tr>`;
    return header() + `<main>
      <div class="toolbar"><h1>${t("tickets")}</h1><span class="spacer"></span>
        <select id="fp" data-change="filter">${opts}</select>
        <button class="btn primary" data-act="goto-create">+ ${t("new_ticket")}</button></div>
      <div class="tablewrap"><table><thead><tr>
        <th>${t("number")}</th><th>${t("title")}</th><th>${t("status")}</th><th>${t("priority")}</th><th>${t("created")}</th>
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
        ${ext ? "" : `<p style="margin-top:0;color:var(--muted)">${t("easy_hint")}</p>`}
        <div class="field"><label>${t("project")} *</label><select id="c_project">${projOpts}</select></div>
        <div class="field"><label>${t("title")} *</label><input id="c_title"/></div>
        <div class="field"><label>${t("description")} *</label><textarea id="c_desc"></textarea></div>
        ${ext ? `<div class="grid2">
          ${fld("c_type", t("request_type"), o(state.meta.request_types || []))}
          ${fld("c_prio", t("priority"), prioOpts)}
          ${fld("c_imp", t("importance"), o(["normal", "high", "critical"]))}
          ${fld("c_urg", t("urgency"), o(["normal", "high", "very_high"]))}
          <div class="field"><label>${t("product_line")}</label><input id="c_pl"/></div>
          <div class="field"><label>${t("functional_area")}</label><input id="c_fa"/></div>
          <div class="field"><label>${t("estimate")}</label><input id="c_est" type="number" step="0.5"/></div>
        </div>` : ""}
        <button class="btn primary" data-act="create">${t("create")}</button>
      </div></main>`;
  }
  function viewDetail() {
    const i = state.current.issue, msgs = state.current.messages || [];
    const allowed = (state.meta.transitions[i.status] || []);
    const sOpts = ['<option value="">' + t("change_status") + "…</option>"]
      .concat(allowed.map((s) => `<option value="${s}">${statusLabel(s)}</option>`)).join("");
    const rows = [["#", "#" + (i.number ?? "")], [t("status"), `<span class="pill s-${i.status}">${statusLabel(i.status)}</span>`],
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
        <h1><span class="mono" style="color:var(--muted)">#${i.number ?? ""}</span> ${esc(i.title)}</h1></div>
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
  function render() {
    app.innerHTML = state.view === "login" ? viewLogin()
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
      else if (act === "goto-create") { state.view = "create"; render(); }
      else if (act === "goto-list") { state.view = "list"; await loadTickets(); }
      else if (act === "open") { await openTicket(el.dataset.id); }
      else if (act === "mode") { state.createMode = el.dataset.mode; render(); }
      else if (act === "create") { await submitCreate(); }
      else if (act === "send") { await sendMessage(); }
      else if (act === "status") { await applyStatus(); }
    } catch (err) { toast((err.data && err.data.error) || ("Chyba " + (err.status || "")), true); }
  });
  app.addEventListener("change", async (e) => {
    const el = e.target.closest("[data-change]"); if (!el) return;
    if (el.dataset.change === "filter") { state.filterProject = el.value; await loadTickets(); }
  });

  boot();
})();
