package io.github.michelepolo.gitswimlanes

import com.intellij.openapi.project.Project

/** Reads git log/show via git4idea. See git-swimlanes-intellij-spec.md §5. */
class GitService(private val project: Project) {

  fun log(): String {
    // TODO (spec §5): GitLineHandler(LOG) with --all --name-status pretty=format...
    throw NotImplementedError("GitService.log — see spec §5")
  }

  fun show(hash: String, path: String): String {
    require(hash.matches(Regex("^[0-9a-f]{7,40}$"))) { "invalid hash" }
    // TODO (spec §5): GitLineHandler(SHOW) with -M <hash> -- <path>.
    throw NotImplementedError("GitService.show — see spec §5")
  }
}
