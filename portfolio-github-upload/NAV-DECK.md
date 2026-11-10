# Card navigation (Home → Cards → Section)

Files: `nav-deck.css`, `nav-deck.js` (loaded after `site.css` / `site.js`). `site.js` no longer contains the old menu/scroll-reveal code.

**What is visible**
1. Opening screen (`#home`), sized to one viewport.
2. The card deck: opened by *Explore my work*, *EXPLORE*, scrolling down, or the hero's bottom link.
3. Sections (About, Journey, Skills, Projects, Certificates, Resume, Contact) are hidden. Each opens as a full-screen panel from its card. The page itself never scrolls; only a long panel scrolls inside itself.

**Controls**
- **Esc works everywhere, one step at a time:** zoom/lightbox -> closes it; section -> back to the cards; cards -> home. It works while typing in the contact form (your draft is kept) and is queued if pressed during a transition.
- Deck: hover/arrows to browse, click/Enter to open, Esc = home, wheel steps cards, swipe on touch (tap a side card to focus, tap again to open).
- Section: bottom bar has ← ALL CARDS, previous/next; keyboard ←/→ switch section (Journey also uses ↑/↓), Esc returns to the deck. Browser Back/Forward follow `#home`, `#cards`, `#about`...
- `prefers-reduced-motion`: no fly-out, panels switch instantly.

Tweak card size/spacing with `--deck-cw`, `--deck-ch`, `--deck-step` at the top of `nav-deck.css`.
Note: `.topbar` has `backdrop-filter`, so it is the containing block of the fixed deck; the deck is sized with `100dvh`.
