plugins {
  kotlin("jvm") version "1.9.25"
  id("org.jetbrains.intellij.platform") version "2.1.0"
}

group = "io.github.michelepolo"
version = "0.0.0"

repositories {
  mavenCentral()
  intellijPlatform { defaultRepositories() }
}

dependencies {
  intellijPlatform {
    intellijIdeaCommunity("2024.1")
    bundledPlugin("Git4Idea")
  }
}

kotlin {
  jvmToolchain(17)
}
