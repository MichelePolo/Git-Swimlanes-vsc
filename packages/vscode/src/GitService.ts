import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);

const LOG_ARGS = [
  "-c", "core.quotepath=false", "--no-pager", "log",
  "--all", "--date-order", "--name-status",
  "--pretty=format:%H|%P|%D|%an|%ad|%s", "--date=short",
];

/** Remote URL → PR-ref fetch refspec (spec §7.2). Mirrors engine src/forge.ts. */
function pullRefspecFor(remoteUrl: string): string | null {
  const url = remoteUrl.toLowerCase();
  if (url.includes("github.com")) return "+refs/pull/*/head:refs/remotes/origin/pr/*";
  if (url.includes("dev.azure.com") || url.includes("visualstudio.com")) {
    return "+refs/pull/*/merge:refs/remotes/origin/pr/*";
  }
  if (url.includes("gitlab")) return "+refs/merge-requests/*/head:refs/remotes/origin/mr/*";
  if (url.includes("bitbucket.org")) return "+refs/pull-requests/*/from:refs/remotes/origin/pr/*";
  return null;
}

export class GitService {
  constructor(private cwd: string) {}

  /** Point at a different repository root (multi-repo switch). */
  setCwd(cwd: string): void {
    this.cwd = cwd;
  }

  async log(): Promise<string> {
    const { stdout } = await run("git", LOG_ARGS, {
      cwd: this.cwd, maxBuffer: 64 * 1024 * 1024,
    });
    return stdout;
  }

  /**
   * Fetch the forge's pull/merge-request refs so they appear as lanes (spec §7.2).
   * Uses git's own credentials; no token handling. Throws if the forge is unrecognized.
   */
  async fetchPullRefs(): Promise<void> {
    const remote = await this.remoteName();
    const { stdout: url } = await run("git", ["remote", "get-url", remote], { cwd: this.cwd });
    const refspec = pullRefspecFor(url.trim());
    if (!refspec) throw new Error(`Forge non riconosciuta dal remote: ${url.trim()}`);
    await run("git", ["fetch", remote, refspec], { cwd: this.cwd, maxBuffer: 16 * 1024 * 1024 });
  }

  async fetch(): Promise<void> {
    await run("git", ["fetch", "--all", "--prune"], { cwd: this.cwd, maxBuffer: 16 * 1024 * 1024 });
  }

  async pull(): Promise<void> {
    await run("git", ["pull", "--ff"], { cwd: this.cwd, maxBuffer: 16 * 1024 * 1024 });
  }

  async status(): Promise<string> {
    const { stdout } = await run("git", ["-c", "core.quotepath=false", "status", "--porcelain"], {
      cwd: this.cwd, maxBuffer: 16 * 1024 * 1024,
    });
    return stdout;
  }

  private async remoteName(): Promise<string> {
    const { stdout } = await run("git", ["remote"], { cwd: this.cwd });
    const remotes = stdout.split("\n").map((s) => s.trim()).filter(Boolean);
    if (remotes.length === 0) throw new Error("Nessun remote configurato");
    return remotes.includes("origin") ? "origin" : remotes[0];
  }

  async show(hash: string, path: string, oldPath?: string): Promise<string> {
    if (!/^[0-9a-f]{7,40}$/.test(hash)) throw new Error("invalid hash");
    // For renames, pass both paths after `--` so the rename hunk renders (spec §5.3).
    const paths = oldPath ? [oldPath, path] : [path];
    const { stdout } = await run("git", ["show", "-M", hash, "--", ...paths], {
      cwd: this.cwd, maxBuffer: 32 * 1024 * 1024,
    });
    return stdout;
  }

  async createBranch(name: string, hash: string): Promise<void> {
    await run("git", ["branch", name, hash], { cwd: this.cwd });
  }

  async createTag(name: string, hash: string): Promise<void> {
    await run("git", ["tag", name, hash], { cwd: this.cwd });
  }

  async deleteBranch(name: string): Promise<void> {
    await run("git", ["branch", "-d", name], { cwd: this.cwd });
  }

  async deleteTag(name: string): Promise<void> {
    await run("git", ["tag", "-d", name], { cwd: this.cwd });
  }

  async switchRef(target: string, detach: boolean): Promise<void> {
    const args = detach ? ["switch", "--detach", target] : ["switch", target];
    await run("git", args, { cwd: this.cwd });
  }

  async currentBranchInfo(): Promise<{ branch: string; hasUpstream: boolean; remote: string }> {
    const { stdout: branch } = await run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: this.cwd });
    let hasUpstream = false;
    try {
      await run("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], { cwd: this.cwd });
      hasUpstream = true;
    } catch {
      hasUpstream = false;
    }
    return { branch: branch.trim(), hasUpstream, remote: await this.remoteName() };
  }

  async push(opts: { setUpstream: boolean; remote: string; branch: string; tags: boolean }): Promise<void> {
    if (opts.setUpstream) await run("git", ["push", "-u", opts.remote, opts.branch], { cwd: this.cwd });
    else await run("git", ["push"], { cwd: this.cwd });
    if (opts.tags) await run("git", ["push", opts.remote, "--tags"], { cwd: this.cwd });
  }
}
