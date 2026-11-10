# Portfolio redesign implementation

The root `index.html` is now the primary portfolio homepage. It no longer redirects to the legacy Arcade. The page uses the existing `content.json`, profile image, certificates, and resume. LinkedIn and GitHub are rendered only in the Contact section.

Run locally from this folder: `python -m http.server 8000`, then open `http://localhost:8000/`. Do not open `/arcade/`; that path now redirects to the root homepage.

The old Arcade source files are retained as a backup/reference, but are not the primary homepage.
