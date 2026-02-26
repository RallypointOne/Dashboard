import { renderDashboard } from './components.js';

let cachedRepos = [];
let cachedWorkflows = new Map();
let cachedIssueCounts = new Map();
let cachedReleases = new Map();
let cachedPendingReleases = new Map();
let cachedCoverage = new Map();
let cachedPRCounts = new Map();
let cachedTraffic = new Map();

let sortState = { col: 'pushed', dir: 'desc' };

function render() {
  if (cachedRepos.length === 0) return;
  const dashboard = document.getElementById('dashboard');
  renderDashboard(dashboard, cachedRepos, cachedWorkflows, cachedIssueCounts, cachedReleases, cachedPendingReleases, cachedCoverage, cachedPRCounts, cachedTraffic, sortState, onSort);
}

function onSort(col) {
  if (sortState.col === col) {
    sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
  } else {
    sortState.col = col;
    sortState.dir = col === 'name' ? 'asc' : 'desc';
  }
  render();
}

async function loadDashboard() {
  const dashboard = document.getElementById('dashboard');
  dashboard.innerHTML = '<div class="loading">Loading repositories...</div>';

  try {
    const res = await fetch('data.json');
    if (!res.ok) throw new Error(`Failed to load data.json: ${res.status}`);
    const data = await res.json();

    const repos = data.repos;
    if (!repos || repos.length === 0) {
      dashboard.innerHTML = '<div class="error"><p>No repositories found.</p></div>';
      return;
    }

    const workflowMap = new Map(Object.entries(data.workflows));
    const issueCountsMap = new Map(Object.entries(data.issue_counts));
    const pendingReleasesMap = new Map(Object.entries(data.pending_releases || {}));

    const releasesMap = new Map(Object.entries(data.releases));
    const registryMap = data.registry || {};
    for (const [name, reg] of Object.entries(registryMap)) {
      if (!releasesMap.has(name)) {
        releasesMap.set(name, {
          tag_name: reg.version,
          html_url: reg.registry_url,
          published_at: reg.published_at || null,
        });
      }
    }

    const coverageMap = new Map(Object.entries(data.coverage || {}));
    const prCountsMap = new Map(Object.entries(data.pr_counts || {}));
    const trafficMap = new Map(Object.entries(data.traffic || {}));

    cachedRepos = repos;
    cachedWorkflows = workflowMap;
    cachedIssueCounts = issueCountsMap;
    cachedReleases = releasesMap;
    cachedPendingReleases = pendingReleasesMap;
    cachedCoverage = coverageMap;
    cachedPRCounts = prCountsMap;
    cachedTraffic = trafficMap;

    render();

    const mins = Math.round((Date.now() - new Date(data.generated_at)) / 60000);
    document.getElementById('last-refreshed').textContent =
      `Last updated: ${mins <= 0 ? 'just now' : `${mins} minute${mins === 1 ? '' : 's'} ago`}`;

  } catch (err) {
    dashboard.innerHTML = `<div class="error"><p>Error: ${err.message}</p></div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
});
