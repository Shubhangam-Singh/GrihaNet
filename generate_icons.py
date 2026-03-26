from PIL import Image, ImageDraw, ImageFont
import urllib.request
import os

sizes = [192, 512]
bg_color = (6, 9, 15)  # #06090f
accent_color = (0, 229, 160) # #00e5a0
output_dir = "static/icons"

for size in sizes:
    # Create image
    img = Image.new('RGB', (size, size), color=bg_color)
    drw = ImageDraw.Draw(img)
    
    # Draw a gradient or colored border/circle
    margin = size // 6
    drw.ellipse([margin, margin, size-margin, size-margin], fill=accent_color)
    
    # Draw simple 'G' or house shape
    inner = size // 3
    drw.ellipse([inner, inner, size-inner, size-inner], fill=bg_color)
    
    # Save
    out_path = os.path.join(output_dir, f"icon-{size}.png")
    img.save(out_path)
    print(f"Generated {out_path}")

