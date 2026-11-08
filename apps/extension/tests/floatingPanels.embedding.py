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
# Seed a saved item, then use the production binding/message/overlay path.
panel = dict(id='embed', title='Compatibility test', url=base+'/redirect', x=80, y=80, width=600, height=440)
note = '<!--arcable-floating-panels:' + json.dumps([panel], separators=(',', ':')) + '-->'
print(js('(async()=>{await chrome.storage.local.set({arcable_workspace_snapshot:{version:1,spaces:[],groups:[],folders:[],tabs:[{id:"fixture",url:'+json.dumps(base+'/host')+',title:"Fixture",note:'+json.dumps(note)+'}]},arcable_pending_ops:[]});return true})()'))
host = new_tab(base+'/host')
wait_for_load()
switch_tab(settings)
print(js('(async()=>{const tabs=await chrome.tabs.query({});const tab=tabs.find(t=>t.url==='+json.dumps(base+'/host')+');return chrome.runtime.sendMessage({type:"ARCABLE_PANELS_BIND",browserTabId:tab.id,itemId:"fixture"})})()'))
switch_tab(host)
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
select = find_node('SELECT', 'aria-label', 'Dock panel')
call(select, 'function(){this.value="right";this.dispatchEvent(new Event("change"))}')
assert call(find_node('SECTION'), 'function(){return getComputedStyle(this).visibility}') == 'hidden'
# A genuine chip click reveals the retained document.
chip = find_node('BUTTON', 'aria-expanded', 'false')
rect = call(chip, 'function(){const r=this.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}}')
click_at_xy(rect['x'], rect['y'])
assert call(find_node('SECTION'), 'function(){return getComputedStyle(this).visibility}') == 'visible'
assert js('document.querySelector("#state").value', target_id=next_target) == 'retained'
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
# Saved panel source changes reuse the overlay and load a new wrapper document.
panel['url'] = os.environ.get('ARCABLE_TEST_URL', base+'/blocked')
note = '<!--arcable-floating-panels:' + json.dumps([panel], separators=(',', ':')) + '-->'
js('chrome.runtime.sendMessage({type:"ARCABLE_PANELS_LOCAL_EDIT",operation:{type:"TAB_UPDATE",id:crypto.randomUUID(),entityId:"fixture",timestamp:Date.now(),payload:{note:'+json.dumps(note)+'}}})')
switch_tab(host)
if os.environ.get('ARCABLE_TEST_URL'):
    gitlab = until(lambda: [t for t in cdp('Target.getTargets')['targetInfos'] if t['type']=='iframe' and t['url'].startswith('https://git.insea.io/users/sign_in')], 'GitLab sign-in redirect')[0]['targetId']
    until(lambda: 'Sign in' in js('document.body.innerText', target_id=gitlab), 'GitLab sign-in page')
    time.sleep(.5)
    capture_screenshot('/tmp/arcable-embedding-gitlab.png')
    print('Reported GitLab URL displays its sign-in page inside the floating panel (no login attempted).')
else:
    reloaded = until(lambda: remote_targets(base+'/blocked'), 'updated panel URL')[0]['targetId']
    until(lambda: 'Blocked page loaded' in js('document.body.innerText', target_id=reloaded), 'updated content')
print('Same-URL ordinary frames retain blocking; nested frame protection and saved URL updates verified.')

switch_tab(settings)
js('(async()=>{const tabs=await chrome.tabs.query({});await chrome.tabs.remove(tabs.find(t=>t.url==='+json.dumps(base+'/host')+').id);return true})()')
until(lambda: js('chrome.declarativeNetRequest.getSessionRules().then(r=>r.length===0)'), 'rule cleanup after tab closure')
print('Panel compatibility rules removed after tab closure.')
