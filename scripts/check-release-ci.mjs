import { assertReleaseCi } from "./lib/release-ci-gate.mjs";

const { GITHUB_SHA: sha, GITHUB_REF: ref, GITHUB_REPOSITORY: repository, GH_TOKEN: token } = process.env;
if (repository !== "0disoft/mensor" || !/^[a-f0-9]{40}$/u.test(sha ?? "")) {
  throw new Error("Expected the Mensor GitHub Actions release context.");
}
const base = "https://api.github.com/repos/0disoft/mensor";
async function get(resource) {
  const response = await fetch(`${base}/${resource}`, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "mensor-release-ci-gate",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Release CI query failed: HTTP ${response.status}.`);
  return response.json();
}
const main = await get("git/ref/heads/main");
const result = await get(`actions/runs?head_sha=${sha}&event=push&per_page=100`);
assertReleaseCi({ sha, ref, repository, mainSha: main.object.sha, runs: result.workflow_runs });
console.log(`RELEASE_CI_VERIFIED ${sha}`);
