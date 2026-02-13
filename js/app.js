import { GitHubAPI } from './github-api.js';
import {
  renderDashboard,
  populateLanguageFilter,
  getFilters,
  getView,
  setView,
  updateRateLimit,
} from './components.js';

const ORG = 'RallypointOne';
const api = new GitHubAPI();

let cachedRepos = [];
let cachedWorkflows = new Map();
let cachedIssueCounts = new Map();
let cachedReleases = new Map();

async function loadDashboard() {
  const dashboard = document.getElementById('dashboard');
  dashboard.innerHTML = '<div class="loading">Loading repositories...</div>';

  try {
    const repos = await api.fetchOrgRepos(ORG);
    if (!repos || repos.length === 0) {
      dashboard.innerHTML = `<div class="error">
        <p>No repositories found.</p>
        ${!api.isAuthenticated() ? '<p>Add a GitHub token in settings to see private repos.</p>' : ''}
      </div>`;
      updateRateLimit(api.getRateLimit());
      return;
    }

    // Fetch workflow runs, issue counts, and releases for all repos in parallel
    const [workflowResults, issueResults, releaseResults] = await Promise.all([
      Promise.allSettled(
        repos.map(repo =>
          api.fetchWorkflowRuns(ORG, repo.name, repo.default_branch || 'main')
            .then(runs => ({ name: repo.name, runs }))
            .catch(() => ({ name: repo.name, runs: null }))
        )
      ),
      Promise.allSettled(
        repos.map(repo =>
          api.fetchIssueCounts(ORG, repo.name)
            .then(counts => ({ name: repo.name, counts }))
            .catch(() => ({ name: repo.name, counts: null }))
        )
      ),
      Promise.allSettled(
        repos.map(repo =>
          api.fetchLatestRelease(ORG, repo.name)
            .then(release => ({ name: repo.name, release }))
            .catch(() => ({ name: repo.name, release: null }))
        )
      ),
    ]);

    const workflowMap = new Map();
    for (const result of workflowResults) {
      if (result.status === 'fulfilled') {
        workflowMap.set(result.value.name, result.value.runs);
      }
    }

    const issueCountsMap = new Map();
    for (const result of issueResults) {
      if (result.status === 'fulfilled') {
        issueCountsMap.set(result.value.name, result.value.counts);
      }
    }

    const releasesMap = new Map();
    for (const result of releaseResults) {
      if (result.status === 'fulfilled') {
        releasesMap.set(result.value.name, result.value.release);
      }
    }

    cachedRepos = repos;
    cachedWorkflows = workflowMap;
    cachedIssueCounts = issueCountsMap;
    cachedReleases = releasesMap;

    populateLanguageFilter(repos);
    renderDashboard(dashboard, repos, workflowMap, issueCountsMap, releasesMap, getFilters(), getView());
    updateRateLimit(api.getRateLimit());
    updateLastRefreshed();

  } catch (err) {
    dashboard.innerHTML = `<div class="error">
      <p>Error: ${err.message}</p>
      ${!api.isAuthenticated() ? '<p>Try adding a GitHub token in settings.</p>' : ''}
    </div>`;
    updateRateLimit(api.getRateLimit());
  }
}

function updateLastRefreshed() {
  document.getElementById('last-refreshed').textContent =
    `Last refreshed: ${new Date().toLocaleTimeString()}`;
}

function applyFilters() {
  if (cachedRepos.length === 0) return;
  const dashboard = document.getElementById('dashboard');
  renderDashboard(dashboard, cachedRepos, cachedWorkflows, cachedIssueCounts, cachedReleases, getFilters(), getView());
}

function initSettings() {
  const toggle = document.getElementById('settings-toggle');
  const panel = document.getElementById('settings-panel');
  const tokenInput = document.getElementById('token-input');
  const saveBtn = document.getElementById('token-save');
  const clearBtn = document.getElementById('token-clear');

  toggle.addEventListener('click', () => {
    panel.classList.toggle('collapsed');
  });

  if (api.isAuthenticated()) {
    tokenInput.placeholder = 'Token saved';
  }

  saveBtn.addEventListener('click', () => {
    const token = tokenInput.value.trim();
    if (token) {
      api.setToken(token);
      tokenInput.value = '';
      tokenInput.placeholder = 'Token saved';
      loadDashboard();
    }
  });

  clearBtn.addEventListener('click', () => {
    api.clearToken();
    tokenInput.placeholder = 'ghp_...';
    loadDashboard();
  });
}

function initFilters() {
  document.getElementById('filter-language').addEventListener('change', applyFilters);
  document.getElementById('filter-visibility').addEventListener('change', applyFilters);
  document.getElementById('sort-by').addEventListener('change', applyFilters);

  // View toggle
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
  initSettings();
  initFilters();
  document.getElementById('refresh-btn').addEventListener('click', () => {
    sessionStorage.clear();
    loadDashboard();
  });
  loadDashboard();
  setInterval(loadDashboard, 5 * 60 * 1000);
});
