export function assertReleaseCi({ sha, ref, repository, mainSha, runs }) {
  if (repository !== "0disoft/mensor" || ref !== "refs/heads/main" ||
      !/^[a-f0-9]{40}$/u.test(sha ?? "") || mainSha !== sha) {
    throw new Error("Release must use the current 0disoft/mensor main commit.");
  }
  for (const workflow of ["ci.yml", "guarded-rsvp.yml"]) {
    const candidates = runs.filter((run) => run.path === `.github/workflows/${workflow}` &&
      run.event === "push" && run.head_branch === "main" && run.head_sha === sha);
    candidates.sort((a, b) => b.id - a.id);
    const latest = candidates[0];
    if (latest?.status !== "completed" || latest.conclusion !== "success") {
      throw new Error(`Release requires successful ${workflow} on ${sha}.`);
    }
  }
}
