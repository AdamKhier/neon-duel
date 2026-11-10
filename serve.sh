#!/usr/bin/env bash
set -u
PORT="${1:-8000}"
DIR="$(cd "$(dirname "$0")" && pwd)"
OPEN="${2:-}"

echo ""
echo "  ---------------------------------------------------------"
echo "   NEON DUEL"
echo "  ---------------------------------------------------------"
echo ""

URL="http://localhost:$PORT/game/"
IP=""
if command -v hostname >/dev/null 2>&1 && hostname -I 2>/dev/null | awk '{print $1}' >/dev/null 2>&1; then
  IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
fi
if [ -z "$IP" ] && command -v ip >/dev/null 2>&1; then
  IP="$(ip route get 1 2>/dev/null | grep -oP 'src \K[0-9.]+' | head -1)"
fi
if [ -n "$IP" ]; then
  URL="http://$IP:$PORT/game/"
fi

echo "   LAPTOP (this machine):      $URL"
echo "   PHONE (same WiFi):          scan the QR below"
echo ""
if command -v qrencode >/dev/null 2>&1; then
  qrencode -t ANSIUTF8 -o - "$URL" 2>/dev/null || qrencode -t UTF8 -o - "$URL" 2>/dev/null || true
else
  echo "   (install qrencode to get a scannable QR: sudo pacman -S qrencode)"
fi
echo ""
echo "   Phone won't connect? Check both devices are on the same"
echo "   network, then open the URL above manually in Chrome."
echo "  ---------------------------------------------------------"
echo ""
echo "   Serving from: $DIR"
echo "   Press Ctrl+C to stop."
echo ""

if [ "$OPEN" = "--open" ]; then
  xdg-open "http://localhost:$PORT/game/" >/dev/null 2>&1 || true
fi

exec python3 -m http.server "$PORT" --bind 0.0.0.0 --directory "$DIR"