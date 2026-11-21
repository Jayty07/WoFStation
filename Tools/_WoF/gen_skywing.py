"""Generate placeholder quadruped SkyWing RSIs (original generic dragon shapes, grayscale for tinting).

Usage: python3 Tools/_WoF/gen_skywing.py Resources/Textures/_WoF Docs/_WoF/skywing_preview.png

Writes:
  <out>/Mobs/Species/SkyWing/parts.rsi   body, head, front_near, front_far, hind_near, hind_far, eyes, full
  <out>/Mobs/Customization/SkyWing/markings.rsi   tail, wings_bone, wings_membrane, horns
and a tinted preview PNG.
"""
import json, math, os, sys
from PIL import Image, ImageDraw, ImageChops, ImageFilter

S = 64
OUT = sys.argv[1]
PREVIEW = sys.argv[2]


# ---------- drawing helpers ----------

def blank():
    return Image.new("L", (S, S), 0)


def poly(mask, pts):
    ImageDraw.Draw(mask).polygon(pts, fill=255)


def ell(mask, box):
    ImageDraw.Draw(mask).ellipse(box, fill=255)


def thick_curve(mask, pts, w0, w1, steps=40):
    """Tapered stroke along a Catmull-Rom-ish polyline."""
    d = ImageDraw.Draw(mask)
    # simple linear interpolation along segments
    total = []
    for i in range(len(pts) - 1):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        for t in range(steps):
            u = t / steps
            total.append((x0 + (x1 - x0) * u, y0 + (y1 - y0) * u))
    total.append(pts[-1])
    n = len(total)
    for i, (x, y) in enumerate(total):
        r = (w0 + (w1 - w0) * i / max(1, n - 1)) / 2
        d.ellipse((x - r, y - r, x + r, y + r), fill=255)


def line(mask, a, b, w=1):
    ImageDraw.Draw(mask).line([a, b], fill=255, width=w)


def shade(mask, base=232, low=200, edge=78, split=0.55):
    """Grayscale fill: lighter top, darker bottom, dark 1px outline."""
    if mask.getbbox() is None:
        return Image.new("LA", (S, S), (0, 0))
    x0, y0, x1, y1 = mask.getbbox()
    cut = y0 + (y1 - y0) * split
    lum = Image.new("L", (S, S), 0)
    px, lp = mask.load(), lum.load()
    for y in range(S):
        for x in range(S):
            if px[x, y]:
                lp[x, y] = base if y < cut else low
    inner = mask.filter(ImageFilter.MinFilter(3))
    outline = ImageChops.subtract(mask, inner)
    lum.paste(edge, mask=outline)
    out = Image.merge("LA", (lum, mask))
    return out


def to_rgba(la):
    l, a = la.split()
    return Image.merge("RGBA", (l, l, l, a))


def mirror(img):
    return img.transpose(Image.FLIP_LEFT_RIGHT)


# ---------- the dragon, per direction ----------

def east():
    L = {}
    body = blank()
    ell(body, (17, 29, 43, 43))
    poly(body, [(34, 33), (40, 37), (48, 27), (44, 22)])  # neck
    L["body"] = shade(body)

    head = blank()
    ell(head, (41, 16, 52, 27))
    poly(head, [(48, 19), (58, 22), (58, 25), (48, 27)])  # snout
    L["head"] = shade(head, split=0.6)

    eyes = blank()
    eyes.putpixel((49, 20), 255)
    eyes.putpixel((50, 20), 255)
    L["eyes"] = Image.merge("LA", (eyes, eyes))

    fn = blank()
    poly(fn, [(35, 36), (41, 36), (40, 44), (42, 47), (35, 47), (36, 43)])
    L["front_near"] = shade(fn)
    ff = blank()
    poly(ff, [(32, 36), (38, 36), (37, 44), (39, 46), (32, 46), (33, 43)])
    L["front_far"] = shade(ff, base=196, low=172)

    hn = blank()
    ell(hn, (17, 32, 29, 43))
    poly(hn, [(19, 40), (26, 40), (25, 47), (18, 47)])
    L["hind_near"] = shade(hn)
    hf = blank()
    ell(hf, (21, 31, 32, 41))
    poly(hf, [(23, 39), (29, 39), (28, 46), (22, 46)])
    L["hind_far"] = shade(hf, base=196, low=172)

    tail = blank()
    thick_curve(tail, [(21, 36), (12, 37), (6, 33), (2, 27)], 7, 1)
    L["tail"] = shade(tail)

    horns = blank()
    poly(horns, [(42, 20), (34, 12), (36, 10), (39, 11), (46, 17)])
    poly(horns, [(45, 18), (39, 8), (42, 7), (44, 9), (49, 17)])
    L["horns"] = shade(horns, base=236, low=210)

    memb, bone = wing(shoulder=(32, 31), wrist=(25, 11), tip=(8, 7),
                      scallops=[(11, 17), (14, 24), (21, 28)])
    L["wings_membrane"], L["wings_bone"] = memb, bone
    return L


