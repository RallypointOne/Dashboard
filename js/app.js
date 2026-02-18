import {
  renderDashboard,
  populateLanguageFilter,
  getFilters,
  getView,
  setView,
} from './components.js';

let cachedRepos = [];
let cachedWorkflows = new Map();
let cachedIssueCounts = new Map();
let cachedReleases = new Map();
let cachedPendingReleases = new Map();

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

    // Build releasesMap: prefer GitHub Release, fall back to General registry
    const releasesMap = new Map(Object.entries(data.releases));
    const registryMap = data.registry || {};
    for (const [name, reg] of Object.entries(registryMap)) {
      if (!releasesMap.has(name)) {
        releasesMap.set(name, {
          tag_name: reg.version,
          html_url: reg.registry_url,
          published_at: null,
        });
      }
    }

    cachedRepos = repos;
    cachedWorkflows = workflowMap;
    cachedIssueCounts = issueCountsMap;
    cachedReleases = releasesMap;
    cachedPendingReleases = pendingReleasesMap;

    populateLanguageFilter(repos);
    renderDashboard(dashboard, repos, workflowMap, issueCountsMap, releasesMap, pendingReleasesMap, getFilters(), getView());

    const mins = Math.round((Date.now() - new Date(data.generated_at)) / 60000);
    document.getElementById('last-refreshed').textContent =
      `Last updated: ${mins <= 0 ? 'just now' : `${mins} minute${mins === 1 ? '' : 's'} ago`}`;

  } catch (err) {
    dashboard.innerHTML = `<div class="error"><p>Error: ${err.message}</p></div>`;
  }
}

function applyFilters() {
  if (cachedRepos.length === 0) return;
  const dashboard = document.getElementById('dashboard');
  renderDashboard(dashboard, cachedRepos, cachedWorkflows, cachedIssueCounts, cachedReleases, cachedPendingReleases, getFilters(), getView());
}

function initFilters() {
  document.getElementById('filter-language').addEventListener('change', applyFilters);
  document.getElementById('filter-released').addEventListener('change', applyFilters);
  document.getElementById('sort-by').addEventListener('change', applyFilters);

  const viewBtns = document.querySelectorAll('.view-btn');
  const saved = getView();
  viewBtns.forEach(btn => {
    if (btn.dataset.view === saved) btn.classList.add('active');
    else btn.classList.remove('active');
    btn.addEventListener('click', () => {
      viewBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setView(btn.dataset.view);
      applyFilters();
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initFilters();
  loadDashboard();
});
