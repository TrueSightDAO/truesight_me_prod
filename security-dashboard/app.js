const DATA_URL = "https://raw.githubusercontent.com/TrueSightDAO/treasury-cache/main/managed-ledgers/security-dashboard.json?_=" + Date.now();

function $(id) { return document.getElementById(id); }

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function statusBadge(ok) {
  const s = el("span", ok ? "sd-badge sd-badge-ok" : "sd-badge sd-badge-warn");
  s.textContent = ok ? "OK" : "WARN";
  return s;
}

function daysColor(d) {
  if (d === null || d === undefined) return "var(--muted)";
  if (d < 7) return "#c0392b";
  if (d < 30) return "var(--clay)";
  return "var(--forest)";
}

async function loadData() {
  try {
    const resp = await fetch(DATA_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (e) {
    console.warn("Failed to load security data:", e);
    return null;
  }
}

function renderScore(data) {
  const score = data?.score;
  if (!score) {
    $("scoreNumber").textContent = "--";
    $("scoreGrade").textContent = "?";
    $("deductions").innerHTML = "<p>No scan data yet. First scan runs daily at 06:00 UTC.</p>";
    return;
  }

  const n = score.score;
  const grade = score.grade;
  const color = n >= 75 ? "var(--forest)" : n >= 50 ? "var(--clay)" : "#c0392b";

  $("scoreNumber").textContent = n;
  $("scoreGrade").textContent = grade;
  document.documentElement.style.setProperty("--score-color", color);

  const arc = $("scoreArc");
  const circumference = 339.292;
  const offset = circumference - (n / 100) * circumference;
  setTimeout(() => { arc.style.strokeDashoffset = offset; }, 100);

  const ded = score.deductions || [];
  if (ded.length === 0) {
    $("deductions").innerHTML = '<p class="sd-clean">No issues detected.</p>';
  } else {
    const ul = el("ul", "sd-deduction-list");
    ded.forEach(d => { ul.appendChild(el("li", "", d)); });
    $("deductions").innerHTML = "";
    $("deductions").appendChild(el("p", "", "Deductions:"));
    $("deductions").appendChild(ul);
  }
}

function renderAWS(data) {
  const container = $("awsCards");
  const accounts = data?.aws;
  if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
    container.innerHTML = '<div class="sd-empty">AWS scan not available</div>';
    return;
  }
  container.innerHTML = "";
  accounts.forEach(acct => {
    const t = acct.totals || {};
    const card = el("div", "sd-card");
    card.innerHTML = `
      <h3>${acct.account}</h3>
      <p class="sd-acct-id">${acct.account_id || "unknown"}</p>
      <div class="sd-stat-row">
        <div class="sd-stat"><span class="sd-stat-num">${t.instances || 0}</span> Instances</div>
        <div class="sd-stat"><span class="sd-stat-num sd-stat-green">${t.instances_running || 0}</span> Running</div>
        <div class="sd-stat"><span class="sd-stat-num sd-stat-red">${t.instances_stopped || 0}</span> Stopped</div>
      </div>
      <div class="sd-stat-row">
        <div class="sd-stat"><span class="sd-stat-num">${t.key_pairs || 0}</span> Key Pairs</div>
        <div class="sd-stat"><span class="sd-stat-num">${t.security_groups || 0}</span> Security Groups</div>
        <div class="sd-stat"><span class="sd-stat-num">${(t.open_ports || []).length}</span> Open Ports</div>
      </div>
      ${(t.open_ports || []).length > 0 ? `<p class="sd-warn-text">Open to world: ${(t.open_ports || []).join(", ")}</p>` : ""}
      ${acct.error ? `<p class="sd-error-text">${acct.error}</p>` : ""}
    `;
    container.appendChild(card);
  });
}

function renderWeb(data) {
  const container = $("webTable");
  const sites = data?.web;
  if (!sites || !Array.isArray(sites) || sites.length === 0) {
    container.innerHTML = '<div class="sd-empty">Web scan not available</div>';
    return;
  }
  const table = el("table", "sd-table sd-table-web");
  table.innerHTML = `
    <thead><tr><th>Domain</th><th>TLS</th><th>Days Left</th><th>Security Headers</th></tr></thead>
    <tbody id="webBody"></tbody>
  `;
  const tbody = table.querySelector("#webBody");
  sites.forEach((site, idx) => {
    const tls = site.tls || {};
    const headers = site.headers || {};
    const days = tls.days_remaining;
    const tlsOk = tls.valid && days !== null && days > 0;
    const headerCount = (headers.present || []).length;
    const headerTotal = headerCount + (headers.missing || []).length;
    const presentList = (headers.present || []).join(", ");
    const missingList = (headers.missing || []).join(", ");

    const tr = el("tr", "sd-web-row");
    tr.innerHTML = `
      <td><a href="${site.url}" target="_blank">${site.name}</a></td>
      <td>${statusBadge(tlsOk).outerHTML}</td>
      <td style="color:${daysColor(days)}">${days !== null ? days + "d" : "?"}</td>
      <td>${headerCount}/${headerTotal} ${statusBadge(headerCount === headerTotal).outerHTML}</td>
    `;
    tr.addEventListener("click", function() {
      const detail = document.getElementById("web-detail-" + idx);
      if (detail) {
        const open = detail.style.display !== "none";
        detail.style.display = open ? "none" : "table-row";
        tr.classList.toggle("sd-web-row-expanded", !open);
      }
    });
    tbody.appendChild(tr);

    // Detail row
    const detailTr = el("tr", "sd-web-detail");
    detailTr.id = "web-detail-" + idx;
    detailTr.style.display = "none";
    let detailHtml = "<td colspan='4'><div class='sd-web-detail-inner'>";
    detailHtml += "<div class='sd-web-detail-section'><strong>TLS</strong>";
    if (tls.valid) {
      detailHtml += `<p>Valid: Yes</p>`;
      detailHtml += `<p>Issuer: ${tls.issuer || "?"}</p>`;
      detailHtml += `<p>Expires: ${tls.expiry || "?"}</p>`;
      detailHtml += `<p>Days remaining: <span style="color:${daysColor(days)}">${days !== null ? days + "d" : "?"}</span></p>`;
    } else {
      detailHtml += `<p>Valid: No</p>`;
      if (tls.error) detailHtml += `<p>Error: ${tls.error}</p>`;
    }
    detailHtml += "</div>";
    detailHtml += "<div class='sd-web-detail-section'><strong>Security Headers</strong>";
    if (presentList) detailHtml += `<p>Present: ${presentList}</p>`;
    if (missingList) detailHtml += `<p class='sd-warn-text'>Missing: ${missingList}</p>`;
    if (!presentList && !missingList) detailHtml += "<p>No header data</p>";
    detailHtml += "</div>";
    if (site.error) detailHtml += `<div class='sd-web-detail-section'><p class='sd-error-text'>Error: ${site.error}</p></div>`;
    detailHtml += "</div></td>";
    detailTr.innerHTML = detailHtml;
    tbody.appendChild(detailTr);
  });
  container.innerHTML = "";
  container.appendChild(table);
}

function renderGitHub(data) {
  const container = $("ghCards");
  const gh = data?.github;
  if (!gh || !gh.repos || !Array.isArray(gh.repos)) {
    container.innerHTML = '<div class="sd-empty">GitHub scan not available</div>';
    return;
  }
  const summary = gh.summary || {};
  container.innerHTML = `
    <div class="sd-card sd-card-wide">
      <h3>TrueSightDAO Organization</h3>
      <div class="sd-stat-row">
        <div class="sd-stat"><span class="sd-stat-num">${summary.total || 0}</span> Repos</div>
        <div class="sd-stat"><span class="sd-stat-num sd-stat-green">${summary.public || 0}</span> Public</div>
        <div class="sd-stat"><span class="sd-stat-num sd-stat-orange">${summary.private || 0}</span> Private</div>
        <div class="sd-stat"><span class="sd-stat-num">${summary.with_branch_protection || 0}</span> Protected</div>
      </div>
    </div>
    <div class="sd-table-wrap">
      <table class="sd-table sd-table-compact sd-table-github">
        <thead><tr><th>Repo</th><th>Visibility</th><th>Branch Protection</th><th>Secret Scanning</th></tr></thead>
        <tbody>
          ${gh.repos.map(r => {
            const bp = r.branch_protection ? r.branch_protection.required_pull_request_reviews : false;
            const ss = r.secret_scanning || "?";
            return `<tr>
              <td><span class="sd-repo-name">${r.name}</span>${r.archived ? ' <span class="sd-badge sd-badge-archived">archived</span>' : ''}</td>
              <td><span class="sd-vis-badge sd-vis-${r.visibility}">${r.visibility === "public" ? "pub" : r.visibility === "private" ? "priv" : r.visibility || "?"}</span></td>
              <td>${bp ? statusBadge(true).outerHTML : '<span class="sd-badge sd-badge-warn">none</span>'}</td>
              <td>${ss === "enabled" ? statusBadge(true).outerHTML : ss === "disabled" ? '<span class="sd-badge sd-badge-warn">off</span>' : '<span class="sd-badge sd-badge-warn">?</span>'}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderPhishing(data) {
  const container = $("phishingCards");
  const phish = data?.phishing_blacklist;
  if (!phish || !phish.summary) {
    container.innerHTML = '<div class="sd-empty">Blacklist scan not available</div>';
    return;
  }
  const s = phish.summary;

  let detailHtml = "";
  if (phish.domains && phish.domains.length > 0) {
    detailHtml += "<div class='sd-phish-section'><h4>Blacklisted Domains</h4><ul>";
    phish.domains.forEach(d => {
      detailHtml += `<li><strong>${d.value}</strong> <span class="sd-badge sd-badge-warn">${d.status}</span> <small style="color:var(--muted)">flagged by ${d.flagger || "unknown"}</small></li>`;
    });
    detailHtml += "</ul></div>";
  }
  if (phish.people && phish.people.length > 0) {
    detailHtml += "<div class='sd-phish-section'><h4>Blacklisted People</h4><ul>";
    phish.people.forEach(p => {
      detailHtml += `<li>${p}</li>`;
    });
    detailHtml += "</ul></div>";
  }
  if (phish.urls && phish.urls.length > 0) {
    detailHtml += "<div class='sd-phish-section'><h4>Blacklisted URLs</h4><ul>";
    phish.urls.forEach(u => {
      detailHtml += `<li><a href="${u}" target="_blank" class="text-link" style="word-break:break-all;font-size:0.8rem;">${u}</a></li>`;
    });
    detailHtml += "</ul></div>";
  }
  if (phish.verified_domains && phish.verified_domains.length > 0) {
    detailHtml += "<div class='sd-phish-section'><h4>Verified Domains</h4><ul>";
    phish.verified_domains.forEach(d => {
      detailHtml += `<li><span class="sd-badge sd-badge-ok">verified</span> ${d}</li>`;
    });
    detailHtml += "</ul></div>";
  }

  container.innerHTML = `
    <div class="sd-card"><h3>Blacklisted Domains</h3><div class="sd-big-num">${s.blacklisted_domains || 0}</div></div>
    <div class="sd-card"><h3>Verified Domains</h3><div class="sd-big-num">${s.verified_domains || 0}</div></div>
    <div class="sd-card"><h3>Blacklisted People</h3><div class="sd-big-num">${s.blacklisted_people || 0}</div></div>
    <div class="sd-card"><h3>Blacklisted URLs</h3><div class="sd-big-num">${s.blacklisted_urls || 0}</div></div>
    <div class="sd-card sd-card-wide">
      <h3>Total Entries Tracked</h3>
      <div class="sd-big-num">${s.total_entries || 0}</div>
      <p class="sd-small">Across all blacklist categories</p>
    </div>
    ${detailHtml ? `<div class="sd-card sd-card-wide sd-phish-details">${detailHtml}</div>` : ""}
  `;
}

async function init() {
  const data = await loadData();
  if (data?.generated_at) {
    const d = new Date(data.generated_at);
    $("lastScanned").innerHTML = `Last scanned: <strong>${d.toLocaleString()}</strong>`;
  } else {
    $("lastScanned").innerHTML = "Waiting for first scan...";
  }
  renderScore(data);
  renderAWS(data);
  renderWeb(data);
  renderGitHub(data);
  renderPhishing(data);
}

document.addEventListener("DOMContentLoaded", init);
