import sys

with open('index.html', 'r', encoding='utf-8') as f:
    lines = f.read().split('\n')

depth = 0
content_area_depth = None
tab_depths = {}
issues = []

for i, line in enumerate(lines):
    opens = line.count('<div')
    closes = line.count('</div')
    
    if 'id=\"content-area\"' in line:
        content_area_depth = depth + opens - closes
        print(f'Line {i+1}: content-area starts at internal depth {content_area_depth}')
        
    if 'class=\"tab-content' in line:
        tab_name = line.split('id=\"')[1].split('\"')[0]
        tab_depths[tab_name] = depth + opens - closes
        print(f'Line {i+1}: {tab_name} starts at internal depth {tab_depths[tab_name]}')
        
        # All tabs should start exactly one level deeper than content-area
        if content_area_depth is not None and tab_depths[tab_name] != content_area_depth + 1:
            print(f'  -> ERROR: {tab_name} is at depth {tab_depths[tab_name]}, expected {content_area_depth + 1}')
            
    depth += opens - closes
    
    if content_area_depth is not None and depth <= content_area_depth - 1 and '</main>' not in line:
        # Avoid repeatedly printing after it's closed, but log where it happens
        pass
        
print('Final depth:', depth)
