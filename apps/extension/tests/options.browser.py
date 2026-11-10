import time, json

def until(fn, label):
    for _ in range(100):
        result = fn()
        if result: return result
        time.sleep(.1)
    raise AssertionError('Timed out: '+label)

def click(label):
    js('([...document.querySelectorAll("button")].find(b=>b.textContent.trim()==='+json.dumps(label)+'))?.scrollIntoView({block:"center"})')
    capture_screenshot('/tmp/arcable-options-current.png')
    rect = js('(()=>{const b=[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==='+json.dumps(label)+');if(!b)throw Error("Missing button");const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
    click_at_xy(rect['x'], rect['y'])

def nav():
    return js('[...document.querySelectorAll("nav button")].map(b=>b.textContent.trim())')

def actions():
    return js('!!document.querySelector("[role=group]")')

new_tab('about:blank')
worker = until(lambda: next((t for t in cdp('Target.getTargets')['targetInfos'] if t['type']=='service_worker' and t['url'].startswith('chrome-extension://')), None), 'worker')
url = 'chrome-extension://'+worker['url'].split('/')[2]+'/options/index.html'
new_tab(url)
wait_for_load()
capture_screenshot('/tmp/arcable-options-signed-out.png')
until(lambda: nav()==['Raindrop'], 'signed-out tabs')
assert not actions()
# A stored shortcut must never expose protected content while signed out.
js('chrome.storage.local.set({optionsInitialTab:"custom-code",customCodePrefillUrl:"https://example.test/*"}).then(()=>location.reload())')
wait_for_load()
until(lambda: nav()==['Raindrop'], 'signed-out shortcut')
assert not actions()
assert not js('document.body.innerText.includes("Custom JS & CSS")')
click('💧 Sign in with Raindrop OAuth')
until(lambda: len(nav())==5 and actions(), 'OAuth transition')
capture_screenshot('/tmp/arcable-options-signed-in.png')
for label in ['Side Panels', 'Custom JS & CSS', 'Run Code', 'Settings & About', 'Raindrop']:
    js('window.scrollTo(0,0)')
    click(label)
    until(lambda: js('document.querySelector("nav [aria-current=page]").textContent.trim()')==label, label)
    assert actions()
    js('window.scrollTo(0,document.body.scrollHeight)')
    assert js('(()=>{const r=document.querySelector("[role=group]").getBoundingClientRect();return r.bottom<=innerHeight && r.top>=0 && r.right<=innerWidth})()')
print('PASS signed-out gating, stored shortcuts, OAuth transition, every tab and scrolling')
click('Save to Raindrop')
until(lambda: js('[...document.querySelectorAll("button")].some(b=>b.textContent==="Saving…" && b.disabled)'), 'saving state')
assert js('[...document.querySelectorAll("[role=group] button")].every(b=>b.disabled)')
until(lambda: js('document.querySelector("[role=status]")?.textContent.includes("saved to Raindrop")'), 'save feedback')
js('window.confirm=()=>false')
click('Load latest')
assert not js('[...document.querySelectorAll("button")].some(b=>b.textContent==="Loading…")')
js('window.confirm=()=>true')
click('Load latest')
until(lambda: js('[...document.querySelectorAll("button")].some(b=>b.textContent==="Loading…" && b.disabled)'), 'loading state')
until(lambda: js('document.querySelector("[role=status]")?.textContent.includes("replaced")'), 'load feedback')
js('chrome.storage.local.set({optionsTestFail:true})')
click('Save to Raindrop')
until(lambda: js('document.querySelector("[role=status]")?.textContent.includes("Test snapshot failure")'), 'failure feedback')
print('PASS save/load pending states, confirmation cancellation, success and failure feedback')
# Mobile viewport: controls fit and content can scroll completely clear of them.
click('Settings & About')
cdp('Emulation.setDeviceMetricsOverride', width=320, height=640, deviceScaleFactor=1, mobile=False)
js('window.scrollTo(0,document.body.scrollHeight)')
capture_screenshot('/tmp/arcable-options-narrow.png')
assert js('(()=>{const r=document.querySelector("[role=group]").getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.bottom<=innerHeight})()')
assert js('document.documentElement.scrollWidth<=innerWidth')
assert js('document.querySelector("main").lastElementChild.getBoundingClientRect().bottom < document.querySelector("[role=group]").getBoundingClientRect().top')
cdp('Emulation.clearDeviceMetricsOverride')
js('window.scrollTo(0,0)')
click('Raindrop')
click('Disconnect')
until(lambda: nav()==['Raindrop'] and not actions(), 'disconnect')
click('💧 Sign in with Raindrop OAuth')
until(lambda: len(nav())==5, 'reconnect')
click('Settings & About')
js('chrome.storage.local.remove("arcable_raindrop_auth")')
until(lambda: nav()==['Raindrop'] and not actions(), 'external auth removal')
assert js('document.querySelector("nav [aria-current=page]").textContent')=='Raindrop'
print('PASS narrow viewport, disconnect, reconnect, and auth removal from another tab')
