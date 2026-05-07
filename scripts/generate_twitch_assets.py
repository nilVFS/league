from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path("/Users/vladislavnizev/Documents/lg")
OUT_DIR = ROOT / "docs" / "twitch-assets"


def font(size, bold=False):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial Bold.ttf" if bold else "/Library/Fonts/Arial.ttf",
    ]

    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size=size)

    return ImageFont.load_default()


PALETTE = {
    "bg_top": (18, 12, 7),
    "bg_bottom": (9, 6, 3),
    "surface": (44, 30, 18, 190),
    "surface_soft": (60, 40, 22, 160),
    "line": (200, 166, 108, 70),
    "gold": (200, 166, 108),
    "gold_bright": (251, 242, 223),
    "bronze": (143, 106, 58),
    "text": (242, 230, 202),
    "muted": (194, 168, 124),
}


def vertical_gradient(size):
    width, height = size
    image = Image.new("RGBA", size)
    px = image.load()
    for y in range(height):
        ratio = y / max(height - 1, 1)
        color = tuple(
            int(PALETTE["bg_top"][i] * (1 - ratio) + PALETTE["bg_bottom"][i] * ratio)
            for i in range(3)
        )
        for x in range(width):
            px[x, y] = color + (255,)
    return image


def add_glow(base, box, color, blur=80, opacity=140):
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.ellipse(box, fill=color + (opacity,))
    overlay = overlay.filter(ImageFilter.GaussianBlur(blur))
    base.alpha_composite(overlay)


def rounded_panel(draw, xy, radius, fill, outline):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=1)


def make_icon():
    img = vertical_gradient((24, 24))
    add_glow(img, (-4, -4, 18, 18), PALETTE["bronze"], blur=8, opacity=120)
    draw = ImageDraw.Draw(img)
    rounded_panel(draw, (1, 1, 23, 23), 6, (36, 24, 14, 255), PALETTE["line"])
    draw.text((7, 4), "L", font=font(14, bold=True), fill=PALETTE["gold_bright"])
    draw.line((6, 17, 18, 17), fill=PALETTE["gold"], width=2)
    return img


def make_recommendation():
    size = (300, 200)
    img = vertical_gradient(size)
    add_glow(img, (110, -30, 250, 110), PALETTE["bronze"], blur=42, opacity=130)
    draw = ImageDraw.Draw(img)
    rounded_panel(draw, (12, 12, 288, 188), 18, PALETTE["surface"], PALETTE["line"])
    draw.text((28, 28), "HATE OF THE VAAL", font=font(18, bold=True), fill=PALETTE["muted"])
    draw.text((28, 62), "Ladder", font=font(38, bold=True), fill=PALETTE["text"])
    draw.text((30, 125), "Top players and score tracking", font=font(16), fill=PALETTE["muted"])
    draw.rounded_rectangle((215, 40, 260, 85), radius=12, fill=(226, 205, 161, 255))
    draw.text((231, 50), "1", font=font(24, bold=True), fill=(36, 23, 13))
    return img


def draw_leaderboard_card(draw, x, y, width, rank, name, stats):
    rounded_panel(
        draw,
        (x, y, x + width, y + 86),
        22,
        (33, 22, 12, 230),
        PALETTE["line"],
    )
    draw.rounded_rectangle(
        (x + 18, y + 18, x + 74, y + 74),
        radius=16,
        fill=(234, 214, 173, 255),
    )
    draw.text((x + 39, y + 28), str(rank), font=font(28, bold=True), fill=(36, 23, 13))
    draw.text((x + 92, y + 18), name, font=font(28, bold=True), fill=PALETTE["text"])
    draw.text((x + 92, y + 53), stats, font=font(19, bold=False), fill=PALETTE["muted"])
    draw.text((x + width - 35, y + 27), "+", font=font(30, bold=True), fill=PALETTE["text"])


def make_screenshot():
    size = (1024, 768)
    img = vertical_gradient(size)
    add_glow(img, (260, -80, 760, 320), PALETTE["bronze"], blur=120, opacity=100)
    draw = ImageDraw.Draw(img)
    rounded_panel(draw, (20, 20, 1004, 486), 30, PALETTE["surface"], PALETTE["line"])

    draw.text((48, 56), "HATE OF THE VAAL", font=font(22, bold=True), fill=PALETTE["muted"])
    draw.text((48, 108), "Таблица лидеров", font=font(60, bold=True), fill=PALETTE["text"])
    draw.text((902, 60), "Обновлено", font=font(20), fill=PALETTE["muted"])

    rounded_panel(draw, (882, 96, 972, 148), 26, (31, 21, 12, 210), PALETTE["line"])
    draw.text((899, 109), "18:26", font=font(23, bold=True), fill=PALETTE["text"])

    draw_leaderboard_card(draw, 48, 198, 928, 1, "nilv#1234", "2 достиж.   22 очков")
    draw_leaderboard_card(draw, 48, 302, 928, 2, "MindOv3rMeta#5678", "1 достиж.   10 очков")
    draw_leaderboard_card(draw, 48, 406, 928, 3, "Solo+1#1111", "1 достиж.   7 очков")
    return img


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    make_icon().save(OUT_DIR / "panel-task-icon-24.png")
    make_recommendation().save(OUT_DIR / "recommendation-300x200.png")
    make_screenshot().save(OUT_DIR / "screenshot-1024x768.png")
    print(f"Generated Twitch assets in {OUT_DIR}")


if __name__ == "__main__":
    main()
