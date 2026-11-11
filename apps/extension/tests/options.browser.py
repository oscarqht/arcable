import time, json

def until(fn, label):
    for _ in range(300):
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
    return js('!!document.querySelector("[aria-label~=sync]")')

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
    assert js('(()=>{const r=document.querySelector("[aria-label~=sync]").getBoundingClientRect();return r.bottom<=innerHeight && r.top>=0 && r.right<=innerWidth})()')
print('PASS signed-out gating, stored shortcuts, OAuth transition, every tab and scrolling')
until(lambda: js('document.querySelector("[aria-label~=sync]")?.textContent.includes("Saved to Raindrop")'), 'initial automatic save')
assert not js('[...document.querySelectorAll("button")].some(b=>["Save to Raindrop","Load latest"].includes(b.textContent.trim()))')
assert js('chrome.alarms.get("arcable-config-sync").then(a=>a.periodInMinutes)') == 10
click('Settings & About')
# Real Options setting saves go through the background writer and trigger automatic upload.
capture_screenshot('/tmp/arcable-options-settings.png')
rect = js('(()=>{const r=document.querySelector("input[type=checkbox]").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
click_at_xy(rect['x'], rect['y'])
until(lambda: js('document.querySelector("[aria-label~=sync]")?.textContent.includes("pending")'), 'pending state')
until(lambda: js('document.querySelector("[aria-label~=sync]")?.textContent.includes("Syncing")'), 'syncing state')
until(lambda: js('document.querySelector("[aria-label~=sync]")?.textContent.includes("Saved to Raindrop")'), 'saved state')
assert js('chrome.storage.local.get("optionsTestCloud").then(s=>JSON.parse(Object.values(s.optionsTestCloud.contents)[0]).settings.hideScrollbars)') == False
js('chrome.storage.local.set({optionsTestFail:true}).then(()=>chrome.alarms.create("arcable-config-sync",{when:Date.now()+100}))')
until(lambda: js('document.querySelector("[aria-label~=sync]")?.textContent.includes("retrying automatically")'), 'error feedback')
js('chrome.storage.local.set({optionsTestFail:false}).then(()=>chrome.alarms.create("arcable-config-sync-retry",{when:Date.now()+100}))')
until(lambda: js('document.querySelector("[aria-label~=sync]")?.textContent.includes("Saved to Raindrop")'), 'retry success')
print('PASS automatic saving, pending/syncing/saved/error status, background setting saves, and retry')
# Remote-only refresh while Options is closed must run from the alarm without uploading.
counts = js('chrome.storage.local.get("optionsTestCloud").then(s=>({uploads:s.optionsTestCloud.uploads,reads:s.optionsTestCloud.reads}))')
js('chrome.storage.local.get("optionsTestCloud").then(s=>{const c=s.optionsTestCloud;const id=Object.keys(c.items)[0];const v=JSON.parse(c.contents[id]);v.savedAt=new Date(Date.now()+1000).toISOString();v.settings.hideScrollbars=true;c.contents[id]=JSON.stringify(v);c.items[id].title="Arcable configuration "+v.savedAt;return chrome.storage.local.set({optionsTestCloud:c})}).then(()=>chrome.alarms.create("arcable-config-sync",{when:Date.now()+800}))')
options_target = next(t['targetId'] for t in cdp('Target.getTargets')['targetInfos'] if t['url']==url)
new_tab('about:blank')
cdp('Target.closeTarget', targetId=options_target)
time.sleep(5)
new_tab(url)
wait_for_load()
until(lambda: js('chrome.storage.local.get("arcable_hide_all_scrollbars").then(s=>s.arcable_hide_all_scrollbars)') == True, 'closed-options remote refresh')
assert js('chrome.storage.local.get("optionsTestCloud").then(s=>s.optionsTestCloud.uploads)') == counts['uploads']
print('PASS periodic alarm refresh with Options closed and no unnecessary upload')
# Mobile viewport: controls fit and content can scroll completely clear of them.
click('Settings & About')
cdp('Emulation.setDeviceMetricsOverride', width=320, height=640, deviceScaleFactor=1, mobile=False)
js('window.scrollTo(0,document.body.scrollHeight)')
capture_screenshot('/tmp/arcable-options-narrow.png')
assert js('(()=>{const r=document.querySelector("[aria-label~=sync]").getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.bottom<=innerHeight})()')
assert js('document.documentElement.scrollWidth<=innerWidth')
assert js('document.querySelector("main").lastElementChild.getBoundingClientRect().bottom < document.querySelector("[aria-label~=sync]").getBoundingClientRect().top')
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
