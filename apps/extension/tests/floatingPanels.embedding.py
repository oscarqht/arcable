import os, time, json
base = os.environ['ARCABLE_FIXTURE']
def until(fn, label):
    for _ in range(100):
        value = fn()
        if value:
            return value
        time.sleep(.1)
    raise AssertionError('Timed out: ' + label)

targets = until(lambda: [t for t in cdp('Target.getTargets')['targetInfos'] if t['type'] == 'service_worker' and t['url'].startswith('chrome-extension://')], 'extension worker')
ext = targets[0]['url'].split('/')[2]
settings = new_tab('chrome-extension://' + ext + '/options/index.html')
wait_for_load()
print('Initial screenshot:', capture_screenshot('/tmp/arcable-embedding-initial.png'))
until(lambda: js('[...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="💧 Sign in with Raindrop OAuth")'), 'login button')
def click_label(label):
    js('([...document.querySelectorAll("button")].find(b=>b.textContent.trim()==='+json.dumps(label)+'))?.scrollIntoView({block:"center"})')
    capture_screenshot('/tmp/arcable-embedding-options.png')
    rect = js('(()=>{const b=[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==='+json.dumps(label)+');const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
    click_at_xy(rect['x'], rect['y'])
click_label('💧 Sign in with Raindrop OAuth')
until(lambda: js('[...document.querySelectorAll("nav button")].some(b=>b.textContent.trim()==="Side Panels")'), 'authenticated tabs')
click_label('Side Panels')
until(lambda: js('Boolean(document.querySelector("form textarea"))'), 'Options form hydration')
# Exercise the visible Options form through real pointer and text input events.
cdp('Emulation.setDeviceMetricsOverride', width=1280, height=1000, deviceScaleFactor=1, mobile=False)
def center(selector):
    return js('(()=>{const e=document.querySelector('+json.dumps(selector)+');e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
def fill(selector, value):
    rect=center(selector)
    click_at_xy(rect['x'], rect['y'])
    js('document.querySelector('+json.dumps(selector)+').select()')
    cdp('Input.insertText', text=value)
def button_text(text):
    return js('(()=>{const e=Array.from(document.querySelectorAll("button")).find(e=>e.textContent==='+json.dumps(text)+');e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
def click_button(text):
    rect=button_text(text)
    click_at_xy(rect['x'],rect['y'])
fill('form input:not([type])', 'UI-created panel')
fill('form input[type="url"]', base+'/blocked')
fill('form textarea', base+'/host')
click_button('Save panel')
until(lambda: 'UI-created panel' in js('document.querySelector("article")?.innerText || ""'), 'Options creation')
click_button('Edit')
fill('form input:not([type])', 'Edited panel')
click_button('Save panel')
until(lambda: 'Edited panel' in js('document.querySelector("article")?.innerText || ""'), 'Options editing')
rect=center('article input[type="checkbox"]')
click_at_xy(rect['x'],rect['y'])
until(lambda: js('!document.querySelector("article input").checked'), 'Options disable')
click_at_xy(rect['x'],rect['y'])
until(lambda: js('document.querySelector("article input").checked'), 'Options enable')
js('window.confirm=()=>true')
click_button('Remove')
until(lambda: js('!document.querySelector("article")'), 'Options removal')
print('Options create/edit/enable/disable/remove verified through the visible UI.')
# Configure a URL rule through production storage; matching no longer needs tab bindings.
panel = dict(id='embed', title='Compatibility test', url=base+'/redirect', patterns=[base+'/host'])
print(js('(async()=>{await chrome.storage.local.set({arcable_side_panel_rules:'+json.dumps([panel])+',arcable_panel_layouts:{embed:{x:80,y:80,width:600,height:440}}});return true})()'))
host = new_tab(base+'/host')
wait_for_load()
cdp('Emulation.setDeviceMetricsOverride', width=1280, height=900, deviceScaleFactor=1, mobile=False)
def remote_targets(url):
    targets = cdp('Target.getTargets')['targetInfos']
    wrappers = [t['targetId'] for t in targets if '/panel/index.html?' in t['url']]
    return [t for t in targets if t['type']=='iframe' and t['url']==url and t.get('parentId') in wrappers]
remote = until(lambda: remote_targets(base+'/blocked'), 'real panel document')[0]['targetId']
until(lambda: 'Blocked page loaded' in js('document.body.innerText', target_id=remote), 'loaded content')
print('Loaded XFO + CSP blocked page through redirect, despite host frame-src none.')
assert 'Nested content should remain blocked' not in js('document.body.innerText', target_id=remote)
print('Screenshot:', capture_screenshot('/tmp/arcable-embedding-loaded.png'))
js('document.querySelector("#state").value="retained"', target_id=remote)
# Navigate inside the remote document. The next page also blocks embedding.
js('document.querySelector("a").click()', target_id=remote)
next_target = until(lambda: remote_targets(base+'/next'), 'in-panel navigation')[0]['targetId']
until(lambda: 'Next page loaded' in js('document.body.innerText', target_id=next_target), 'navigation compatibility retry')
print('In-panel navigation to another blocked document succeeded.')
for suffix, expected in [('/blocked', 'Blocked page loaded'), ('/next', 'Next page loaded')]:
    js('document.querySelector("a").click()', target_id=next_target)
    next_target = until(lambda: remote_targets(base+suffix), 'repeated navigation')[0]['targetId']
    until(lambda: expected in js('document.body.innerText', target_id=next_target), 'repeated blocked document')
print('Repeated A-B-A-B navigation succeeds.')

# Exercise real overlay geometry and retention, including its closed shadow DOM.
def nodes(node):
    yield node
    for key in ['children', 'shadowRoots']:
        for child in node.get(key, []):
            yield from nodes(child)

def find_node(name, attribute=None, value=None):
    root = cdp('DOM.getDocument', depth=-1, pierce=True)['root']
    for node in nodes(root):
        attrs = dict(zip(node.get('attributes', [])[::2], node.get('attributes', [])[1::2]))
        if node['nodeName'] == name and (attribute is None or attrs.get(attribute) == value):
            return node
    raise AssertionError('Missing overlay node: '+name)

def call(node, function):
    obj = cdp('DOM.resolveNode', backendNodeId=node['backendNodeId'])['object']['objectId']
    result = cdp('Runtime.callFunctionOn', objectId=obj, functionDeclaration=function, returnByValue=True)
    if 'exceptionDetails' in result:
        raise AssertionError(result['exceptionDetails'])
    return result.get('result', {}).get('value')

js('document.querySelector("#state").value="retained"', target_id=next_target)
# The footer helper covers the webpage without replacing or reloading it.
helper = find_node('BUTTON', 'aria-label', 'Login not working?')
rect = call(helper, 'function(){const r=this.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}}')
click_at_xy(rect['x'], rect['y'])
guide = find_node('DIV', 'class', 'login-help')
assert call(guide, 'function(){return !this.hidden}')
assert call(find_node('SELECT', 'aria-label', 'Login help browser'), 'function(){return this.value}') == ('brave' if 'Brave' in os.environ.get('CHROME_BIN', '') else 'chrome')
for name, expected in [('brave','Allow all cookies'), ('chrome','Third-party cookies'), ('firefox','Enhanced Tracking Protection'), ('safari','Open in tab')]:
    chooser = find_node('SELECT', 'aria-label', 'Login help browser')
    call(chooser, 'function(){this.value='+json.dumps(name)+';this.dispatchEvent(new Event("change"))}')
    assert expected in call(guide, 'function(){return this.innerText}')
    assert '127.0.0.1' in call(guide, 'function(){return this.innerText}')
capture_screenshot('/tmp/arcable-login-help.png')
call(guide, 'function(){this.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))}')
assert call(guide, 'function(){return this.hidden}')
assert call(helper, 'function(){return this.getRootNode().activeElement===this}')
assert js('document.querySelector("#state").value', target_id=next_target) == 'retained'
# Footer controls remain inside the narrowest supported panel.
call(find_node('SECTION'), 'function(){this.style.width="240px"}')
for aria in ['Login not working?', 'Resize panel']:
    assert call(find_node('BUTTON', 'aria-label', aria), 'function(){const r=this.getBoundingClientRect(),p=this.closest("section").getBoundingClientRect();return r.left>=p.left&&r.right<=p.right}')
call(find_node('SECTION'), 'function(){this.style.width="600px"}')
print('Login help guides, Brave detection, Escape/focus, retained webpage state and narrow footer verified.')
select = find_node('SELECT', 'aria-label', 'Dock panel')
call(select, 'function(){this.value="right";this.dispatchEvent(new Event("change"))}')
assert call(find_node('SECTION'), 'function(){return getComputedStyle(this).visibility}') == 'hidden'
# A genuine chip click reveals the retained document.
chip = find_node('BUTTON', 'aria-expanded', 'false')
rect = call(chip, 'function(){const r=this.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}}')
click_at_xy(rect['x'], rect['y'])
assert call(find_node('SECTION'), 'function(){return getComputedStyle(this).visibility}') == 'visible'
assert js('document.querySelector("#state").value', target_id=next_target) == 'retained'
# Escape from footer controls closes help before the docked panel handler.
call(helper, 'function(){this.click()}')
footer_open = next(n for n in nodes(cdp('DOM.getDocument', depth=-1, pierce=True)['root']) if n['nodeName']=='BUTTON' and any(c.get('nodeValue')=='Open in tab' for c in n.get('children', [])))
call(footer_open, 'function(){this.focus();this.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))}')
assert call(guide, 'function(){return this.hidden}')
assert call(find_node('SECTION'), 'function(){return getComputedStyle(this).visibility}') == 'visible'
call(select, 'function(){this.value="";this.dispatchEvent(new Event("change"))}')
header = find_node('HEADER')
before = call(find_node('SECTION'), 'function(){return this.getBoundingClientRect().toJSON()}')
call(header, 'function(){this.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));this.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowDown",shiftKey:true,bubbles:true}))}')
after = call(find_node('SECTION'), 'function(){return this.getBoundingClientRect().toJSON()}')
assert after['height'] == before['height'] + 16
assert after['x'] == before['x'] + 16
assert js('document.querySelector("#state").value', target_id=next_target) == 'retained'
# Open in tab retains its production fallback.
open_button = next(n for n in nodes(cdp('DOM.getDocument', depth=-1, pierce=True)['root']) if n['nodeName']=='BUTTON' and any(c.get('nodeValue')=='Open in tab' for c in n.get('children', [])))
call(open_button, 'function(){this.click()}')
until(lambda: any(t['url']==base+'/redirect' or t['url']==base+'/blocked' for t in list_tabs() if t['targetId'] != host), 'Open in tab fallback')
print('Dock/hide/reveal retains iframe state; movement, resizing and Open in tab work.')
# Ordinary frames and nested frames still fail, even at the same URL as the panel.
switch_tab(settings)
frames = js('(async()=>{const tabs=await chrome.tabs.query({});return chrome.webNavigation.getAllFrames({tabId:tabs.find(t=>t.url==='+json.dumps(base+'/host')+').id})})()')
assert any(f['parentFrameId']==0 and f['url']==base+'/blocked' and f['errorOccurred'] for f in frames)
assert any(f['url']==base+'/nested' and f['errorOccurred'] for f in frames)
# SPA URL changes remove and restore matching overlays without reloading the host.
switch_tab(host)
js('history.pushState({}, "", "/unmatched")')
until(lambda: not any(n['nodeName']=='SECTION' for n in nodes(cdp('DOM.getDocument', depth=-1, pierce=True)['root'])), 'SPA exit')
js('history.pushState({}, "", "/host")')
until(lambda: any(n['nodeName']=='SECTION' for n in nodes(cdp('DOM.getDocument', depth=-1, pierce=True)['root'])), 'SPA re-entry')
print('Real SPA navigation removes and restores URL-matched panels.')
switch_tab(settings)
# Saved panel source changes reuse the overlay and load a new wrapper document.
prior_remote_ids = {t['targetId'] for t in remote_targets(base+'/blocked')}
panel['url'] = os.environ.get('ARCABLE_TEST_URL', base+'/blocked')
js('chrome.storage.local.set({arcable_side_panel_rules:'+json.dumps([panel])+'})')
switch_tab(host)
if os.environ.get('ARCABLE_TEST_URL'):
    gitlab = until(lambda: [t for t in cdp('Target.getTargets')['targetInfos'] if t['type']=='iframe' and t['url'].startswith('https://git.insea.io/users/sign_in')], 'GitLab sign-in redirect')[0]['targetId']
    until(lambda: 'Sign in' in js('document.body.innerText', target_id=gitlab), 'GitLab sign-in page')
    time.sleep(.5)
    capture_screenshot('/tmp/arcable-embedding-gitlab.png')
    print('Reported GitLab URL displays its sign-in page inside the floating panel (no login attempted).')
else:
    def updated_document():
        for target in remote_targets(base+'/blocked'):
            if target['targetId'] in prior_remote_ids:
                continue
            try:
                if 'Blocked page loaded' in js('document.body.innerText', target_id=target['targetId']):
                    return target['targetId']
            except RuntimeError:
                pass  # A frame can detach during the source-change navigation.
        return None
    until(updated_document, 'updated panel URL and content')
print('Same-URL ordinary frames retain blocking; nested frame protection and saved URL updates verified.')

# Reload remounts the panel from persistent browser-local geometry.
switch_tab(settings)
saved_layout = js('chrome.storage.local.get("arcable_panel_layouts").then(s=>s.arcable_panel_layouts.embed)')
switch_tab(host)
js('location.reload()')
wait_for_load()
until(lambda: any(n['nodeName']=='SECTION' for n in nodes(cdp('DOM.getDocument', depth=-1, pierce=True)['root'])), 'panel after reload')
restored = call(find_node('SECTION'), 'function(){return this.getBoundingClientRect().toJSON()}')
assert restored['x']==saved_layout['x'] and restored['width']==saved_layout['width'] and restored['height']==saved_layout['height']
# A second matching definition appears alongside the first and can be disabled independently.
switch_tab(settings)
second_panel = dict(panel, id='second', title='Second panel')
js('chrome.storage.local.set({arcable_side_panel_rules:'+json.dumps([panel,second_panel])+'})')
switch_tab(host)
until(lambda: sum(n['nodeName']=='SECTION' for n in nodes(cdp('DOM.getDocument', depth=-1, pierce=True)['root']))==2, 'two matching panels')
switch_tab(settings)
second_panel['disabled'] = True
js('chrome.storage.local.set({arcable_side_panel_rules:'+json.dumps([panel,second_panel])+'})')
switch_tab(host)
until(lambda: sum(n['nodeName']=='SECTION' for n in nodes(cdp('DOM.getDocument', depth=-1, pierce=True)['root']))==1, 'disable second panel')
print('Reload persistence and multiple matching panels verified in the installed extension.')
switch_tab(settings)
js('(async()=>{const tabs=await chrome.tabs.query({});await chrome.tabs.remove(tabs.find(t=>t.url==='+json.dumps(base+'/host')+').id);return true})()')
until(lambda: js('chrome.declarativeNetRequest.getSessionRules().then(r=>r.length===0)'), 'rule cleanup after tab closure')
print('Panel compatibility rules removed after tab closure.')
