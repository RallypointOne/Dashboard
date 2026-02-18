const API_BASE = 'https://api.github.com';
const ORG = 'RallypointOne';
const TOKEN = process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.error('GITHUB_TOKEN environment variable is required');
  process.exit(1);
}

const headers = {
  'Accept': 'application/vnd.github+json',
  'Authorization': `Bearer ${TOKEN}`,
};

async function apiFetch(endpoint) {
  const res = await fetch(`${API_BASE}${endpoint}`, { headers });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`GitHub API ${res.status}: ${res.statusText} for ${endpoint}`);
  }
  return res.json();
}

async function fetchAllRepos() {
  let page = 1;
  let allRepos = [];
  while (true) {
    const repos = await apiFetch(`/orgs/${ORG}/repos?per_page=100&sort=pushed&page=${page}`);
    if (!repos || repos.length === 0) break;
    allRepos = allRepos.concat(repos);
    if (repos.length < 100) break;
    page++;
  }
  return allRepos;
}

async function fetchWorkflowRuns(repo, branch) {
  const data = await apiFetch(
    `/repos/${ORG}/${repo}/actions/runs?per_page=20&branch=${encodeURIComponent(branch)}`
  );
  if (!data || !data.workflow_runs) return null;

  const latest = new Map();
  for (const run of data.workflow_runs) {
    if (!latest.has(run.name)) {
      latest.set(run.name, {
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        html_url: run.html_url,
        created_at: run.created_at,
      });
    }
  }
  return Object.fromEntries(latest);
}

async function fetchLatestRelease(repo) {
  const data = await apiFetch(`/repos/${ORG}/${repo}/releases/latest`);
  if (!data) return null;
  return {
    tag_name: data.tag_name,
    html_url: data.html_url,
    published_at: data.published_at,
  };
}

async function fetchIssueCounts(repo) {
  const [open, closed] = await Promise.all([
    apiFetch(`/search/issues?q=repo:${ORG}/${repo}+type:issue+state:open&per_page=1`),
    apiFetch(`/search/issues?q=repo:${ORG}/${repo}+type:issue+state:closed&per_page=1`),
  ]);
  return {
    open: open?.total_count ?? 0,
    closed: closed?.total_count ?? 0,
  };
}

async function fetchPendingRegistrations() {
  // Search for open PRs in JuliaRegistries/General mentioning the org
  let data;
  try {
    data = await apiFetch(
      `/search/issues?q=repo:JuliaRegistries/General+type:pr+state:open+${ORG}&per_page=100`
    );
  } catch (err) {
    console.warn(`Warning: could not fetch pending registrations: ${err.message}`);
    return {};
  }
  if (!data || !data.items) return {};

  // Map repo names to their pending registration PRs
  // PR titles look like "New package: PkgName v0.1.0" or "New version: PkgName v0.2.0"
  const pending = {};
  for (const pr of data.items) {
    const match = pr.title.match(/^New (?:package|version): (\S+) (v\S+)$/);
    if (match) {
      const pkgName = match[1];
      // Try to match to a repo name (Julia repos often end in .jl)
      const repoName = pkgName.endsWith('.jl') ? pkgName : `${pkgName}.jl`;
      pending[repoName] = {
        version: match[2],
        html_url: pr.html_url,
        title: pr.title,
      };
    }
  }
  return pending;
}

async function main() {
  console.log(`Fetching repos for ${ORG}...`);
  const repos = await fetchAllRepos();
  console.log(`Found ${repos.length} repos`);

  // Fetch all supplementary data in parallel
  const [workflowResults, releaseResults, issueResults, pendingRegs] = await Promise.all([
    Promise.allSettled(
      repos.map(repo =>
        fetchWorkflowRuns(repo.name, repo.default_branch || 'main')
          .then(runs => ({ name: repo.name, runs }))
      )
    ),
    Promise.allSettled(
      repos.map(repo =>
        fetchLatestRelease(repo.name)
          .then(release => ({ name: repo.name, release }))
      )
    ),
    Promise.allSettled(
      repos.map(repo =>
        fetchIssueCounts(repo.name)
          .then(counts => ({ name: repo.name, counts }))
      )
    ),
    fetchPendingRegistrations(),
  ]);

  const workflows = {};
  for (const result of workflowResults) {
    if (result.status === 'fulfilled' && result.value.runs) {
      workflows[result.value.name] = result.value.runs;
    }
  }

  const releases = {};
  for (const result of releaseResults) {
    if (result.status === 'fulfilled' && result.value.release) {
      releases[result.value.name] = result.value.release;
    }
  }

  const issue_counts = {};
  for (const result of issueResults) {
    if (result.status === 'fulfilled') {
      issue_counts[result.value.name] = result.value.counts;
    }
  }

  console.log(`Pending registrations: ${Object.keys(pendingRegs).length}`);

  const data = {
    generated_at: new Date().toISOString(),
    repos,
    workflows,
    issue_counts,
    releases,
    pending_releases: pendingRegs,
  };

  const fs = await import('node:fs');
  const path = await import('node:path');
  const outPath = path.join(import.meta.dirname, '..', 'data.json');
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`Wrote ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
