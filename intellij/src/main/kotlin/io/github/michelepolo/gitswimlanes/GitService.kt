package io.github.michelepolo.gitswimlanes

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.util.ExecUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import git4idea.repo.GitRepositoryManager

/**
 * Reads git log/show. Uses GeneralCommandLine (not git4idea's GitLineHandler) so that
 * the top-level `-c core.quotepath=false` option can be passed before the subcommand —
 * see git-swimlanes-intellij-spec.md §5 / §11.
 */
class GitService(private val project: Project) {

  private var currentRoot: String? = null

  /** Switch which repository (by root path) is read (multi-repo projects). */
  fun setRepo(root: String) {
    currentRoot = root
  }

  /** (rootPath, label) for every Git repository in the project. */
  fun repos(): List<Pair<String, String>> =
    GitRepositoryManager.getInstance(project).repositories.map { it.root.path to it.root.name }

  /** The VirtualFile of the currently selected repo root (for opening files). */
  fun currentRepoRoot(): VirtualFile? {
    val mgr = GitRepositoryManager.getInstance(project)
    return currentRoot?.let { p -> mgr.repositories.firstOrNull { it.root.path == p }?.root }
      ?: mgr.repositories.firstOrNull()?.root
  }

  fun currentRootPath(): String = repoRoot()

  private fun repoRoot(): String =
    currentRepoRoot()?.path
      ?: project.basePath
      ?: throw IllegalStateException("Nessun repository Git nel progetto")

  fun log(): String = rawGit(
    listOf(
      "-c", "core.quotepath=false", "--no-pager", "log",
      "--all", "--date-order", "--name-status",
      "--pretty=format:%H|%P|%D|%an|%ad|%s", "--date=short",
    ),
  )

  fun show(hash: String, path: String, oldPath: String? = null): String {
    require(hash.matches(Regex("^[0-9a-f]{7,40}$"))) { "hash non valido" }
    // For renames, pass both paths after `--` so the rename hunk renders (spec §5.3).
    val paths = if (oldPath != null) listOf(oldPath, path) else listOf(path)
    return rawGit(listOf("show", "-M", hash, "--") + paths)
  }

  fun fetch() {
    rawGit(listOf("fetch", "--all", "--prune"))
  }

  fun pull() {
    rawGit(listOf("pull", "--ff"))
  }

  fun status(): String = rawGit(listOf("-c", "core.quotepath=false", "status", "--porcelain"))

  fun createBranch(name: String, hash: String) {
    rawGit(listOf("branch", name, hash))
  }

  fun createTag(name: String, hash: String) {
    rawGit(listOf("tag", name, hash))
  }

  fun deleteBranch(name: String) {
    rawGit(listOf("branch", "-d", name))
  }

  fun deleteTag(name: String) {
    rawGit(listOf("tag", "-d", name))
  }

  fun switchRef(target: String, detach: Boolean) {
    rawGit(if (detach) listOf("switch", "--detach", target) else listOf("switch", target))
  }

  data class BranchInfo(val branch: String, val hasUpstream: Boolean, val remote: String)

  fun currentBranchInfo(): BranchInfo {
    val branch = rawGit(listOf("rev-parse", "--abbrev-ref", "HEAD")).trim()
    val hasUpstream = try {
      rawGit(listOf("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")); true
    } catch (e: Exception) {
      false
    }
    return BranchInfo(branch, hasUpstream, remoteName())
  }

  fun push(setUpstream: Boolean, remote: String, branch: String, tags: Boolean) {
    if (setUpstream) rawGit(listOf("push", "-u", remote, branch)) else rawGit(listOf("push"))
    if (tags) rawGit(listOf("push", remote, "--tags"))
  }

  /** Fetch the forge's PR/MR refs so they appear as lanes (spec §7.2). Uses git's creds. */
  fun fetchPullRefs() {
    val remote = remoteName()
    val url = rawGit(listOf("remote", "get-url", remote)).trim()
    val refspec = pullRefspecFor(url) ?: throw IllegalStateException("Forge non riconosciuta dal remote: $url")
    rawGit(listOf("fetch", remote, refspec))
  }

  private fun remoteName(): String {
    val remotes = rawGit(listOf("remote")).split("\n").map { it.trim() }.filter { it.isNotEmpty() }
    if (remotes.isEmpty()) throw IllegalStateException("Nessun remote configurato")
    return if (remotes.contains("origin")) "origin" else remotes.first()
  }

  /** Mirrors engine src/forge.ts (cross-language boundary). */
  private fun pullRefspecFor(remoteUrl: String): String? {
    val u = remoteUrl.lowercase()
    return when {
      u.contains("github.com") -> "+refs/pull/*/head:refs/remotes/origin/pr/*"
      u.contains("dev.azure.com") || u.contains("visualstudio.com") -> "+refs/pull/*/merge:refs/remotes/origin/pr/*"
      u.contains("gitlab") -> "+refs/merge-requests/*/head:refs/remotes/origin/mr/*"
      u.contains("bitbucket.org") -> "+refs/pull-requests/*/from:refs/remotes/origin/pr/*"
      else -> null
    }
  }

  private fun rawGit(args: List<String>): String {
    val cmd = GeneralCommandLine(listOf("git") + args)
      .withWorkDirectory(repoRoot())
      .withCharset(Charsets.UTF_8)
    val out = ExecUtil.execAndGetOutput(cmd)
    if (out.exitCode != 0) {
      throw IllegalStateException(out.stderr.ifBlank { "git è uscito con codice ${out.exitCode}" })
    }
    return out.stdout
  }
}
