import os, time, json

def until(fn, label):
    for _ in range(100):
        result = fn()
        if result:
            return result
        time.sleep(.1)
    raise AssertionError('Timed out: '+label)

base = os.environ['ARCABLE_FIXTURE']
host = new_tab(base+'/capture')
wait_for_load()
print('Capture fixture:', capture_screenshot('/tmp/arcable-screenshot-fixture.png'))
worker = until(lambda: next((t for t in cdp('Target.getTargets')['targetInfos'] if t['type']=='service_worker' and t['url'].startswith('chrome-extension://')), None), 'extension worker')
ext = worker['url'].split('/')[2]
settings = new_tab('chrome-extension://'+ext+'/options/index.html')
wait_for_load()
# Use the real capture action, storage handoff, and editor tab creation.
result = js('(async()=>{const tabs=await chrome.tabs.query({});const tab=tabs.find(t=>t.url==='+json.dumps(base+'/capture')+');await chrome.tabs.update(tab.id,{active:true});return chrome.runtime.sendMessage({type:"TAKE_SCREENSHOT",payload:{tabId:tab.id}})})()')
assert result['success'], result
editor = until(lambda: next((t['targetId'] for t in list_tabs() if t['url']=='chrome-extension://'+ext+'/editor/index.html'), None), 'screenshot editor tab')
switch_tab(editor)
wait_for_load()
until(lambda: js('document.querySelector("#editor-status")?.classList.contains("hidden") && Boolean(document.querySelector(".tl-canvas"))'), 'screenshot annotation canvas')
until(lambda: js('Array.from(document.querySelectorAll("#tldraw-editor img")).some(img=>img.complete&&img.naturalWidth>0&&img.src.startsWith("data:image/"))'), 'captured screenshot image')
assert js('Boolean(document.querySelector(".tlui-toolbar"))')
# Exercise the crop control so a rendered shell alone cannot pass.
rect = js('(()=>{const r=document.querySelector("#action-crop").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
click_at_xy(rect['x'],rect['y'])
until(lambda: js('document.querySelector("#action-crop").getAttribute("aria-pressed")==="true"'), 'crop mode')
click_at_xy(rect['x'],rect['y'])
until(lambda: js('document.querySelector("#action-crop").getAttribute("aria-pressed")==="false"'), 'exit crop mode')
print('Loaded screenshot editor:', capture_screenshot('/tmp/arcable-screenshot-editor-fixed.png'))
print('PASS real screenshot capture, image loading, annotation toolbar, and crop interaction')
