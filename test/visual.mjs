import {spawn} from 'node:child_process'
import {mkdtempSync,writeFileSync,rmSync,mkdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const profile=mkdtempSync(join(tmpdir(),'atlas-chrome-'))
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless','--disable-gpu','--hide-scrollbars','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']})
let stderr=''
const wsUrl=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(stderr||'Chrome timeout')),10000);chrome.stderr.on('data',d=>{stderr+=d;const marker='DevTools listening on ';const start=stderr.indexOf(marker);if(start>=0){const url=stderr.slice(start+marker.length).split('\n')[0].trim();clearTimeout(timer);resolve(url)}});chrome.once('error',reject)})
const ws=new WebSocket(wsUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});let n=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const {r,j}=pending.get(m.id);pending.delete(m.id);m.error?j(new Error(m.error.message)):r(m.result)}};const send=(method,params={},sessionId)=>new Promise((r,j)=>{const id=++n;pending.set(id,{r,j});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}))})
mkdirSync(new URL('../artifacts/',import.meta.url),{recursive:true})
async function capture(name,width,height,mobile,view='Таблица'){
  const {targetId}=await send('Target.createTarget',{url:'about:blank'});const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true})
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile},sessionId);await send('Page.enable',{},sessionId);await send('Runtime.enable',{},sessionId);await send('Page.navigate',{url:'http://127.0.0.1:3217'},sessionId);await new Promise(r=>setTimeout(r,1100))
  const switched=await send('Runtime.evaluate',{expression:`(()=>{const button=[...document.querySelectorAll('.view-toggle-button')].find(x=>x.textContent.includes(${JSON.stringify(view)}));if(!button)return false;button.click();return true})()`,returnByValue:true},sessionId)
  if(!switched.result.value)throw new Error(name+': view toggle not found');await new Promise(r=>setTimeout(r,250))
  const result=await send('Runtime.evaluate',{expression:`({innerWidth,scrollWidth:document.documentElement.scrollWidth,title:document.title,companies:document.body.innerText.includes('Альфа Логистика')||!!document.querySelector('[aria-label="Открыть Альфа Логистика"]'),heading:document.body.innerText.includes('без конфликтов'),board:!!document.querySelector('.board-shell'),map:!!document.querySelector('.constellation'),body:document.body.innerText.slice(0,200)})`,returnByValue:true},sessionId)
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true},sessionId);writeFileSync(new URL('../artifacts/'+name+'.png',import.meta.url),Buffer.from(shot.data,'base64'));const v=result.result.value
  if(v.scrollWidth>v.innerWidth)throw new Error(`${name}: horizontal overflow ${JSON.stringify(v)}`);if(!v.heading||!v.companies)throw new Error(`${name}: unexpected UI ${JSON.stringify(v)}`);if(view==='Доска'&&!v.board)throw new Error(name+': board missing');if(view==='Карта'&&!v.map)throw new Error(name+': map missing');await send('Target.closeTarget',{targetId});return v
}
try{
  const results={}
  for(const [name,width,height,mobile,view] of [['desktop',1440,1000,false,'Таблица'],['mobile',390,844,true,'Таблица'],['board-desktop',1440,1000,false,'Доска'],['board-mobile',390,844,true,'Доска'],['map-desktop',1440,1000,false,'Карта'],['map-mobile',390,844,true,'Карта']])results[name]=await capture(name,width,height,mobile,view)
  console.log(JSON.stringify(results,null,2))
}finally{ws.close();chrome.kill();await new Promise(r=>chrome.once('exit',r));rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
