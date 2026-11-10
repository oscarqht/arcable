import os, time, json
base = os.environ['ARCABLE_FIXTURE']
new_tab(base)
wait_for_load()
cdp("Page.bringToFront")
print('Initial screenshot:', capture_screenshot('/tmp/arcable-anchoring-initial.png'))
def viewport(w=1000,h=700):
    cdp('Emulation.setDeviceMetricsOverride',width=w,height=h,deviceScaleFactor=1,mobile=False)
    # Drive a compositor frame so headless Chromium delivers its resize event.
    capture_screenshot("/tmp/arcable-anchoring-viewport.png")
    time.sleep(.12)
def set_panels(panels):
    js('fixture.setPanels('+json.dumps(panels)+')')
def panel(**kwargs):
    return dict(dict(id='test',title='Panel',url='https://example.com',x=80,y=60,width=300,height=200),**kwargs)
def rect(selector='section'):
    return js('fixture.shadow.querySelector('+json.dumps(selector)+').getBoundingClientRect().toJSON()')
def saved():
    return js('fixture.patches.at(-1).patch')
def reload_saved(p):
    set_panels([])
    set_panels([panel(**p)])
def drag(selector,dx,dy):
    capture_screenshot('/tmp/arcable-anchoring-before-drag.png')
    r=rect(selector)
    x=r['x']+min(50,r['width']/2); y=r['y']+r['height']/2
    cdp('Input.dispatchMouseEvent',type='mousePressed',x=x,y=y,button='left',buttons=1,clickCount=1)
    cdp('Input.dispatchMouseEvent',type='mouseMoved',x=x+dx,y=y+dy,button='left',buttons=1)
    cdp('Input.dispatchMouseEvent',type='mouseReleased',x=x+dx,y=y+dy,button='left',buttons=0,clickCount=1)
viewport()
# Legacy absolute geometry migrates from rendered placement; the saved transport
# payload is reapplied as a freshly mounted panel, as happens after page reload.
for x in [80,620]:
    for y in [60,440]:
        set_panels([panel(x=x,y=y)])
        p=saved()
        assert p['anchorX']==dict(edge='start' if x==80 else 'end',distance=80),p
        assert p['anchorY']==dict(edge='start' if y==60 else 'end',distance=60),p
        patches=js('fixture.patches.length')
        viewport(1200,900)
        r=rect(); assert r['x']==x+(200 if x==620 else 0) and r['y']==y+(200 if y==440 else 0),r
        viewport(180,140)
        r=rect(); assert r['width']==164 and r['height']==124,r
        viewport()
        assert rect()['x']==x and rect()['y']==y
        assert js('fixture.patches.length')==patches,'Viewport resizing must not write saved layout'
        reload_saved(p)
        assert rect()['x']==x and rect()['y']==y
print('PASS rendered free anchors, migration, reload, no resize writes, and shrink/grow restoration')
set_panels([panel(x=620,y=440)])
drag('header',-40,-24)
p=saved(); assert p['anchorX']==dict(edge='end',distance=120),p
assert p['anchorY']==dict(edge='end',distance=84),p
drag('[aria-label="Resize panel"]',30,20)
p=saved(); assert p['width']==330 and p['height']==220,p
assert p['anchorX']['distance']==90 and p['anchorY']['distance']==64,p
viewport(1200,900)
r=rect(); assert r['right']==1110 and r['bottom']==836,r
js('fixture.shadow.querySelector("header").focus()')
cdp('Input.dispatchKeyEvent',type='keyDown',key='ArrowLeft',code='ArrowLeft',windowsVirtualKeyCode=37)
cdp('Input.dispatchKeyEvent',type='keyUp',key='ArrowLeft',code='ArrowLeft',windowsVirtualKeyCode=37)
p=saved(); assert p['anchorX']['distance']==106,p
viewport()
assert rect()['right']==894,rect()
js('fixture.shadow.querySelector("header").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowDown",shiftKey:true,bubbles:true}))')
p=saved(); assert p['height']==236 and p['anchorY']['distance']==48,p
viewport(1200,900)
assert rect()['bottom']==852,rect()
viewport()
print('PASS pointer and keyboard move/resize recalculate anchors from current rendered geometry')
# Every dock edge, both nearest corners. Chip size comes from real font/layout.
for edge in ['left','right','top','bottom']:
    vertical=edge in ['left','right']; extent=700 if vertical else 1000
    for end in [False,True]:
        set_panels([panel(dock=edge,dockPosition=extent-100 if end else 50)])
        r=rect('.edge button'); p=saved(); a=p['dockAnchor']
        assert a['edge']==('end' if end else 'start'),(edge,p)
        viewport(1200,900)
        grown=rect('.edge button'); coord='y' if vertical else 'x'
        assert abs(grown[coord]-r[coord]-(200 if end else 0))<.1,(edge,r,grown)
        viewport(180,140)
        small=rect('.edge button')
        assert small['x']>=0 and small['y']>=0 and small['right']<=180 and small['bottom']<=140,small
        viewport()
        assert abs(rect('.edge button')[coord]-r[coord])<.1
        reload_saved(p)
        assert abs(rect('.edge button')[coord]-r[coord])<.1
