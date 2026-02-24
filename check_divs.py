import re
import sys

with open("index.html", "r", encoding="utf-8") as f:
    text = f.read()

lines = text.split("\n")
depth = 0
for i, line in enumerate(lines):
    # This is a naive div count but usually good enough
    opens = len(re.findall(r'<div\b[^>]*>', line))
    closes = len(re.findall(r'</div\b[^>]*>', line))
    
    if "id=\"content-area\"" in line or "id=\"tab-" in line:
        print(f"L{i+1} (Depth {depth}): {line.strip()}")
    
    depth += opens - closes
