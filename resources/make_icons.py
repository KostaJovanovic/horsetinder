"""Generate Horse Tinder launcher icons from one vector design.

Writes resources/icon-foreground.svg, icon-background.svg and icon.svg (the full
composite), renders them with headless Edge, and resizes into the Android mipmaps:
  - ic_launcher.png / ic_launcher_round.png   legacy icons (Android 7.1 and older)
  - ic_launcher_foreground.png                adaptive icon foreground (Android 8+)
The adaptive background is a flat colour in values/ic_launcher_background.xml.

Run from anywhere:  python resources/make_icons.py
"""
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
RES = HERE.parent / "android" / "app" / "src" / "main" / "res"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

BG = "#7A3E1D"      # --leather
COAT = "#E0A13C"    # palomino, close to Biscuit's coat
MANE = "#F6E7C1"
INK = "#2A1E14"     # --ink
HEART = "#F6E7C1"

# Same horse head as www/app.js (drawn in a 240 x 240 box)
HEAD = ("M40 240 C45 190 55 150 75 115 C80 100 85 85 92 72 L86 38 L104 63 L112 34 L119 68 "
        "C140 78 165 105 190 140 C202 156 204 172 192 180 C180 188 162 184 150 176 "
        "C138 168 128 162 122 168 C116 190 140 215 150 240 Z")

# Adaptive icons are drawn on a 108 x 108 canvas; launchers show roughly the middle
# 72 x 72 and guarantee only the middle 66 x 66, so keep the head and heart inside it.
HORSE = f"""
  <g transform="translate(17.4 19.6) scale(0.30)">
    <path d="M92 72 C70 100 50 150 40 240 L22 240 C30 170 52 108 88 62 Z" fill="{MANE}"/>
    <path d="{HEAD}" fill="{COAT}"/>
    <!-- neck continues off the bottom so it never ends inside the visible area -->
    <path d="M22 239 L40.5 239 L37 330 L14 330 Z" fill="{MANE}"/>
    <path d="M40 239 L150 239 L165 330 L36.5 330 Z" fill="{COAT}"/>
    <path d="M124 80 C150 100 175 130 193 164 L184 174 C165 142 140 112 118 88 Z" fill="{MANE}" opacity="0.9"/>
    <path d="M104 63 C110 80 118 90 130 94 C120 82 117 74 119 68 Z" fill="{MANE}"/>
    <circle cx="138" cy="100" r="7" fill="{INK}"/>
    <circle cx="140.5" cy="97.5" r="2.2" fill="#FFFFFF"/>
    <ellipse cx="188" cy="166" rx="4.5" ry="3" transform="rotate(40 188 166)" fill="{INK}" opacity="0.7"/>
    <path d="M160 178 C168 182 178 183 186 180" stroke="{INK}" stroke-width="2.5" fill="none" opacity="0.45" stroke-linecap="round"/>
  </g>
  <path transform="translate(69 29) rotate(12) scale(0.6)"
        d="M0 6 C0 1 -7 -3 -11 1 C-15 5 -12 11 0 19 C12 11 15 5 11 1 C7 -3 0 1 0 6 Z" fill="{HEART}"/>
"""


def svg(body, view="0 0 108 108", defs=""):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" width="1024" height="1024">'
            f"{defs}{body}</svg>")


# Subtle top-left light so the flat leather doesn't look dead at small sizes
GLOW = ('<defs><radialGradient id="g" cx="0.3" cy="0.25" r="0.9">'
        '<stop offset="0" stop-color="#9A5530"/><stop offset="1" stop-color="' + BG + '"/>'
        "</radialGradient></defs>")
BACKGROUND = '<rect width="108" height="108" fill="url(#g)"/>'

SOURCES = {
    "icon-foreground.svg": svg(HORSE),
    "icon-background.svg": svg(BACKGROUND, defs=GLOW),
    # Full icon, cropped to the visible 72 x 72 area, for the legacy PNGs
    "icon.svg": svg(BACKGROUND + HORSE, view="18 18 72 72", defs=GLOW),
}


def render(svg_path, png_path):
    subprocess.run([EDGE, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                    "--default-background-color=00000000", "--window-size=1024,1024",
                    f"--screenshot={png_path}", svg_path.as_uri()],
                   check=True, capture_output=True)
    return Image.open(png_path).convert("RGBA")


def mask(img, shape):
    """Bake the launcher shape into a legacy icon (pre-Android 8 launchers don't mask)."""
    size = img.size[0]
    m = Image.new("L", (size * 4, size * 4), 0)
    d = ImageDraw.Draw(m)
    if shape == "round":
        d.ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
    else:
        d.rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=size * 4 * 0.22, fill=255)
    out = img.copy()
    out.putalpha(m.resize(img.size, Image.LANCZOS))
    return out


def main():
    for name, text in SOURCES.items():
        (HERE / name).write_text(text, encoding="utf-8")

    with tempfile.TemporaryDirectory() as tmp:
        full = render(HERE / "icon.svg", Path(tmp) / "full.png")
        fg = render(HERE / "icon-foreground.svg", Path(tmp) / "fg.png")

    full.save(HERE / "icon-1024.png")
    densities = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
    for dens, k in densities.items():
        folder = RES / f"mipmap-{dens}"
        legacy = full.resize((round(48 * k),) * 2, Image.LANCZOS)
        mask(legacy, "square").save(folder / "ic_launcher.png", optimize=True)
        mask(legacy, "round").save(folder / "ic_launcher_round.png", optimize=True)
        fg.resize((round(108 * k),) * 2, Image.LANCZOS).save(folder / "ic_launcher_foreground.png", optimize=True)

    print("icons written to", RES)


if __name__ == "__main__":
    main()
