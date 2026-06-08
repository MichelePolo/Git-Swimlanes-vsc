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

tasks.test {
  useJUnit()
}
