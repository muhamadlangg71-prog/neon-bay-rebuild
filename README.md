[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/muhamadlangg71-prog/neon-bay-rebuild/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/muhamadlangg71-prog/neon-bay-rebuild/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Neon Bay

A complete open-world crime game that runs entirely in your desktop browser
from static files — no install, no network, no server-side code. You arrive in
Neon Bay, a sun-soaked fictional coastal city of glass towers, neon rooftops
and palm-lined boulevards, with empty pockets and a long list of jobs. Steal
cars, outrun the Bay Police, climb the wanted ladder, and work through five
story missions for Ray Delgado, the fixer who runs the docks — from boosting
your first ride to a final midnight getaway up the north gate.

Everything in the game is original: the city, the characters, the story, the
art and the synthesized sound. It is built with Three.js (vendored) and plain
JavaScript modules.

## How to play

Serve the `game/` folder with any static file server, then open
`index.html` in desktop Chrome (or any modern browser):

```bash
cd game
python3 -m http.server 8080
# open http://localhost:8080/index.html
```

From the main menu choose **New Game** to start fresh, or **Continue** to
pick up your saved progress (the game autosaves every 15 seconds and after
every completed mission). Your progress lives in the browser's local storage.

## Controls

| Key | Action |
| --- | --- |
| W / A / S / D or arrows | Walk / drive |
| Shift | Sprint on foot |
| Space | Jump (on foot) |
| E | Get in / out of the nearest car (steal it!) |
| Mouse drag / click | Look around (click locks the pointer); left click shoots while on foot |
| M | Mute / unmute sound |
| Esc | Pause |

Stealing a car raises your wanted level: +1 for a civilian's car, +2 for a
police cruiser. Run over a pedestrian and the heat climbs even faster. Lay low
— stay out of trouble for 20 seconds and the stars start to drop. Wanted
level 3 or higher means the Bay Police will chase you down and try to bust
you; if your health hits zero while wanted, it's BUSTED, otherwise WASTED.

## Missions

1. **Hot Wheels** — steal any car and bring it to the garage ($250)
2. **Bay Runner** — deliver the package to the docks in 90 seconds ($500)
3. **Tail Job** — shadow the gold sedan, stay within 15 m for 6 seconds ($600)
4. **Heat Wave** — lose the heat: cool your wanted level to zero at the safehouse ($500)
5. **Neon Getaway** — reach the north gate and disappear ($1000)

## Structure

```
main.ts                  entry program: copies game/ + screenshots/ to /output
                         and writes dossier.json (make.fun program/v1)
vendor/makefun-game.ts   make.fun dossier library (kit copy, unchanged)
game/
  index.html             page shell: HUD, menus, import map for three.js
  style.css              HUD + menu styling
  main.js                game loop: state, input, shooting, wanted, save/load
  city.js                procedural Neon Bay: roads, towers, beach, collisions
  vehicles.js            cars, traffic AI, police AI
  player.js              on-foot and driving movement, camera
  missions.js            the five story missions + beacon
  hud.js                 health, money, wanted stars, minimap
  audio.js               synthesized WebAudio: engine, sirens, shots
  vendor/three.module.min.js   three.js 0.160.0 (vendored)
screenshots/             four in-game screenshots
```

## License

MIT — see [LICENSE](LICENSE).

---

Optional: earn referral rewards, a second way to make money — [join make.fun with my referral link](https://make.fun/r/sz08m7rk).