def wing(shoulder, wrist, tip, scallops):
    m = blank()
    poly(m, [shoulder, wrist, tip] + scallops + [(shoulder[0] - 3, shoulder[1])])
    b = blank()
    line(b, shoulder, wrist, 3)
    line(b, wrist, tip, 2)
    for p in scallops:
        line(b, wrist, p, 1)
    membrane_only = ImageChops.subtract(m, b)
    return shade(membrane_only, base=228, low=205, edge=150, split=0.7), shade(b, base=236, low=220, edge=90)


def south():
    L = {}
    body = blank()
    ell(body, (23, 28, 41, 44))
    poly(body, [(28, 22), (36, 22), (37, 31), (27, 31)])
    L["body"] = shade(body)

    head = blank()
    ell(head, (25, 11, 39, 23))
    ell(head, (28, 18, 36, 26))  # muzzle toward viewer
    L["head"] = shade(head, split=0.65)

    eyes = blank()
    for p in [(28, 17), (29, 17), (35, 17), (36, 17)]:
        eyes.putpixel(p, 255)
    L["eyes"] = Image.merge("LA", (eyes, eyes))

    fn = blank()
    poly(fn, [(24, 36), (29, 36), (29, 47), (23, 47)])
    L["front_near"] = shade(fn)
    ff = blank()
    poly(ff, [(35, 36), (40, 36), (41, 47), (35, 47)])
    L["front_far"] = shade(ff, base=214, low=190)

    hn = blank()
    poly(hn, [(20, 39), (24, 39), (24, 46), (19, 46)])
    L["hind_near"] = shade(hn, base=210, low=186)
    hf = blank()
    poly(hf, [(40, 39), (44, 39), (45, 46), (40, 46)])
    L["hind_far"] = shade(hf, base=196, low=172)

    tail = blank()
    thick_curve(tail, [(37, 41), (47, 44), (54, 41), (58, 34)], 6, 1)
    L["tail"] = shade(tail)

    horns = blank()
    poly(horns, [(26, 15), (21, 6), (23, 3), (26, 5), (31, 13)])
    poly(horns, [(38, 15), (43, 6), (41, 3), (38, 5), (33, 13)])
    L["horns"] = shade(horns, base=236, low=210)

    lm, lb = wing((28, 30), (14, 13), (3, 6), [(5, 21), (11, 28), (19, 32)])
    rm, rb = mirror(lm), mirror(lb)
    L["wings_membrane"] = Image.alpha_composite(to_rgba(lm), to_rgba(rm)).convert("LA")
    L["wings_bone"] = Image.alpha_composite(to_rgba(lb), to_rgba(rb)).convert("LA")
    return L


