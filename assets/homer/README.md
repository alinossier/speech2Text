# Mishonin Transcript Desk icon

`mishonin-transcript-desk.svg` is a transparent, standalone icon for a Homer service tile. It preserves the app's `FileAudio` header mark and adapts automatically to the browser's light or dark color scheme.

Copy the SVG into the directory served by Homer, then reference its served path in the service's `icon` setting. For example:

```yaml
icon: /assets/icons/mishonin-transcript-desk.svg
```

The icon defaults to the app's brand green (`#16715d`) in light mode and switches to mint (`#8fe0bf`) when the viewer prefers dark mode. If the dashboard/browser does not apply SVG color-scheme media rules, the light-mode green is used.
