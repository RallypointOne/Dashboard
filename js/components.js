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

function statusClass(conclusion) {
  if (!conclusion) return 'unknown';
  return conclusion; // success, failure, cancelled, etc.
}

export function createRepoCard(repo, workflows, issueCounts, release) {
  const card = document.createElement('div');
  card.className = 'repo-card';

  const ciRun = workflows?.['CI'];
  const overallStatus = ciRun?.conclusion ?? 'unknown';
  card.dataset.status = overallStatus;
  card.dataset.language = repo.language || '';
  card.dataset.visibility = repo.private ? 'private' : 'public';

  const docsEntry = workflows
    ? Object.entries(workflows).find(([name]) => /docs|documentation/i.test(name))
    : null;
  const docsRun = docsEntry ? docsEntry[1] : null;

  let statusHTML = '';

  if (ciRun) {
    statusHTML += `
      <a href="${ciRun.html_url}" class="status-item">
        <span class="status-dot status-${statusClass(ciRun.conclusion)}"></span>
        <span>CI</span>
      </a>`;
  } else if (workflows) {
    statusHTML += `
      <span class="status-item">
        <span class="status-dot status-unknown"></span>
        <span>CI</span>
      </span>`;
  }

  if (docsRun) {
    statusHTML += `
      <a href="${docsRun.html_url}" class="status-item">
        <span class="status-dot status-${statusClass(docsRun.conclusion)}"></span>
        <span>Docs</span>
      </a>`;
  }

  if (repo.has_pages) {
    const pagesBase = `https://rallypointone.github.io/${repo.name}/`;
    statusHTML += `<a href="${pagesBase}" class="docs-link">Docs Site</a>`;
    statusHTML += `<a href="${pagesBase}dev/coverage/" class="coverage-link">Coverage</a>`;
  }

  card.innerHTML = `
    <div class="card-header">
      <a href="${repo.html_url}" class="repo-name">${repo.name}</a>
      <span class="badge ${repo.private ? 'badge-private' : 'badge-public'}">
        ${repo.private ? 'private' : 'public'}
      </span>
    </div>
    ${repo.description ? `<p class="repo-desc">${escapeHTML(repo.description)}</p>` : ''}
    <div class="status-row">${statusHTML}</div>
    <div class="card-footer">
      ${repo.language ? `<span class="lang-badge">${repo.language}</span>` : ''}
      ${releaseHTML(release)}
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

export function populateLanguageFilter(repos) {
  const select = document.getElementById('filter-language');
  const languages = [...new Set(repos.map(r => r.language).filter(Boolean))].sort();
  // Keep the "All" option, remove any previously added options
  while (select.options.length > 1) select.remove(1);
  for (const lang of languages) {
    const opt = document.createElement('option');
    opt.value = lang;
    opt.textContent = lang;
    select.appendChild(opt);
  }
}

export function getFilters() {
  return {
    language: document.getElementById('filter-language').value,
    visibility: document.getElementById('filter-visibility').value,
    released: document.getElementById('filter-released').value,
    sortBy: document.getElementById('sort-by').value,
  };
}

const STATUS_ORDER = { failure: 0, in_progress: 1, queued: 2, unknown: 3, cancelled: 4, success: 5 };

function filterAndSort(repos, workflowMap, releasesMap, filters) {
  let filtered = [...repos];

  if (filters.language) {
    filtered = filtered.filter(r => r.language === filters.language);
  }
  if (filters.visibility) {
    filtered = filtered.filter(r =>
      filters.visibility === 'private' ? r.private : !r.private
    );
  }
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
      const sa = workflowMap.get(a.name)?.['CI']?.conclusion ?? 'unknown';
      const sb = workflowMap.get(b.name)?.['CI']?.conclusion ?? 'unknown';
      return (STATUS_ORDER[sa] ?? 3) - (STATUS_ORDER[sb] ?? 3);
    });
  }

  return filtered;
}

function getDocsRun(workflows) {
  if (!workflows) return null;
  const entry = Object.entries(workflows).find(([name]) => /docs|documentation/i.test(name));
  return entry ? entry[1] : null;
}

function statusDotHTML(conclusion) {
  return `<span class="status-dot status-${statusClass(conclusion)}"></span>`;
}

function releaseHTML(release) {
  if (!release) return '';
  return `<a href="${release.html_url}" class="release-badge">${release.tag_name}</a>`;
}

function releaseTableHTML(release) {
  if (!release) return '<span class="text-muted">-</span>';
  return `<a href="${release.html_url}" class="release-badge">${release.tag_name}</a><span class="meta"> ${timeAgo(release.published_at)}</span>`;
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

function renderCards(container, filtered, workflowMap, issueCountsMap, releasesMap) {
  container.className = 'view-cards';
  for (const repo of filtered) {
    container.appendChild(createRepoCard(repo, workflowMap.get(repo.name), issueCountsMap.get(repo.name), releasesMap.get(repo.name)));
  }
}

function renderTable(container, filtered, workflowMap, issueCountsMap, releasesMap) {
  container.className = 'view-table';
  const table = document.createElement('table');
  table.className = 'repo-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Repository</th>
        <th>Visibility</th>
        <th>Language</th>
        <th>CI</th>
        <th>Docs</th>
        <th>Links</th>
        <th>Release</th>
        <th>Issues</th>
        <th>Last Pushed</th>
      </tr>
    </thead>
  `;
  const tbody = document.createElement('tbody');
  for (const repo of filtered) {
    const workflows = workflowMap.get(repo.name);
    const ciRun = workflows?.['CI'];
    const docsRun = getDocsRun(workflows);
    const pagesBase = repo.has_pages ? `https://rallypointone.github.io/${repo.name}/` : null;

    const tr = document.createElement('tr');
    tr.dataset.status = ciRun?.conclusion ?? 'unknown';
    tr.innerHTML = `
      <td>
        <a href="${repo.html_url}" class="repo-name">${repo.name}</a>
        ${repo.description ? `<span class="table-desc">${escapeHTML(repo.description)}</span>` : ''}
      </td>
      <td><span class="badge ${repo.private ? 'badge-private' : 'badge-public'}">${repo.private ? 'private' : 'public'}</span></td>
      <td>${repo.language ? `<span class="lang-badge">${repo.language}</span>` : '<span class="text-muted">-</span>'}</td>
      <td class="status-cell">${ciRun
        ? `<a href="${ciRun.html_url}" class="status-item">${statusDotHTML(ciRun.conclusion)} ${ciRun.conclusion ?? 'running'}</a>`
        : `<span class="text-muted">${statusDotHTML(null)} -</span>`}</td>
      <td class="status-cell">${docsRun
        ? `<a href="${docsRun.html_url}" class="status-item">${statusDotHTML(docsRun.conclusion)} ${docsRun.conclusion ?? 'running'}</a>`
        : `<span class="text-muted">-</span>`}</td>
      <td class="links-cell">${pagesBase
        ? `<a href="${pagesBase}">Docs</a> &middot; <a href="${pagesBase}dev/coverage/">Coverage</a>`
        : '<span class="text-muted">-</span>'}</td>
      <td>${releaseTableHTML(releasesMap.get(repo.name))}</td>
      <td class="issues-cell">${issuesTableHTML(repo, issueCountsMap.get(repo.name))}</td>
      <td class="meta">${timeAgo(repo.pushed_at)}</td>
    `;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.appendChild(table);
}

function renderCompact(container, filtered, workflowMap, issueCountsMap, releasesMap) {
  container.className = 'view-compact';
  const list = document.createElement('div');
  list.className = 'compact-list';
  for (const repo of filtered) {
    const workflows = workflowMap.get(repo.name);
    const ciRun = workflows?.['CI'];
    const docsRun = getDocsRun(workflows);
    const pagesBase = repo.has_pages ? `https://rallypointone.github.io/${repo.name}/` : null;

    const row = document.createElement('div');
    row.className = 'compact-row';
    row.dataset.status = ciRun?.conclusion ?? 'unknown';
    row.innerHTML = `
      <span class="compact-status">${statusDotHTML(ciRun?.conclusion)}</span>
      <a href="${repo.html_url}" class="compact-name">${repo.name}</a>
      <span class="badge ${repo.private ? 'badge-private' : 'badge-public'}">${repo.private ? 'private' : 'public'}</span>
      ${repo.language ? `<span class="lang-badge">${repo.language}</span>` : ''}
      ${docsRun ? `<span class="compact-docs">${statusDotHTML(docsRun.conclusion)} Docs</span>` : ''}
      ${pagesBase ? `<a href="${pagesBase}" class="compact-link">Docs Site</a>` : ''}
      ${releaseHTML(releasesMap.get(repo.name))}
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

export function renderDashboard(container, repos, workflowMap, issueCountsMap, releasesMap, filters, view) {
  container.innerHTML = '';

  const filtered = filterAndSort(repos, workflowMap, releasesMap, filters);

  if (filtered.length === 0) {
    container.className = 'view-cards';
    container.innerHTML = '<div class="loading">No repositories match the current filters.</div>';
    return;
  }

  if (view === 'table') {
    renderTable(container, filtered, workflowMap, issueCountsMap, releasesMap);
  } else if (view === 'compact') {
    renderCompact(container, filtered, workflowMap, issueCountsMap, releasesMap);
  } else {
    renderCards(container, filtered, workflowMap, issueCountsMap, releasesMap);
  }
}