def north():
    L = south()
    head = blank()
    ell(head, (25, 12, 39, 24))
    L["head"] = shade(head, split=0.7)
    L["eyes"] = Image.new("LA", (S, S), (0, 0))

    fn = blank()
    poly(fn, [(41, 35), (44, 35), (44, 44), (41, 44)])
    L["front_near"] = shade(fn, base=200, low=180)
    ff = blank()
    poly(ff, [(20, 35), (23, 35), (23, 44), (20, 44)])
    L["front_far"] = shade(ff, base=190, low=170)

    hn = blank()
    poly(hn, [(36, 39), (41, 39), (42, 47), (36, 47)])
    L["hind_near"] = shade(hn)
    hf = blank()
    poly(hf, [(23, 39), (28, 39), (28, 47), (22, 47)])
    L["hind_far"] = shade(hf, base=214, low=190)

    tail = blank()
    thick_curve(tail, [(32, 42), (33, 52), (38, 57), (45, 56)], 6, 1)
    L["tail"] = shade(tail)
    # wings seen from behind: same silhouette (mirrored sides)
    L["wings_membrane"] = mirror(L["wings_membrane"])
    L["wings_bone"] = mirror(L["wings_bone"])
    return L


# ---------- assemble RSIs ----------

dirs = {"S": south(), "N": north(), "E": east()}
dirs["W"] = {k: mirror(v) for k, v in dirs["E"].items()}
ORDER = ["S", "N", "E", "W"]


def sheet(state):
    img = Image.new("RGBA", (S * 2, S * 2), (0, 0, 0, 0))
    for i, d in enumerate(ORDER):
        img.paste(to_rgba(dirs[d][state]), ((i % 2) * S, (i // 2) * S))
    return img


LICENSE = "CC-BY-SA-3.0"
COPYRIGHT = "Placeholder art made for WoF Dragon Station"


def write_rsi(path, states):
    os.makedirs(path, exist_ok=True)
    meta = {"version": 1, "license": LICENSE, "copyright": COPYRIGHT,
            "size": {"x": S, "y": S}, "states": []}
    for st in states:
        sheet(st).save(os.path.join(path, st + ".png"))
        meta["states"].append({"name": st, "directions": 4})
    return meta


parts_dir = os.path.join(OUT, "Mobs/Species/SkyWing/parts.rsi")
marks_dir = os.path.join(OUT, "Mobs/Customization/SkyWing/markings.rsi")
parts_meta = write_rsi(parts_dir, ["body", "head", "front_near", "front_far", "hind_near", "hind_far", "eyes"])
marks_meta = write_rsi(marks_dir, ["tail", "wings_bone", "wings_membrane", "horns"])

# ---------- tinted composite (icon + preview) ----------

SKIN = (200, 64, 42)
MEMBRANE = (243, 156, 18)
HORN = (212, 160, 86)
EYE = (255, 214, 64)

# draw order matches the mob's sprite layers
LAYERS = [("wings_membrane", MEMBRANE), ("wings_bone", SKIN), ("tail", SKIN), ("hind_far", SKIN),
          ("front_far", SKIN), ("body", SKIN), ("hind_near", SKIN), ("front_near", SKIN),
          ("head", SKIN), ("eyes", EYE), ("horns", HORN)]


def tint(la, rgb):
    l, a = la.split()
    chans = [l.point(lambda v, c=c: v * c // 255) for c in rgb]
    return Image.merge("RGBA", chans + [a])


def composite(d):
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    for name, rgb in LAYERS:
        img = Image.alpha_composite(img, tint(dirs[d][name], rgb))
    return img


full = composite("E")
full.save(os.path.join(parts_dir, "full.png"))
parts_meta["states"].append({"name": "full"})
for p, m in [(parts_dir, parts_meta), (marks_dir, marks_meta)]:
    with open(os.path.join(p, "meta.json"), "w") as f:
        json.dump(m, f, indent=2)

prev = Image.new("RGBA", (S * 4, S), (40, 44, 52, 255))
# one-tile grid square behind each sprite for scale reference
g = ImageDraw.Draw(prev)
for i in range(4):
    g.rectangle((i * S + 16, 16, i * S + 47, 47), outline=(70, 76, 90, 255))
for i, d in enumerate(ORDER):
    prev.alpha_composite(composite(d), (i * S, 0))
prev = prev.resize((S * 4 * 4, S * 4), Image.NEAREST)
prev.save(PREVIEW)
print("ok", parts_dir, marks_dir)
