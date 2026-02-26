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

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

const STATUS_ORDER = { failure: 0, in_progress: 1, queued: 2, unknown: 3, cancelled: 4, success: 5 };

function sortRepos(repos, workflowMap, issueCountsMap, releasesMap, prCountsMap, sortState) {
  const sorted = [...repos];
  const dir = sortState.dir === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    let cmp = 0;
    switch (sortState.col) {
      case 'name':
        cmp = a.name.localeCompare(b.name);
        break;
      case 'ci': {
        const sa = getLatestRun(workflowMap.get(a.name)?.['CI'])?.conclusion ?? 'unknown';
        const sb = getLatestRun(workflowMap.get(b.name)?.['CI'])?.conclusion ?? 'unknown';
        cmp = (STATUS_ORDER[sa] ?? 3) - (STATUS_ORDER[sb] ?? 3);
        break;
      }
      case 'docs': {
        const da = getDocsRuns(workflowMap.get(a.name));
        const db = getDocsRuns(workflowMap.get(b.name));
        const sa = da ? (getLatestRun(da)?.conclusion ?? 'unknown') : 'zzz';
        const sb = db ? (getLatestRun(db)?.conclusion ?? 'unknown') : 'zzz';
        cmp = (STATUS_ORDER[sa] ?? 3) - (STATUS_ORDER[sb] ?? 3);
        break;
      }
      case 'release': {
        const ra = releasesMap.get(a.name)?.tag_name ?? '';
        const rb = releasesMap.get(b.name)?.tag_name ?? '';
        cmp = ra.localeCompare(rb);
        break;
      }
      case 'issues': {
        const oa = issueCountsMap.get(a.name)?.open ?? 0;
        const ob = issueCountsMap.get(b.name)?.open ?? 0;
        cmp = oa - ob;
        break;
      }
      case 'prs': {
        const pa = prCountsMap.get(a.name)?.open ?? 0;
        const pb = prCountsMap.get(b.name)?.open ?? 0;
        cmp = pa - pb;
        break;
      }
      case 'pushed':
      default:
        cmp = new Date(a.pushed_at) - new Date(b.pushed_at);
        break;
    }
    return cmp * dir;
  });

  return sorted;
}

function getDocsRuns(workflows) {
  if (!workflows) return null;
  const entry = Object.entries(workflows).find(([name]) => /docs|documentation/i.test(name));
  return entry ? entry[1] : null;
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

function issuesTableHTML(repo, counts) {
  const url = repo.html_url + '/issues';
  const open = counts?.open ?? 0;
  const closed = counts?.closed ?? 0;
  return `<a href="${url}?q=is%3Aissue+is%3Aopen" class="issues-open">${open}</a> / <a href="${url}?q=is%3Aissue+is%3Aclosed" class="issues-closed">${closed}</a>`;
}

function sortIndicator(col, sortState) {
  if (sortState.col !== col) return '';
  return sortState.dir === 'asc' ? ' \u25B2' : ' \u25BC';
}

function prsTableHTML(repo, counts) {
  const open = counts?.open ?? 0;
  const url = repo.html_url + '/pulls';
  return `<a href="${url}">${open}</a>`;
}

function renderTable(container, filtered, workflowMap, issueCountsMap, releasesMap, pendingReleasesMap, coverageMap, prCountsMap, sortState, onSort) {
  container.className = 'view-table';
  const table = document.createElement('table');
  table.className = 'repo-table';

  const columns = [
    { label: 'Repository', key: 'name' },
    { label: 'CI', key: 'ci' },
    { label: 'Docs', key: 'docs' },
    { label: 'Release', key: 'release' },
    { label: 'Issues', key: 'issues' },
    { label: 'PRs', key: 'prs' },
    { label: 'Last Pushed', key: 'pushed' },
  ];

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const col of columns) {
    const th = document.createElement('th');
    th.className = 'sortable';
    if (sortState.col === col.key) th.classList.add('sorted');
    th.textContent = col.label + sortIndicator(col.key, sortState);
    th.addEventListener('click', () => onSort(col.key));
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);
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
      <td class="issues-cell">${prsTableHTML(repo, prCountsMap.get(repo.name))}</td>
      <td class="meta">${timeAgo(repo.pushed_at)}</td>
    `;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.appendChild(table);
}

function renderSection(container, label, repos, workflowMap, issueCountsMap, releasesMap, pendingReleasesMap, coverageMap, prCountsMap, sortState, onSort) {
  if (repos.length === 0) return;

  const heading = document.createElement('h2');
  heading.className = 'section-heading';
  heading.textContent = label;
  container.appendChild(heading);

  const section = document.createElement('div');
  renderTable(section, repos, workflowMap, issueCountsMap, releasesMap, pendingReleasesMap, coverageMap, prCountsMap, sortState, onSort);
  container.appendChild(section);
}

export function renderDashboard(container, repos, workflowMap, issueCountsMap, releasesMap, pendingReleasesMap, coverageMap, prCountsMap, sortState, onSort) {
  container.innerHTML = '';
  container.className = '';

  if (repos.length === 0) {
    container.innerHTML = '<div class="loading">No repositories found.</div>';
    return;
  }

  const juliaPackages = sortRepos(repos.filter(r => isJuliaPkg(r)), workflowMap, issueCountsMap, releasesMap, prCountsMap, sortState);
  const other = sortRepos(repos.filter(r => !isJuliaPkg(r)), workflowMap, issueCountsMap, releasesMap, prCountsMap, sortState);

  renderSection(container, 'Julia Packages', juliaPackages, workflowMap, issueCountsMap, releasesMap, pendingReleasesMap, coverageMap, prCountsMap, sortState, onSort);
  renderSection(container, 'Other', other, workflowMap, issueCountsMap, releasesMap, pendingReleasesMap, coverageMap, prCountsMap, sortState, onSort);
}

