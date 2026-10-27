---
name: Meridian (broken revision)
description: Fixture used by the CLI's negative control. This file is deliberately invalid.
colors:
  primary: "#1A5FD0"
typography:
  body-md:
    fontFamily: Inter
    fontSize: 1rem
rounded:
  md: 8px
spacing:
  md: 16px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.does-not-exist}"
    rounded: "{rounded.lol}"
---

## Colors

A broken revision: it references `{colors.does-not-exist}` and `{rounded.lol}`, and declares a
text colour that no token backs. Used to prove `@google/design.md lint` reports errors rather
than silently passing.
