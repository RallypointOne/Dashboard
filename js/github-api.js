const API_BASE = 'https://api.github.com';
const CACHE_TTL = 5 * 60 * 1000;
export class GitHubAPI {
  get #headers() {
    return { 'Accept': 'application/vnd.github+json' };
  }

  async #fetch(endpoint) {
    const cacheKey = `gh_cache_${endpoint}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const { data, ts } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL) return data;
    }

    const res = await fetch(`${API_BASE}${endpoint}`, { headers: this.#headers });

    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    sessionStorage.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() }));
    return data;
  }

  async fetchOrgRepos(org) {
    // Paginate to get all repos
    let page = 1;
    let allRepos = [];
    while (true) {
      const repos = await this.#fetch(`/orgs/${org}/repos?per_page=100&sort=pushed&page=${page}`);
      if (!repos || repos.length === 0) break;
      allRepos = allRepos.concat(repos);
      if (repos.length < 100) break;
      page++;
    }
    return allRepos;
  }

  async fetchWorkflowRuns(owner, repo, branch) {
    const data = await this.#fetch(
      `/repos/${owner}/${repo}/actions/runs?per_page=20&branch=${encodeURIComponent(branch)}`
    );
    if (!data || !data.workflow_runs) return null;

    // Group by workflow name, keep only latest run per workflow
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

  async fetchLatestRelease(owner, repo) {
    const data = await this.#fetch(`/repos/${owner}/${repo}/releases/latest`);
    if (!data) return null;
    return {
      tag_name: data.tag_name,
      html_url: data.html_url,
      published_at: data.published_at,
    };
  }

  async fetchIssueCounts(owner, repo) {
    const open = await this.#fetch(
      `/search/issues?q=repo:${owner}/${repo}+type:issue+state:open&per_page=1`
    );
    const closed = await this.#fetch(
      `/search/issues?q=repo:${owner}/${repo}+type:issue+state:closed&per_page=1`
    );
    return {
      open: open?.total_count ?? 0,
      closed: closed?.total_count ?? 0,
    };
  }

}
