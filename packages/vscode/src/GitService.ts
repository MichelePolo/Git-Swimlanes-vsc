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

  private async remoteName(): Promise<string> {
    const { stdout } = await run("git", ["remote"], { cwd: this.cwd });
    const remotes = stdout.split("\n").map((s) => s.trim()).filter(Boolean);
    if (remotes.length === 0) throw new Error("Nessun remote configurato");
    return remotes.includes("origin") ? "origin" : remotes[0];
  }

  async show(hash: string, path: string): Promise<string> {
    if (!/^[0-9a-f]{7,40}$/.test(hash)) throw new Error("invalid hash");
    const { stdout } = await run("git", ["show", "-M", hash, "--", path], {
      cwd: this.cwd, maxBuffer: 32 * 1024 * 1024,
    });
    return stdout;
  }
}
