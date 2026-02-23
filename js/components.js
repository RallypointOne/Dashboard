export function timeAgo(dateString) {
  const seconds = Math.floor((Date.now() - new Date(dateString)) / 1000);
  const intervals = [
    [31536000, 'year'],
    [2592000, 'month'],
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
  ];
  for (const [secs, label] of intervals) {
    const count = Math.floor(seconds / secs);
    if (count >= 1) return `${count} ${label}${count > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}

function isJuliaPkg(repo) {
  return repo.name.endsWith('.jl');
}

function statusClass(conclusion) {
  if (!conclusion) return 'unknown';
  return conclusion; // success, failure, cancelled, etc.
}

export function createRepoCard(repo, workflows, issueCounts, release, pending, coveragePct) {
  const card = document.createElement('div');
  card.className = 'repo-card';

  const ciRuns = workflows?.['CI'];
  const latestCI = getLatestRun(ciRuns);
  const overallStatus = latestCI?.conclusion ?? 'unknown';
  card.dataset.status = overallStatus;
  card.dataset.language = repo.language || '';

  const docsRuns = getDocsRuns(workflows);

  let statusHTML = '';

  if (ciRuns) {
    statusHTML += `<span class="status-item"><span>CI</span> ${timelineHTML(ciRuns)}</span>`;
  } else if (workflows) {
    statusHTML += `<span class="status-item">${statusDotHTML(null)} <span>CI</span></span>`;
  }

  if (isJuliaPkg(repo)) {
    if (docsRuns) {
      statusHTML += `<span class="status-item"><span>Docs</span> ${timelineHTML(docsRuns)}</span>`;
    }

    if (repo.has_pages) {
      const pagesBase = `https://rallypointone.github.io/${repo.name}/`;
      statusHTML += `<a href="${pagesBase}" class="docs-link">Docs Site</a>`;
    }
    statusHTML += coverageHTML(repo, coveragePct);
  }

  card.innerHTML = `
    <div class="card-header">
      <a href="${repo.html_url}" class="repo-name">${repo.name}</a>
    </div>
    ${repo.description ? `<p class="repo-desc">${escapeHTML(repo.description)}</p>` : ''}
    <div class="status-row">${statusHTML}</div>
    <div class="card-footer">
      ${releaseHTML(release, pending)}
      <span class="meta">pushed ${timeAgo(repo.pushed_at)}</span>
      ${issuesHTML(repo, issueCounts)}
    </div>
  `;

  return card;
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function getFilters() {
  return {
    released: document.getElementById('filter-released').value,
    sortBy: document.getElementById('sort-by').value,
  };
}

const STATUS_ORDER = { failure: 0, in_progress: 1, queued: 2, unknown: 3, cancelled: 4, success: 5 };

function filterAndSort(repos, workflowMap, releasesMap, filters) {
  let filtered = [...repos];

  if (filters.released) {
    filtered = filtered.filter(r => {
      const hasRelease = !!releasesMap.get(r.name);
      return filters.released === 'yes' ? hasRelease : !hasRelease;
    });
  }

  if (filters.sortBy === 'name') {
    filtered.sort((a, b) => a.name.localeCompare(b.name));
  } else if (filters.sortBy === 'pushed') {
    filtered.sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at));
  } else if (filters.sortBy === 'status') {
    filtered.sort((a, b) => {
      const sa = getLatestRun(workflowMap.get(a.name)?.['CI'])?.conclusion ?? 'unknown';
      const sb = getLatestRun(workflowMap.get(b.name)?.['CI'])?.conclusion ?? 'unknown';
      return (STATUS_ORDER[sa] ?? 3) - (STATUS_ORDER[sb] ?? 3);
    });
  }

  return filtered;
}

function getDocsRuns(workflows) {
  if (!workflows) return null;
  const entry = Object.entries(workflows).find(([name]) => /docs|documentation/i.test(name));
  return entry ? entry[1] : null;
}

function statusDotHTML(conclusion) {
  return `<span class="status-dot status-${statusClass(conclusion)}"></span>`;
}

