export async function readAccessInput(){
 const raw=!!process.stdin.setRawMode&&process.stdin.isTTY;if(!raw)throw new Error('Use a retained TTY for hidden access input');process.stdin.setRawMode(true);
 console.log('Ready for scoped publisher access JSON on stdin (input is hidden).');
 return new Promise((resolve,reject)=>{let value='';const clean=()=>{process.stdin.off('data',read);process.stdin.setRawMode(false);process.stdin.pause();};const read=chunk=>{value+=chunk;if(value.includes('\u0003')){clean();reject(new Error('Cancelled'));return;}if(/[\r\n]/.test(value)){clean();try{resolve(JSON.parse(value.split(/[\r\n]/)[0]));}catch{reject(new Error('Invalid hidden input'));}}};process.stdin.on('data',read);process.stdin.resume();});
}
