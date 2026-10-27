import {StoryPlayback} from './playback.js';
import {esc} from './schema.js';
import {parseArtifact} from './share.js';

const levels={globe:'总览',chapter:'人生阶段',trip:'旅行',place:'地点',memory:'照片记忆',closing:'尾声'};
// Viewers only need to know when a scene happened; unknown bounds are simply omitted.
function when({start,end}){
  const a=start.precision==='unknown'?'':start.value,b=end.precision==='ongoing'?'至今':end.precision==='unknown'?'':end.value;
  return !a?b:!b||a===b?a:`${a} — ${b}`;
}
export function mountStoryPlayer({enter,cancel,onClose,onEdit,reducedMotion=false}){
  const panel=document.createElement('section');panel.id='story-player';panel.className='glass';panel.hidden=true;panel.setAttribute('aria-label','回放');document.body.append(panel);
  const playback=new StoryPlayback({enter,cancel,reducedMotion});let artifact;
  function render(state){
    if(!artifact)return;panel.dataset.status=state.status;
    const scene=state.scene,memory=artifact.memories.find(m=>m.id===scene?.memoryId),time=scene?when(scene):'';
    const description=scene?.description||(scene?.kind==='globe'?artifact.description:'');
    const more=panel.querySelector('.story-more')?.open?' open':'';
    panel.innerHTML=`<div class="story-head"><p class="story-kicker">${esc(levels[scene?.kind]||'回放')} · ${state.index+1} / ${state.count}</p>
      ${onEdit?'<button class="story-link" data-story-edit>分享</button>':''}<button class="x" data-story-close aria-label="关闭回放">×</button></div>
      <div class="story-caption"><div class="story-text"><h2 data-story-scene-title>${esc(scene?.title||artifact.title)}</h2>
      ${time?`<p class="story-time" data-story-time>${esc(time)}</p>`:''}
      ${description?`<p class="story-description" data-story-scene-description>${esc(description)}</p>`:''}
      ${memory?`<p>${esc(memory.title)}</p><p>${esc(memory.text)}</p>`:''}
      ${state.error?`<p role="alert">${esc(state.error)}</p>`:''}</div>
      ${memory?.image?`<img class="story-memory-image" src="${memory.image}" alt="${esc(memory.title)}">`:''}</div>
      <div class="story-controls"><button class="btn story-step" data-story-previous aria-label="上一段" ${state.index<=0?'disabled':''}>‹</button>
      <button class="btn primary story-play" data-story-play aria-label="${state.status==='playing'?'暂停':'播放'}">${state.status==='playing'?'❚❚':'▶'}</button>
      <button class="btn story-step" data-story-next aria-label="下一段" ${state.index>=state.count-1?'disabled':''}>›</button>
      <div class="story-dots" role="group" aria-label="回放进度">${artifact.orderedScenes.map((s,i)=>`<button data-story-dot="${i}" class="${i<state.index?'done':i===state.index?'on':''}" aria-label="第 ${i+1} 段 · ${esc(s.title)}" ${i===state.index?'aria-current="step"':''}></button>`).join('')}</div></div>
      <details class="story-more"${more}><summary>更多</summary><div class="story-more-body">
      <label>速度 <select data-story-speed aria-label="回放速度">${[.5,1,1.5,2,4].map(speed=>`<option value="${speed}" ${speed===state.speed?'selected':''}>${speed}×</option>`).join('')}</select></label>
      <label>跳到 <select data-story-jump aria-label="跳转到某一段">${artifact.orderedScenes.map((s,i)=>`<option value="${i}" ${i===state.index?'selected':''}>${i+1} · ${esc(levels[s.kind])} · ${esc(s.title)}</option>`).join('')}</select></label>
      <button class="btn sm" data-story-stop>回到开头</button></div></details>`;
  }
  playback.subscribe(render);
  panel.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-story-play')){if(playback.status==='playing')playback.pause();else if(playback.status==='paused')playback.resume();else playback.play();}
    if(b.hasAttribute('data-story-next'))playback.next();if(b.hasAttribute('data-story-previous'))playback.previous();
    if(b.hasAttribute('data-story-stop'))playback.stop();if(b.hasAttribute('data-story-dot'))playback.seek(Number(b.dataset.storyDot));
    if(b.hasAttribute('data-story-close')){playback.stop();hide();onClose?.();}
    if(b.hasAttribute('data-story-edit')){playback.stop();hide();onEdit?.();}
  });
  panel.addEventListener('change',e=>{if(e.target.hasAttribute('data-story-speed'))playback.setSpeed(Number(e.target.value));if(e.target.hasAttribute('data-story-jump'))playback.seek(Number(e.target.value));});
  function hide(){panel.hidden=true;document.body.classList.remove('story-active');delete document.body.dataset.storyTheme;artifact=null;}
  return {playback,load(input,{autoplay=true}={}){artifact=parseArtifact(input);playback.load(artifact);panel.hidden=false;document.body.classList.add('story-active');document.body.dataset.storyTheme=artifact.visualTheme;render(playback.snapshot());if(autoplay)return playback.play();},hide};
}