function timelineHTML(runs) {
  if (!runs || runs.length === 0) return '';
  return `<span class="status-timeline">${runs.map((r, i) => {
    const isLatest = i === runs.length - 1;
    const latestCls = isLatest ? ' status-bar-latest' : '';
    const date = new Date(r.created_at).toLocaleDateString();

    if (r.jobs && r.jobs.total > 0) {
      const passPct = (r.jobs.passed / r.jobs.total) * 100;
      const failPct = (r.jobs.failed / r.jobs.total) * 100;
      const otherPct = 100 - passPct - failPct;
      const title = `${r.jobs.passed}/${r.jobs.total} passed — ${date}`;
      let segments = '';
      if (failPct > 0) segments += `<span class="bar-segment bar-fail" style="height:${failPct}%"></span>`;
      if (otherPct > 0) segments += `<span class="bar-segment bar-other" style="height:${otherPct}%"></span>`;
      if (passPct > 0) segments += `<span class="bar-segment bar-pass" style="height:${passPct}%"></span>`;
      return `<a href="${r.html_url}" class="status-bar status-bar-stacked${latestCls}" title="${title}">${segments}</a>`;
    }

    return `<a href="${r.html_url}" class="status-bar status-${statusClass(r.conclusion)}${latestCls}" title="${r.conclusion ?? 'running'} — ${date}"></a>`;
  }).join('')}</span>`;
}

function getLatestRun(runs) {
  if (!runs || runs.length === 0) return null;
  return runs[runs.length - 1];
}

function pendingHTML(pending) {
  if (!pending) return '';
  return `<a href="${pending.html_url}" class="pending-badge">${pending.version} pending</a>`;
}

function releaseHTML(release, pending) {
  const parts = [];
  if (release) parts.push(`<a href="${release.html_url}" class="release-badge">${release.tag_name}</a>`);
  if (pending) parts.push(pendingHTML(pending));
  return parts.join(' ') || '';
}

function releaseTableHTML(release, pending) {
  const parts = [];
  if (release) parts.push(`<a href="${release.html_url}" class="release-badge">${release.tag_name}</a>${release.published_at ? `<span class="meta"> ${timeAgo(release.published_at)}</span>` : ''}`);
  if (pending) parts.push(pendingHTML(pending));
  if (parts.length === 0) return '<span class="text-muted">-</span>';
  return parts.join(' ');
}

function coverageHTML(repo, coveragePct) {
  if (!isJuliaPkg(repo) || !repo.has_pages) return '';
  const pagesBase = `https://rallypointone.github.io/${repo.name}/`;
  const url = `${pagesBase}dev/coverage.html`;
  if (coveragePct != null) {
    return `<a href="${url}" class="coverage-link">${coveragePct}%</a>`;
  }
  return `<a href="${url}" class="coverage-link">Coverage</a>`;
}

function issuesHTML(repo, counts) {
  const url = repo.html_url + '/issues';
  const open = counts?.open ?? 0;
  const closed = counts?.closed ?? 0;
  if (open === 0 && closed === 0) return '';
  return `<span class="issues-group"><a href="${url}?q=is%3Aissue+is%3Aopen" class="issues-open">${open} open</a> / <a href="${url}?q=is%3Aissue+is%3Aclosed" class="issues-closed">${closed} closed</a></span>`;
}

function issuesTableHTML(repo, counts) {
  const url = repo.html_url + '/issues';
  const open = counts?.open ?? 0;
  const closed = counts?.closed ?? 0;
  return `<a href="${url}?q=is%3Aissue+is%3Aopen" class="issues-open">${open}</a> / <a href="${url}?q=is%3Aissue+is%3Aclosed" class="issues-closed">${closed}</a>`;
}

function renderCards(container, filtered, workflowMap, issueCountsMap, releasesMap, pendingReleasesMap, coverageMap) {
  container.className = 'view-cards';
  for (const repo of filtered) {
    container.appendChild(createRepoCard(repo, workflowMap.get(repo.name), issueCountsMap.get(repo.name), releasesMap.get(repo.name), pendingReleasesMap.get(repo.name), coverageMap.get(repo.name)));
  }
}

function renderTable(container, filtered, workflowMap, issueCountsMap, releasesMap, pendingReleasesMap, coverageMap) {
  container.className = 'view-table';
  const table = document.createElement('table');
  table.className = 'repo-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Repository</th>
        <th>CI</th>
        <th>Docs</th>
        <th>Release</th>
        <th>Issues</th>
        <th>Last Pushed</th>
      </tr>
    </thead>
  `;
  const tbody = document.createElement('tbody');
  for (const repo of filtered) {
    const workflows = workflowMap.get(repo.name);
    const ciRuns = workflows?.['CI'];
    const latestCI = getLatestRun(ciRuns);
    const docsRuns = getDocsRuns(workflows);
    const pagesBase = repo.has_pages ? `https://rallypointone.github.io/${repo.name}/` : null;
    const covPct = coverageMap.get(repo.name);

    const tr = document.createElement('tr');
    tr.dataset.status = latestCI?.conclusion ?? 'unknown';

    let repoLinks = '';
    if (isJuliaPkg(repo)) {
      const parts = [];
      if (pagesBase) parts.push(`<a href="${pagesBase}" class="docs-link">Docs</a>`);
      const cov = coverageHTML(repo, covPct);
      if (cov) parts.push(cov);
      if (parts.length > 0) repoLinks = `<span class="repo-links">${parts.join(' &middot; ')}</span>`;
    }

    tr.innerHTML = `
      <td>
        <a href="${repo.html_url}" class="repo-name">${repo.name}</a>
        ${repoLinks}
        ${repo.description ? `<span class="table-desc">${escapeHTML(repo.description)}</span>` : ''}
      </td>
      <td class="status-cell">${ciRuns
        ? timelineHTML(ciRuns)
        : `<span class="text-muted">-</span>`}</td>
      <td class="status-cell">${isJuliaPkg(repo)
        ? (docsRuns
          ? timelineHTML(docsRuns)
          : `<span class="text-muted">-</span>`)
        : ''}</td>
      <td>${releaseTableHTML(releasesMap.get(repo.name), pendingReleasesMap.get(repo.name))}</td>
      <td class="issues-cell">${issuesTableHTML(repo, issueCountsMap.get(repo.name))}</td>
      <td class="meta">${timeAgo(repo.pushed_at)}</td>
    `;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.appendChild(table);
}

