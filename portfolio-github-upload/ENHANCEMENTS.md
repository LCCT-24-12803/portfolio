# Portfolio interaction update

## Added
- Animated orbital core, subtle hero parallax, cursor-follow glow, scroll progress indicator, animated button sheen, and scroll reveals.
- Project carousel with autoplay, pause-on-hover/focus, previous/next controls, pagination dots, keyboard-accessible buttons, and project links.
- Added the supplied live QBOMS and BSIT-LCCT website URLs to their project entries.
- Contact quick-message form prepares an email in the visitor's default mail application using `mailto:`. The visitor reviews and sends it there; no email is sent automatically and no server-side email credentials are embedded in the public site.
- Added a "Back to my profile" link in Contact. LinkedIn and GitHub open in new tabs.

## Live project links
- QBOMS: https://qboms.infinityfree.io/
- BSIT-LCCT: https://bsit-lcct.wuaze.com/?i=1

Automated web fetching of both hosts returned HTTP 403 in this environment, likely due to host-side request filtering. The portfolio uses the exact user-provided HTTPS URLs and opens them in a new tab. Please verify from a normal browser/network before publishing.

## Verification
- `site.js` passes `node --check`.
- `content.json` parses as valid JSON.
- ZIP integrity check passes after packaging.
- Browser screenshot verification could not be completed in this environment.
