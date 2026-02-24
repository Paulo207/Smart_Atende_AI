import sys

with open('index.html', 'r', encoding='utf-8') as f:
    lines = f.read().split('\n')

depth = 0
for i, line in enumerate(lines):
    opens = line.count("<div")
    closes = line.count("</div")
    depth += opens - closes
    
    if 425 <= i+1 <= 485:
        print(f"L{i+1}: D:{depth} O:{opens} C:{closes} | {line.strip()}")
