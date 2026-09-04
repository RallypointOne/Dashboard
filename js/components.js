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
      case 'stars':
        cmp = (a.stargazers_count ?? 0) - (b.stargazers_count ?? 0);
        break;
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

function timelineHTML(label, runs) {
  if (!runs || runs.length === 0) return '';
  const passed = runs.filter(r => r.conclusion === 'success').length;
  const summary = `${label}: ${passed} of the last ${runs.length} runs passed`;
  return `<span class="status-timeline" data-tip="${summary}">${runs.map((r, i) => {
    const isLatest = i === runs.length - 1;
    const latestCls = isLatest ? ' status-bar-latest' : '';
    const when = `${timeAgo(r.created_at)} (${new Date(r.created_at).toLocaleString()})`;
    const state = r.conclusion ?? r.status ?? 'unknown';

    if (r.jobs && r.jobs.total > 0) {
      const passPct = (r.jobs.passed / r.jobs.total) * 100;
      const failPct = (r.jobs.failed / r.jobs.total) * 100;
      const otherPct = 100 - passPct - failPct;
      const title = `${label} ${state}: ${r.jobs.passed}/${r.jobs.total} jobs passed${r.jobs.failed ? `, ${r.jobs.failed} failed` : ''}\n${when}`;
      let segments = '';
      if (failPct > 0) segments += `<span class="bar-segment bar-fail" style="height:${failPct}%"></span>`;
      if (otherPct > 0) segments += `<span class="bar-segment bar-other" style="height:${otherPct}%"></span>`;
      if (passPct > 0) segments += `<span class="bar-segment bar-pass" style="height:${passPct}%"></span>`;
      return `<a href="${r.html_url}" class="status-bar status-bar-stacked${latestCls}" data-tip="${title}">${segments}</a>`;
    }

    return `<a href="${r.html_url}" class="status-bar status-${statusClass(r.conclusion)}${latestCls}" data-tip="${label} ${state}\n${when}"></a>`;
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

function renderTable(container, filtered, workflowMap, issueCountsMap, releasesMap, pendingReleasesMap, prCountsMap, sortState, onSort) {
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
    { label: 'Stars', key: 'stars' },
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

    const tr = document.createElement('tr');

    const repoLinks = isJuliaPkg(repo) && pagesBase
      ? `<span class="repo-links"><a href="${pagesBase}" class="docs-link">Docs</a></span>`
      : '';

    tr.innerHTML = `
      <td>
        <a href="${repo.html_url}" class="repo-name">${repo.name}</a>
        ${repoLinks}
        ${repo.description ? `<span class="table-desc" data-tip="${escapeHTML(repo.description)}" data-tip-below>${escapeHTML(repo.description)}</span>` : ''}
      </td>
      <td class="status-cell">${ciRuns
        ? timelineHTML('CI', ciRuns)
        : `<span class="text-muted">-</span>`}</td>
      <td class="status-cell">${isJuliaPkg(repo)
        ? (docsRuns
          ? timelineHTML('Docs', docsRuns)
          : `<span class="text-muted">-</span>`)
        : ''}</td>
      <td>${releaseTableHTML(releasesMap.get(repo.name), pendingReleasesMap.get(repo.name))}</td>
      <td class="issues-cell">${issuesTableHTML(repo, issueCountsMap.get(repo.name))}</td>
      <td class="issues-cell">${prsTableHTML(repo, prCountsMap.get(repo.name))}</td>
      <td class="num-cell"><a href="${repo.html_url}/stargazers">${repo.stargazers_count ?? 0}</a></td>
      <td class="meta">${timeAgo(repo.pushed_at)}</td>
    `;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.appendChild(table);
}

export function renderDashboard(container, repos, workflowMap, issueCountsMap, releasesMap, pendingReleasesMap, prCountsMap, sortState, onSort) {
  container.innerHTML = '';
  container.className = '';

  if (repos.length === 0) {
    container.innerHTML = '<div class="loading">No repositories found.</div>';
    return;
  }

  const sorted = sortRepos(repos, workflowMap, issueCountsMap, releasesMap, prCountsMap, sortState);
  renderTable(container, sorted, workflowMap, issueCountsMap, releasesMap, pendingReleasesMap, prCountsMap, sortState, onSort);
}
