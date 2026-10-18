#!/bin/bash
# Grante Helper installer (for Macs).
#
# Run it by pasting this into Terminal:
#   curl -fsSL https://grante-ai.github.io/install.sh | bash
#
# What it does, and nothing else:
#   1. Downloads Grante Helper into a hidden folder in your home folder (~/.grante).
#   2. Checks the download is exactly the file Grante published.
#   3. Sets it to start by itself when you log in, so you never have to do this again.
# It doesn't need your password, and it can't delete anything.
# To remove it later:  curl -fsSL https://grante-ai.github.io/uninstall.sh | bash

main() {
  set -euo pipefail
  local SITE="https://grante-ai.github.io"
  local DIR="$HOME/.grante"
  local LABEL="io.github.grante-ai.helper"
  local AGENTS="$HOME/Library/LaunchAgents"
  local PLIST="$AGENTS/$LABEL.plist"

  if [ "$(uname -s)" != "Darwin" ]; then
    echo "Grante Helper is for Macs. On other computers, Grante uses the folders you pick in Chrome."
    exit 1
  fi
  local ARCH SUM
  case "$(uname -m)" in
    arm64)  ARCH="arm64"; SUM="b8742d9ffc808007069a0d479ddfa058a4adec0ea29a782242034f6421115116" ;;
    x86_64) ARCH="amd64"; SUM="0ad8c926c95e75d65ba31f8746f856fe7748e26476e5f141eab80e81b94a173b" ;;
    *) echo "Sorry, this Mac isn't supported."; exit 1 ;;
  esac

  echo "Installing Grante Helper..."
  mkdir -p "$DIR" "$AGENTS"
  local TMP
  TMP="$(mktemp "$DIR/download.XXXXXX")"
  if ! curl -fsSL "$SITE/helper/grante-helper-mac-$ARCH.bin" -o "$TMP"; then
    rm -f "$TMP"; echo "Couldn't download Grante Helper. Check your internet and try again."; exit 1
  fi
  if [ "$(shasum -a 256 "$TMP" | cut -d' ' -f1)" != "$SUM" ]; then
    rm -f "$TMP"; echo "The download didn't match what Grante published, so it wasn't installed. Try again in a few minutes."; exit 1
  fi
  chmod 755 "$TMP"

  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true   # stop an older copy, if any
  mv -f "$TMP" "$DIR/grante-helper"

  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$DIR/grante-helper</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardErrorPath</key><string>$DIR/helper-errors.log</string>
</dict>
</plist>
EOF
  launchctl bootstrap "gui/$(id -u)" "$PLIST"

  local i
  for i in 1 2 3 4 5 6; do
    if curl -fs -H "Origin: $SITE" "http://127.0.0.1:47823/hello" >/dev/null 2>&1; then
      echo ""
      echo "✅ Grante Helper is installed and running."
      echo "   Go back to Grante in Chrome. It'll find the helper by itself."
      echo "   (You can close this window.)"
      exit 0
    fi
    sleep 1
  done
  echo "Grante Helper was installed but didn't start. Restart your Mac, or tell the person who sent you Grante."
  exit 1
}

main "$@"
