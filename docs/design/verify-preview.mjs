// Review-only tooling: requires local preview server :4173 and isolated Chrome CDP :9333.
import { mkdir, writeFile } from 'node:fs/promises';
const targets = await (await fetch('http://127.0.0.1:9333/json')).json();
const target = targets.find(t => t.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject) => { ws.onopen=resolve; ws.onerror=reject; });
let next=0; const pending=new Map(), errors=[];
ws.onmessage=({data})=>{const msg=JSON.parse(data);if(msg.id){const p=pending.get(msg.id);pending.delete(msg.id);if(msg.error)p.reject(msg.error);else p.resolve(msg.result);}else if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.text);};
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;}
await send('Page.enable'); await send('Runtime.enable');
const results=[];const out=new URL('./verification/',import.meta.url);await mkdir(out,{recursive:true});
const sizes=[['desktop',1440,1000,false],['ipad-landscape',1180,820,true],['ipad-portrait',820,1180,true],['mobile',390,844,true],['small-mobile',320,740,true]];
for(const [name,width,height,touch] of sizes){
 await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:touch});
 await send('Emulation.setTouchEmulationEnabled',{enabled:touch,maxTouchPoints:touch?5:1});
 for(const view of ['portfolio','vault']){
  await send('Page.navigate',{url:`http://127.0.0.1:4173/preview.html#${view}`});
  await new Promise(r=>setTimeout(r,250));
  const report=await evaluate(`(()=>{const visible=e=>!!(e.getClientRects().length)&&getComputedStyle(e).visibility!=='hidden';const root=document.querySelector('#${view}-view');const controls=[...root.querySelectorAll('button,a,input,textarea,summary')].filter(visible);return {view:'${view}',width:innerWidth,height:innerHeight,pageWidth:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth>innerWidth,visible:!root.hidden,heading:root.querySelector('h1').innerText,fonts:{heading:getComputedStyle(root.querySelector('h1')).fontFamily,body:getComputedStyle(root).fontFamily},smallTargets:controls.filter(e=>e.getBoundingClientRect().height<44).map(e=>({text:e.innerText||e.getAttribute('aria-label'),height:e.getBoundingClientRect().height})),palette:Object.fromEntries(['petal','alice','sky','baby','aqua','orange','peach','beige','steel','baltic'].map(k=>[k,getComputedStyle(document.documentElement).getPropertyValue('--'+k).trim()])),background:getComputedStyle(root.querySelector('${view==='vault'?'.vault':'.container'}')).backgroundColor,controls:controls.length};})()`);
  const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
  await writeFile(new URL(`${view}-${name}.png`,out),Buffer.from(screenshot.data,'base64'));
  results.push({size:name,...report});
 }
}
// Check review switching, local save feedback, keyboard focus and mobile disclosure.
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
await send('Page.navigate',{url:'http://127.0.0.1:4173/preview.html#portfolio'});await new Promise(r=>setTimeout(r,200));
await evaluate(`document.getElementById('vault-tab').click()`);await new Promise(r=>setTimeout(r,100));
const switching=await evaluate(`!document.getElementById('vault-view').hidden && document.getElementById('portfolio-view').hidden`);
await evaluate(`document.querySelector('.vault-mobile summary').click();document.querySelector('.save').click()`);
const interaction=await evaluate(`({menuOpen:document.querySelector('.vault-mobile details').open,saveMessage:document.querySelector('.review-alert').innerText,storage:{local:localStorage.length,session:sessionStorage.length}})`);
await evaluate(`document.querySelector('.draft').focus()`);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
const focus=await evaluate(`({text:document.activeElement.innerText,outline:getComputedStyle(document.activeElement).outlineStyle,outlineWidth:getComputedStyle(document.activeElement).outlineWidth})`);
await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
const reduced=await evaluate(`matchMedia('(prefers-reduced-motion: reduce)').matches`);
const output={browser: (await (await fetch('http://127.0.0.1:9333/json/version')).json()).Browser,results,switching,interaction,focus,reduced,errors};
await writeFile(new URL('results.json',out),JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));ws.close();
