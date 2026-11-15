// Standalone design checks; no application or backend connections.
import {mkdir,writeFile} from 'node:fs/promises';
const targets=await(await fetch('http://127.0.0.1:9333/json')).json();
const ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
let id=0;const pending=new Map(),errors=[],requests=[];
ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error){p.reject(m.error);}else{p.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);else if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url);};
const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
const out=new URL('./verification/hero/',import.meta.url);await mkdir(out,{recursive:true});const results=[];
for(const [name,width,height,touch] of [['desktop',1440,1000,false],['ipad-landscape',1180,820,true],['ipad-portrait',820,1180,true],['mobile',390,844,true],['small-mobile',320,740,true]]){
 await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:touch});await send('Emulation.setTouchEmulationEnabled',{enabled:touch,maxTouchPoints:touch?5:1});
 await send('Page.navigate',{url:'http://127.0.0.1:4173/hero-preview.html'});await new Promise(r=>setTimeout(r,300));await evaluate(`Promise.all([...document.images].map(i=>i.decode().catch(()=>null)))`);
 const report=await evaluate(`(()=>{const controls=[...document.querySelectorAll('a,button,summary')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');return {width:innerWidth,pageWidth:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth>innerWidth,heading:document.querySelector('h1').innerText,images:[...document.images].map(i=>({src:i.currentSrc.split('/').pop(),loaded:i.complete&&i.naturalWidth>0,width:i.naturalWidth})),smallTargets:controls.filter(e=>e.getBoundingClientRect().height<44).map(e=>({text:e.innerText,height:e.getBoundingClientRect().height})),headlineRect:document.querySelector('h1').getBoundingClientRect().toJSON(),imageRect:document.querySelector('.hero-art').getBoundingClientRect().toJSON(),storage:{local:localStorage.length,session:sessionStorage.length},palette:Object.fromEntries(['petal','alice','sky','baby','aqua'].map(k=>[k,getComputedStyle(document.documentElement).getPropertyValue('--'+k).trim()]))}})()`);
 const metrics=await send('Page.getLayoutMetrics');const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:metrics.cssContentSize.width,height:metrics.cssContentSize.height,scale:1}});await writeFile(new URL(`${name}.png`,out),Buffer.from(screenshot.data,'base64'));results.push({name,...report});
}
await evaluate(`document.querySelector('.mobile-menu summary').click()`);
const menuOpen=await evaluate(`document.querySelector('.mobile-menu').open`);
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
const menuEscape=await evaluate(`({closed:!document.querySelector('.mobile-menu').open,focus:document.activeElement.tagName})`);
await evaluate(`document.querySelector('.button.primary').click()`);const ctaMessage=await evaluate(`document.querySelector('.status').textContent`);
await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
const reducedMotion=await evaluate(`({matched:matchMedia('(prefers-reduced-motion: reduce)').matches,transition:getComputedStyle(document.querySelector('.button')).transitionDuration})`);
await evaluate(`document.querySelector('.terminal').focus()`);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});const keyboard=await evaluate(`({focused:document.activeElement.tagName,outline:getComputedStyle(document.activeElement).outlineStyle,outlineWidth:getComputedStyle(document.activeElement).outlineWidth})`);
const report={results,menuOpen,menuEscape,ctaMessage,reducedMotion,keyboard,errors,externalRequests:[...new Set(requests.filter(u=>!u.startsWith('http://127.0.0.1:4173/')))]};await writeFile(new URL('results.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));ws.close();
