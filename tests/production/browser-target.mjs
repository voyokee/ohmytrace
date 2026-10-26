// Optional HTTPS target for the existing fictional end-to-end acceptances.
// A private Site's service token enters through stdin only, never argv, files,
// page JavaScript, screenshots or headers sent to another origin.
export async function browserTarget(fallback){
  const url=process.env.LIFE_APP_URL||fallback,origin=new URL(url).origin;let token=null;
  if(process.env.LIFE_APP_AUTH_STDIN==='1'){
    const rawMode=!!process.stdin.setRawMode&&process.stdin.isTTY;if(rawMode)process.stdin.setRawMode(true);
    console.log('Ready for private Site access JSON on stdin (input is not echoed).');
    const input=await new Promise((resolve,reject)=>{
      let raw='';const clean=()=>{process.stdin.off('data',receive);process.stdin.off('end',ended);if(rawMode)process.stdin.setRawMode(false);process.stdin.pause();};
      const ended=()=>{clean();reject(new Error('Access input closed before JSON; use a retained TTY'));};
      const receive=chunk=>{raw+=chunk;if(raw.includes('\u0003')){clean();reject(new Error('Access input cancelled'));return;}const end=raw.search(/[\r\n]/);if(end>=0){clean();try{resolve(JSON.parse(raw.slice(0,end)));}catch{reject(new Error('Invalid access JSON'));}}};
      process.stdin.on('data',receive);process.stdin.once('end',ended);process.stdin.resume();
    });
    token=input.token;if(typeof token!=='string'||!token)throw new Error('Missing private Site access token');
  }
  return {url,async fetch(input){
    let address=new URL(input,url);
    for(let redirects=0;redirects<6;redirects++){
      let response;try{response=await fetch(address,{redirect:'manual',headers:token&&address.origin===origin?{'OAI-Sites-Authorization':'Bearer '+token}:{},signal:AbortSignal.timeout(30000)});}catch{throw new Error('Site resource request failed');}
      if([301,302,303,307,308].includes(response.status)&&response.headers.get('location')){address=new URL(response.headers.get('location'),address);continue;}
      return response;
    }
    throw new Error('Too many Site redirects');
  },async authorize(context){
    if(!token)return;
    await context.route(value=>value.origin===origin,async route=>{
      try{
        const headers={...route.request().headers(),'OAI-Sites-Authorization':'Bearer '+token};
        let response=await route.fetch({maxRedirects:0,headers});
        for(let redirects=0;redirects<5&&['GET','HEAD'].includes(route.request().method())&&[301,302,303,307,308].includes(response.status());redirects++){
          const location=response.headers()['location'];if(!location)break;
          const next=new URL(location,response.url());if(next.origin!==origin)break;
          response=await context.request.fetch(next.href,{method:route.request().method(),maxRedirects:0,headers});
        }
        await route.fulfill({response});
      }catch{await route.abort().catch(()=>{});}
    });
  }};
}