function renderCompact(container, filtered, workflowMap, issueCountsMap, releasesMap, pendingReleasesMap, coverageMap) {
  container.className = 'view-compact';
  const list = document.createElement('div');
  list.className = 'compact-list';
  for (const repo of filtered) {
    const workflows = workflowMap.get(repo.name);
    const ciRuns = workflows?.['CI'];
    const latestCI = getLatestRun(ciRuns);
    const docsRuns = getDocsRuns(workflows);
    const pagesBase = repo.has_pages ? `https://rallypointone.github.io/${repo.name}/` : null;

    const row = document.createElement('div');
    row.className = 'compact-row';
    row.dataset.status = latestCI?.conclusion ?? 'unknown';
    row.innerHTML = `
      <span class="compact-status">${ciRuns ? timelineHTML(ciRuns) : statusDotHTML(null)}</span>
      <a href="${repo.html_url}" class="compact-name">${repo.name}</a>
      ${isJuliaPkg(repo) && docsRuns ? `<span class="compact-docs">${timelineHTML(docsRuns)} Docs</span>` : ''}
      ${isJuliaPkg(repo) && pagesBase ? `<a href="${pagesBase}" class="compact-link">Docs Site</a>` : ''}
      ${coverageHTML(repo, coverageMap.get(repo.name))}
      ${releaseHTML(releasesMap.get(repo.name), pendingReleasesMap.get(repo.name))}
      ${issuesHTML(repo, issueCountsMap.get(repo.name))}
      <span class="compact-pushed">${timeAgo(repo.pushed_at)}</span>
    `;
    list.appendChild(row);
  }
  container.appendChild(list);
}

export function getView() {
  return localStorage.getItem('gh_dashboard_view') || 'table';
}

export function setView(view) {
  localStorage.setItem('gh_dashboard_view', view);
}

function renderSection(container, label, repos, workflowMap, issueCountsMap, releasesMap, pendingReleasesMap, coverageMap, view) {
  if (repos.length === 0) return;

  const heading = document.createElement('h2');
  heading.className = 'section-heading';
  heading.textContent = label;
  container.appendChild(heading);

  const section = document.createElement('div');
  if (view === 'table') {
    renderTable(section, repos, workflowMap, issueCountsMap, releasesMap, pendingReleasesMap, coverageMap);
  } else if (view === 'compact') {
    renderCompact(section, repos, workflowMap, issueCountsMap, releasesMap, pendingReleasesMap, coverageMap);
  } else {
    renderCards(section, repos, workflowMap, issueCountsMap, releasesMap, pendingReleasesMap, coverageMap);
  }
  container.appendChild(section);
}

export function renderDashboard(container, repos, workflowMap, issueCountsMap, releasesMap, pendingReleasesMap, coverageMap, filters, view) {
  container.innerHTML = '';
  container.className = '';

  const filtered = filterAndSort(repos, workflowMap, releasesMap, filters);

  if (filtered.length === 0) {
    container.className = 'view-cards';
    container.innerHTML = '<div class="loading">No repositories match the current filters.</div>';
    return;
  }

  const juliaPackages = filtered.filter(r => isJuliaPkg(r));
  const other = filtered.filter(r => !isJuliaPkg(r));

  renderSection(container, 'Julia Packages', juliaPackages, workflowMap, issueCountsMap, releasesMap, pendingReleasesMap, coverageMap, view);
  renderSection(container, 'Other', other, workflowMap, issueCountsMap, releasesMap, pendingReleasesMap, coverageMap, view);
}

