package io.github.michelepolo.gitswimlanes

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project

/** Per-repo pin/hide view config, persisted in the project's workspace file. */
@Service(Service.Level.PROJECT)
@State(name = "GitSwimlanesViewConfig", storages = [Storage("gitSwimlanesViewConfig.xml")])
class ViewConfigStore : PersistentStateComponent<ViewConfigStore.State> {
  class Entry {
    var pinned: MutableList<String> = mutableListOf()
    var hidden: MutableList<String> = mutableListOf()
  }

  class State {
    var byRepo: MutableMap<String, Entry> = mutableMapOf()
  }

  private var state = State()

  override fun getState(): State = state

  override fun loadState(s: State) {
    state = s
  }

  /** Returns (pinned, hidden) for a repo root. */
  fun load(repoRoot: String): Pair<List<String>, List<String>> {
    val e = state.byRepo[repoRoot] ?: return emptyList<String>() to emptyList()
    return e.pinned.toList() to e.hidden.toList()
  }

  fun save(repoRoot: String, pinned: List<String>, hidden: List<String>) {
    state.byRepo[repoRoot] = Entry().apply {
      this.pinned = pinned.toMutableList()
      this.hidden = hidden.toMutableList()
    }
  }

  companion object {
    fun of(project: Project): ViewConfigStore = project.service()
  }
}
