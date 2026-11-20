# RADIKDOLLAR — official site

Single-page artist site for **Radikdollar (RADIK$)**. Static HTML/CSS/JS — no build
step, no framework, no third-party requests until a visitor presses *Play film*.

## Run locally

You can open `index.html` directly in a browser or serve it over HTTP:

```sh
cd radikdollar
python3 -m http.server 8080
# → http://localhost:8080
```

## Structure

```
index.html                 markup, SEO/OG tags, JSON-LD
site.webmanifest           PWA / home-screen metadata
assets/css/main.css        all styles (responsive desktop + mobile + 3D scenes)
assets/js/main.js          self-contained runtime (3D gyroscope, 3D tilt, CD case,
                           floating 3D preview, WebGL shader, marquee, nav, copy)
assets/img/                covers, artist photos, icons, og.jpg
assets/fonts/              self-hosted variable fonts (OFL — see LICENSE.md)
```
