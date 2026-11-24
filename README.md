[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/muhamadlangg71-prog/neon-bay-rebuild/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/muhamadlangg71-prog/neon-bay-rebuild/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Neon Bay

Neon Bay is an original open-world crime game for the make.fun "Make GTA 6" bounty: a sun-soaked coastal city you explore on foot and by car, with traffic and pedestrians, cars to steal, a five-star wanted system with police pursuit, five story missions, combat, a HUD with a live minimap, and a save that persists in your browser. Everything — the city, the crew, the cars, the story — is invented for this game.

## Play it

Serve the `game/` folder with any static file server and open `index.html` in desktop Chrome:

```sh
npx serve game
# or
python3 -m http.server --directory game 8000
```

No build step, no network requests: the game loads Three.js vendored under `game/vendor/`.

## Controls

- **WASD** move · **Shift** run · **Space** jump · **Mouse** look (click to lock, drag to orbit)
- **Left click** shoot · **E** enter / steal a car, **E** again to get out
- **W/S + A/D** drive · **Esc** pause · **M** mute

## The game

You are Rex, getaway driver for Marla Vane's Bay crew. Run five jobs across Neon Bay — steal wheels, deliver a package to the docks, tail a rival courier, shake the heat at the safehouse, and make the final getaway north — while the wanted level climbs from one star to five and the Neon Bay PD sends cars and officers after you. Commit crimes and the heat rises; lay low and it cools off. Money earned from jobs shows in the HUD, and the minimap tracks you, traffic, police and the yellow mission beacon.

## Structure

- `game/index.html` — the page, HUD and menus
- `game/main.js` — bootstrap, game loop, shooting, wanted level, save/load
- `game/city.js` — the procedural city: roads, buildings, beach and bay
- `game/vehicles.js` — car meshes, NPC traffic, police pursuit
- `game/player.js` — on-foot movement, driving, camera
- `game/missions.js` — the five story missions
- `game/hud.js` — HUD and minimap
- `game/audio.js` — synthesized sound (no audio files)
- `main.ts` — the entry program: copies `game/` and `screenshots/` to `/output` and writes `dossier.json`

Built with Three.js, vendored as `game/vendor/three.module.min.js`.

## License

MIT — see [LICENSE](LICENSE).

---

Optional: earn referral rewards, a second way to make money — [join make.fun with my referral link](https://make.fun/r/sz08m7rk).
