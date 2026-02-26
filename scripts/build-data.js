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
    const repos = await apiFetch(`/orgs/${ORG}/repos?per_page=100&sort=pushed&type=public&page=${page}`);
    if (!repos || repos.length === 0) break;
    allRepos = allRepos.concat(repos);
    if (repos.length < 100) break;
    page++;
  }
  return allRepos;
}

async function fetchRunJobs(repo, runId) {
  const data = await apiFetch(`/repos/${ORG}/${repo}/actions/runs/${runId}/jobs`);
  if (!data || !data.jobs) return null;
  const total = data.jobs.length;
  const passed = data.jobs.filter(j => j.conclusion === 'success' || j.conclusion === 'skipped').length;
  const failed = data.jobs.filter(j => j.conclusion === 'failure').length;
  return { total, passed, failed };
}

async function fetchWorkflowRuns(repo, branch) {
  const data = await apiFetch(
    `/repos/${ORG}/${repo}/actions/runs?per_page=100&branch=${encodeURIComponent(branch)}`
  );
  if (!data || !data.workflow_runs) return null;

  const grouped = new Map();
  for (const run of data.workflow_runs) {
    if (!grouped.has(run.name)) grouped.set(run.name, []);
    grouped.get(run.name).push({
      id: run.id,
      status: run.status,
      conclusion: run.conclusion,
      html_url: run.html_url,
      created_at: run.created_at,
    });
  }
  // Keep last 10 per workflow, reversed so oldest come first (for left-to-right timeline)
  for (const [key, runs] of grouped) grouped.set(key, runs.slice(0, 10).reverse());

  // Fetch job stats for each run
  for (const [key, runs] of grouped) {
    const jobResults = await Promise.allSettled(
      runs.map(run => fetchRunJobs(repo, run.id))
    );
    for (let i = 0; i < runs.length; i++) {
      if (jobResults[i].status === 'fulfilled' && jobResults[i].value) {
        runs[i].jobs = jobResults[i].value;
      }
      delete runs[i].id;
    }
  }

  return Object.fromEntries(grouped);
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

async function fetchRegistryVersion(repoName) {
  // Julia repos end in .jl; package name in General registry omits the .jl
  if (!repoName.endsWith('.jl')) return null;
  const pkgName = repoName.slice(0, -3);
  const letter = pkgName[0];
  const data = await apiFetch(
    `/repos/JuliaRegistries/General/contents/${letter}/${pkgName}/Versions.toml`
  );
  if (!data || !data.content) return null;
  const content = Buffer.from(data.content, 'base64').toString('utf-8');
  // Parse version entries like ["0.1.2"]
  const versions = [...content.matchAll(/^\["(.+?)"\]/gm)].map(m => m[1]);
  if (versions.length === 0) return null;
  const latest = versions[versions.length - 1];

  // Fetch the date of the latest commit to Versions.toml (i.e. when the latest version was registered)
  let published_at = null;
  const commits = await apiFetch(
    `/repos/JuliaRegistries/General/commits?path=${letter}/${pkgName}/Versions.toml&per_page=1`
  );
  if (commits && commits.length > 0) {
    published_at = commits[0].commit?.committer?.date ?? null;
  }

  return { version: `v${latest}`, registry_url: `https://juliahub.com/ui/Packages/General/${pkgName}`, published_at };
}

async function fetchCoverage(repoName) {
  if (!repoName.endsWith('.jl')) return null;
  const url = `https://rallypointone.github.io/${repoName}/dev/coverage/index.html`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/headerCovTableEntry\w+">\s*(\d+\.?\d*)\s*%/);
    if (!match) return null;
    return parseFloat(match[1]);
  } catch {
    return null;
  }
}

async function fetchTraffic(repo) {
  // Requires push access — will 403 with default GITHUB_TOKEN for other org repos
  const res = await fetch(`${API_BASE}/repos/${ORG}/${repo}/traffic/views`, { headers });
  if (!res.ok) return null;
  const data = await res.json();
  return { views: data.count ?? 0, uniques: data.uniques ?? 0 };
}

async function fetchPRCounts(repo) {
  const data = await apiFetch(`/search/issues?q=repo:${ORG}/${repo}+type:pr+state:open&per_page=1`);
  return { open: data?.total_count ?? 0 };
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
  let allRepos = await fetchAllRepos();
  console.log(`Found ${allRepos.length} repos`);
  const repos = allRepos.filter(r => !r.archived && !r.topics?.includes('no-dashboard'));
  console.log(`After filtering: ${repos.length} repos (${allRepos.length - repos.length} excluded)`);

  // Fetch all supplementary data in parallel
  const [workflowResults, releaseResults, issueResults, registryResults, coverageResults, prResults, trafficResults, pendingRegs] = await Promise.all([
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
    Promise.allSettled(
      repos.map(repo =>
        fetchRegistryVersion(repo.name)
          .then(reg => ({ name: repo.name, reg }))
      )
    ),
    Promise.allSettled(
      repos.map(repo =>
        fetchCoverage(repo.name)
          .then(pct => ({ name: repo.name, pct }))
      )
    ),
    Promise.allSettled(
      repos.map(repo =>
        fetchPRCounts(repo.name)
          .then(counts => ({ name: repo.name, counts }))
      )
    ),
    Promise.allSettled(
      repos.map(repo =>
        fetchTraffic(repo.name)
          .then(traffic => ({ name: repo.name, traffic }))
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

  const registry = {};
  for (const result of registryResults) {
    if (result.status === 'fulfilled' && result.value.reg) {
      registry[result.value.name] = result.value.reg;
    }
  }

  const coverage = {};
  for (const result of coverageResults) {
    if (result.status === 'fulfilled' && result.value.pct != null) {
      coverage[result.value.name] = result.value.pct;
    }
  }

  const pr_counts = {};
  for (const result of prResults) {
    if (result.status === 'fulfilled') {
      pr_counts[result.value.name] = result.value.counts;
    }
  }

  const traffic = {};
  for (const result of trafficResults) {
    if (result.status === 'fulfilled' && result.value.traffic) {
      traffic[result.value.name] = result.value.traffic;
    }
  }

  console.log(`Registry entries: ${Object.keys(registry).length}`);
  console.log(`Coverage entries: ${Object.keys(coverage).length}`);
  console.log(`Traffic entries: ${Object.keys(traffic).length}`);
  console.log(`Pending registrations: ${Object.keys(pendingRegs).length}`);

  const data = {
    generated_at: new Date().toISOString(),
    repos,
    workflows,
    issue_counts,
    pr_counts,
    traffic,
    releases,
    registry,
    coverage,
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
