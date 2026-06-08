import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);

const LOG_ARGS = [
  "-c", "core.quotepath=false", "--no-pager", "log",
  "--all", "--date-order", "--name-status",
  "--pretty=format:%H|%P|%D|%an|%ad|%s", "--date=short",
];

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

  async show(hash: string, path: string): Promise<string> {
    if (!/^[0-9a-f]{7,40}$/.test(hash)) throw new Error("invalid hash");
    const { stdout } = await run("git", ["show", "-M", hash, "--", path], {
      cwd: this.cwd, maxBuffer: 32 * 1024 * 1024,
    });
    return stdout;
  }
}
