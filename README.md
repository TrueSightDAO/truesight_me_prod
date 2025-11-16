## TrueSight DAO Landing Page

This repository now ships a lightweight, hand-crafted landing page that mirrors the public content currently live on
[truesight.me](https://truesight.me). The page focuses on the DAO's mission, transparent ecosystem statistics, community
initiatives, and the community-governed workflow.

### Design direction

- Foundation uses **Earthen Sand** `#F7F1E8` and **Weathered Clay** `#ECE2D1` for a natural, monk-inspired calm.
- Primary accent remains **Saffron Monk** `#F4A300`, paired with **Deep Saffron** `#D38900` and **Honey Husk** `#F6C86D`.
- Supporting tones: **Forest Canopy** `#5F6F52` for structure and **Amazon Clay** `#C08457` for warmth.
- The site avoids black entirely, leaning on soft beige gradients and saffron blooms reminiscent of monastery lantern light.
- Every component—stat cards, pills, CTAs, and section borders—reuses these tones to keep the nature-first palette consistent.

### What's inside

- `index.html` — semantic HTML describing the hero, stats, initiatives, and governance flow.
- `styles/main.css` — minimal, responsive styling with a dark theme inspired by the original Wix layout.

### Local preview

No build step is required. Open `index.html` in any modern browser, or serve the directory locally:

```sh
cd /Users/garyjob/Applications/truesight_me
python3 -m http.server 8080
```

Visit `http://localhost:8080` to preview the landing page.

### Updating stats or copy

All content lives directly inside `index.html`. Update the relevant sections under **Ecosystem statistics** or the cards
inside **Community Initiatives** as new data becomes available. If the design needs to evolve, adjust the CSS variables
at the top of `styles/main.css` for consistent theming.

