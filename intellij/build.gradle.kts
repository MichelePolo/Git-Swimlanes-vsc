plugins {
  kotlin("jvm") version "1.9.25"
  id("org.jetbrains.intellij.platform") version "2.1.0"
}

group = "io.github.michelepolo"
version = "0.0.0"

repositories {
  mavenCentral()
  intellijPlatform {
    defaultRepositories()
    intellijDependencies()
  }
}

dependencies {
  intellijPlatform {
    intellijIdeaCommunity("2024.1")
    bundledPlugin("Git4Idea")
    instrumentationTools()
    testFramework(org.jetbrains.intellij.platform.gradle.TestFrameworkType.Platform)
  }
  testImplementation("junit:junit:4.13.2")
}

kotlin {
  jvmToolchain(17)
}

// Compatibility range for the built plugin. We compile against the 2024.1 (241) baseline but
// only use long-lived platform APIs (ToolWindow, JBCef, git4idea), so rely on JetBrains'
// forward-compatibility and drop the upper bound — the plugin then installs on 2024.1 and every
// later release (2025.x, 2026.x, …) without rebuilding. Without this, buildPlugin pins
// until-build to "241.*" and newer IDEs reject the plugin as incompatible.
intellijPlatform {
  pluginConfiguration {
    ideaVersion {
      sinceBuild = "241"
      untilBuild = provider { null }
    }
  }
}

tasks.test {
  useJUnit()
}
