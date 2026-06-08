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

  fun show(hash: String, path: String): String {
    require(hash.matches(Regex("^[0-9a-f]{7,40}$"))) { "hash non valido" }
    return rawGit(listOf("show", "-M", hash, "--", path))
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
