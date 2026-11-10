# Neon Duel — Canvas Survival Shooter

A neon twin-stick-style survival shooter in plain HTML/CSS/JS. Dodge waves, chain combos, grab powers. Installable PWA.

## Features

- Wave-based enemies, combos, powers, hearts + score HUD
- Menu / pause / game-over overlays, best score in `localStorage`
- Touch + keyboard + mouse input, responsive canvas
- PWA manifest + icon, QR helper for phone testing over LAN

## Run it

```bash
./serve.sh            # serves game/ on :8000, prints LAN URL + QR
# or
python3 -m http.server 8000
# then visit http://127.0.0.1:8000/game/
```

## Structure

| Path | What it is |
| --- | --- |
| `game/index.html` | Shell + HUD + overlays |
| `game/game.js` | Game loop, enemies, waves, input |
| `game/style.css` | Neon theme |
| `game/manifest.webmanifest` + `icon.svg` | PWA install |
| `serve.sh` | LAN server + QR printer |
