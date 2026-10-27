# 02: Multi-Platform Token Compilation Pipeline (SCSS, Compose, Swift)

**What to build:** An expanded token compilation pipeline capable of producing production-ready design tokens across web preprocessors (SCSS) and native mobile platforms (Android Jetpack Compose and iOS SwiftUI), so that non-web applications can consume design tokens directly without custom conversions.

**Blocked by:** 01: Prefactoring and Gate Sensor Rectification

**Status:** ready-for-agent

- [ ] The token engine compiles design tokens into a standardized SCSS output file containing flat `$color-*` variables and a structured `$tokens` map.
- [ ] The token engine compiles design tokens into an idiomatic Kotlin object file (`Color.kt`) using `androidx.compose.ui.graphics.Color` constructors, supporting primitive and semantic color scales.
- [ ] The token engine compiles design tokens into an idiomatic Swift extension file (`ColorAsset.swift`) extending `SwiftUI.Color` with static properties matching token definitions.
- [ ] The token package build script generates SCSS, Compose Kotlin, and Swift artifacts into dedicated distribution directories alongside existing CSS and Tailwind artifacts.
- [ ] Automated unit and snapshot tests verify that all exported multi-platform tokens parse cleanly and accurately match source DTCG color and dimension values.
