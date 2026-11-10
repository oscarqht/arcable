import os, time, json

def until(fn, label):
    for _ in range(100):
        result = fn()
        if result: return result
        time.sleep(.1)
    raise AssertionError('Timed out: '+label)

base = os.environ['ARCABLE_FIXTURE']
new_tab(base+'/capture')
wait_for_load()
print('Page to save:', capture_screenshot('/tmp/arcable-action-fixture.png'))
worker = until(lambda: next((t for t in cdp('Target.getTargets')['targetInfos'] if t['type']=='service_worker' and t['url'].startswith('chrome-extension://')), None), 'worker')
ext = worker['url'].split('/')[2]
new_tab('chrome-extension://'+ext+'/options/index.html')
wait_for_load()
# Dummy auth and provider interception live only in this disposable test copy.
result = js('(async()=>{await chrome.storage.local.set({arcable_raindrop_auth:{isAuthenticated:true,authType:"token",accessToken:"test-session"}});const tabs=await chrome.tabs.query({});const tab=tabs.find(t=>t.url==='+json.dumps(base+'/capture')+');await chrome.tabs.update(tab.id,{active:true});return chrome.runtime.sendMessage({type:"ARCABLE_TEST_TOOLBAR_CLICK",tabId:tab.id})})()')
assert result['success'], result
calls = js('chrome.storage.local.get("arcable_action_test").then(s=>s.arcable_action_test)')
assert calls['bookmark']['link'] == base+'/capture', calls
assert calls['bookmark']['collection']['$id'] == -1, calls
assert calls['bookmark']['title']
assert calls['cover']['type'] == 'image/png'
assert calls['cover']['length'] > 1000
assert calls['cover']['header'] == [137,80,78,71,13,10,26,10]
assert js('chrome.action.getBadgeText({})') == '✓'
print('PASS registered toolbar action captures the real page and sends Unsorted bookmark plus PNG cover through the production API client (mock provider)')