print('PASS all eight dock corners, nearest chip-end distances, reload and shrink/grow')
set_panels([panel(dock='right',dockPosition=500)])
before=rect('.right button')
drag('.right button',0,-100)
p=saved(); r=rect('.right button')
assert r['y']==before['y']-100,(before,r)
assert p['dockAnchor']['distance']==700-r['bottom'],p
viewport(1200,900)
assert abs(rect('.right button')['y']-r['y']-200)<.1
viewport()
# Stable collision order and restored desired offsets after crowding.
ps=[panel(id=str(i),title='Long dock chip title',dock='top',dockPosition=700) for i in range(3)]
set_panels(ps)
def chips():
    return js('[...fixture.shadow.querySelectorAll(".top button")].filter(b=>!b.hidden).map(b=>b.getBoundingClientRect().toJSON()).sort((a,b)=>a.x-b.x)')
def nonoverlap(rs):
    for a,b in zip(rs,rs[1:]): assert b['left']>=a['right']+4.9,(a,b)
original=chips(); assert len(original)==3; nonoverlap(original)
viewport(360,200); nonoverlap(chips())
viewport(); restored=chips(); nonoverlap(restored)
assert [r['x'] for r in original]==[r['x'] for r in restored],(original,restored)
print('PASS dock-chip pointer updates and collision avoidance/restoration')
print('Final screenshot:',capture_screenshot('/tmp/arcable-anchoring-final.png'))
# Verify the built extension's real storage, messaging and top-level reload path.
def until(fn,label):
    for _ in range(100):
        try:
            value=fn()
            if value: return value
        except (AssertionError,KeyError): pass
        time.sleep(.1)
    raise AssertionError('Timed out: '+label)
workers=until(lambda:[t for t in cdp('Target.getTargets')['targetInfos'] if t['type']=='service_worker' and t['url'].startswith('chrome-extension://')],'built extension worker')
ext=workers[0]['url'].split('/')[2]
settings=new_tab('chrome-extension://'+ext+'/options/index.html')
wait_for_load()
rule=dict(id='live',title='Live anchoring',url=base+'/embedded',patterns=[base+'/host'])
js('(async()=>{await chrome.storage.local.set({arcable_side_panel_rules:'+json.dumps([rule])+',arcable_panel_layouts:{live:{x:620,y:440,width:300,height:200}}});return true})()')
def layout():
    return js('(async()=>{return (await chrome.storage.local.get("arcable_panel_layouts")).arcable_panel_layouts.live})()',target_id=settings)
def nodes(node):
    yield node
    for key in ['children','shadowRoots']:
        for child in node.get(key,[]): yield from nodes(child)
def find(name,attribute=None,value=None):
    for node in nodes(cdp('DOM.getDocument',depth=-1,pierce=True)['root']):
        attrs=dict(zip(node.get('attributes',[])[::2],node.get('attributes',[])[1::2]))
        if node['nodeName']==name and (attribute is None or attrs.get(attribute)==value): return node
    raise AssertionError('Missing node '+name)
def call(node,fn):
    obj=cdp('DOM.resolveNode',backendNodeId=node['backendNodeId'])['object']['objectId']
    result=cdp('Runtime.callFunctionOn',objectId=obj,functionDeclaration=fn,returnByValue=True)
    assert 'exceptionDetails' not in result,result
    return result.get('result',{}).get('value')
def live_rect(): return call(find('SECTION'),'function(){return this.getBoundingClientRect().toJSON()}')
def live_viewport(w,h):
    cdp('Emulation.setDeviceMetricsOverride',width=w,height=h,deviceScaleFactor=1,mobile=False)
    capture_screenshot('/tmp/arcable-anchoring-live.png')
    time.sleep(.12)
host=new_tab('about:blank')
cdp('Page.bringToFront')
live_viewport(1000,700)
goto_url(base+'/host')
wait_for_load()
until(lambda: live_rect()['x']==620,'real panel')
until(lambda: layout().get('anchorX',{}).get('edge')=='end','persisted migration')
live_saved=layout()
assert live_saved['anchorY']==dict(edge='end',distance=60),live_saved
live_viewport(1200,900)
assert live_rect()['x']==820 and live_rect()['y']==640,live_rect()
assert layout()==live_saved,'real viewport resize changed storage'
cdp('Page.reload')
wait_for_load()
until(lambda:live_rect()['x']==820 and live_rect()['y']==640,'reloaded anchors')
live_viewport(180,140)
assert live_rect()['width']==164
live_viewport(1000,700)
assert live_rect()['x']==620 and live_rect()['width']==300
# Production dock action persists nearest-corner anchor, then survives reload.
call(find('SELECT','aria-label','Dock panel'),'function(){this.value="right";this.dispatchEvent(new Event("change"))}')
until(lambda:layout().get('dock')=='right' and layout().get('dockAnchor'),'saved dock corner')
dock_saved=layout()
chip=find('BUTTON','aria-expanded','false')
chip_before=call(chip,'function(){return this.getBoundingClientRect().toJSON()}')
cdp('Page.reload'); wait_for_load()
until(lambda:call(find('BUTTON','aria-expanded','false'),'function(){return this.getBoundingClientRect().y}')==chip_before['y'],'reloaded dock chip')
assert layout()==dock_saved
live_viewport(1200,900)
chip_after=call(find('BUTTON','aria-expanded','false'),'function(){return this.getBoundingClientRect().toJSON()}')
assert abs(chip_after['y']-chip_before['y']-200)<.1,(chip_before,chip_after)
print('PASS built extension migration/storage, resize without writes, real page reload and dock-corner persistence')
