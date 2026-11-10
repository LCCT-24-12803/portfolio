# Recovered Cybernetic Arcade project

This package starts from the supplied Phase 2 project ZIP. The original Phase 2 world page was preserved as `arcade/world.html` and the reconstructed introduction is now `arcade/index.html`.

## What is included
- Phase 1 environment and Phase 2 digital core from the supplied Phase 2 ZIP.
- Reconstructed Phase 3A introduction screen in `arcade/index.html`, `arcade/intro.css`, and `arcade/intro.js`.
- Phase 3B entry routing: `/arcade/` opens the intro; both intro actions lead to `world.html`.
- Original root portfolio, `content.json`, assets, and `admin/` folder preserved from the supplied ZIP.

## Preview
From the folder containing the root `index.html` run:

    python3 -m http.server 8080

Open:
- `http://localhost:8080/arcade/` — introduction
- `http://localhost:8080/arcade/world.html` — 3D world directly

## Recovery note
The original Phase 3A/3B source files were not available in the uploaded Phase 2 ZIP. The intro files in this package have therefore been reconstructed from the user's exact introduction text and the Phase 3A/3B build reports. They are not claimed to be byte-identical to Claude's previous implementation. The Phase 2 world file was copied without editing.

## Phase 4B — Projects station (station 1)
- `arcade/projects-station.js`: in-scene holographic console (hex emitter pedestal, projection beam, curved chamfered holo-panel with ghost layer and scale ruler). Wired into `arcade-environment.js` (`env.station`) and `main.js`.
- Content comes from `../content.json` → `projects[]`: title, description and stack are shown verbatim. An image block appears only if the project has `img`/`imgs` that load; the "Open project" button only if `link` is a valid http(s) address. Nothing is invented.
- Interaction: hover/click the footer tabs and arrows on the panel, or press ← / →. A visually hidden list mirrors the content for screen readers.
- Landscape: panel stands left of the core. Portrait/phones: full-width panel floats above the core (no pedestal).
- Switches: `?station=0` hides it. Reduced motion renders a still frame that still responds to clicks.

## Phase 5C — Projects portal + chamber
- Frame 2 of the existing frame corridor (z = −17) is the **Projects portal**: a dormant outline + "PROJECTS ›" label in the hub, a membrane that charges and expands on activation. The floating panel no longer sits beside the core.
- The **Projects chamber** lies past the corridor's last frame at z ≈ −80 (back frame, nave monoliths, hex floor inlay, two lights). The Projects station is centred there and is the primary focus.
- Enter: HUD "Projects", key `4`, or click / tap the portal opening. The core reacts (burst + engaged), the camera turns to the portal, swings around the core, lines up on the corridor axis, flies through the membrane and down the corridor (frames flare as they pass) and settles in front of the panel.
- Return: "Back to core" or `Esc` plays the exact reverse (everything is a function of one progress value `dock.k`); it can be reversed mid-flight. No cut.
- Reduced motion: snaps between the hub and the chamber. ←/→ switch projects only while in the chamber.
- Files: `projects-portal.js` (new), `arcade-environment.js`, `projects-station.js`, `main.js`, `world.html`, `README.md`.
