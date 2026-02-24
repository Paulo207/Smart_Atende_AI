import sys

def patch():
    with open('index.html', 'r', encoding='utf-8') as f:
        text = f.read()

    # Fix 1: Close tab-dashboard
    text = text.replace('          </div>\n        </div>\n\n        <div id="tab-conversations"', '          </div>\n        </div>\n      </div>\n\n        <div id="tab-conversations"')

    # Fix 2: Remove extra div at 483
    text = text.replace('        </div>\n\n      </div>\n\n      <!-- Agenda Tab -->', '        </div>\n\n      <!-- Agenda Tab -->')

    # Fix 3: Remove extra div at 633
    text = text.replace('          </div>\n        </div>\n      </div>\n\n      <!-- Webhook Tab -->', '          </div>\n        </div>\n\n      <!-- Webhook Tab -->')

    # Fix 4: Remove the old duplicate tab-conversations (Lines 712 to 842)
    start_str = '      </div><!-- Conversations Tab -->\n      <div id="tab-conversations" class="tab-content hidden fade-in">'
    end_str = '        </div>\n      </div><!-- Settings Tab -->'

    if start_str in text and end_str in text:
        s_idx = text.find(start_str)
        e_idx = text.find(end_str) + len('        </div>\n      </div>')
        text = text[:s_idx+12] + text[e_idx:]
    else:
        print('WARNING: Could not find duplicate tab-conversations boundaries')

    # Fix 5: Add missing closing divs for content-area and tab-settings before </main>
    if '      </div>\n    </main>' in text:
        text = text.replace('      </div>\n    </main>', '      </div>\n      </div>\n      </div>\n    </main>')

    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(text)

    print('Patched successfully!')

patch()
