#!/bin/bash
# Removes Grante Helper. Your files aren't touched.
# Run it by pasting this into Terminal:
#   curl -fsSL https://grante-ai.github.io/uninstall.sh | bash

main() {
  local LABEL="io.github.grante-ai.helper"
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
  rm -rf "$HOME/.grante"
  echo "✅ Grante Helper is removed. Your files weren't touched."
  echo "   Grante still works in Chrome with folders you pick."
}

main "$@"
