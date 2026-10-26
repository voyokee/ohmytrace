import {StoryPlayback} from './playback.js';
import {esc,visualContext} from './schema.js';
import {parseArtifact} from './share.js';

const levels={globe:'人生 · 全球',chapter:'人生阶段',trip:'旅行',place:'地点',memory:'记忆',closing:'人生 · 下一页'};
export function mountStoryPlayer({enter,cancel,onClose,onEdit,reducedMotion=false}){
  const panel=document.createElement('section');panel.id='story-player';panel.className='glass';panel.hidden=true;panel.setAttribute('aria-label','人生故事回放');document.body.append(panel);
  const playback=new StoryPlayback({enter,cancel,reducedMotion});let artifact;
  function render(state){
    if(!artifact)return;panel.dataset.status=state.status;
    const scene=state.scene,context=scene?visualContext(scene):null,memory=artifact.memories.find(m=>m.id===scene?.memoryId);
    panel.innerHTML=`<div class="story-caption"><div><p class="story-kicker">${esc(levels[scene?.kind]||'人生故事')} · ${state.index+1} / ${state.count}</p>
      <h2 data-story-scene-title>${esc(scene?.title||artifact.title)}</h2><p data-story-scene-description>${esc(scene?.description||'')}</p>
      <small data-story-time>${esc(context?.label||'')}${context?.month===null?' · 季节未知，使用中性场景':''}</small>
      <p class="hint">记录的是到访地点；虚线为推测连接，未知位置不绘制路线。</p>
      ${memory?`<p>${esc(memory.title)}</p><p>${esc(memory.text)}</p>${memory.kind==='photo'&&!memory.image?'<small>这份作品未附照片，可继续观看地点与文字。</small>':''}`:''}
      ${state.error?`<p role="alert">${esc(state.error)}</p>`:''}</div>
      ${memory?.image?`<img class="story-memory-image" src="${memory.image}" alt="${esc(memory.title)}">`:''}</div>
      <div class="story-controls"><button class="btn sm" data-story-previous aria-label="上个镜头">‹</button>
      <button class="btn primary sm" data-story-play>${state.status==='playing'?'暂停':state.status==='paused'?'继续':'播放'}</button>
      <button class="btn sm" data-story-next aria-label="下个镜头">›</button><button class="btn sm" data-story-stop>停止</button>
      <label>速度 <select data-story-speed aria-label="回放速度">${[.5,1,1.5,2,4].map(speed=>`<option value="${speed}" ${speed===state.speed?'selected':''}>${speed}×</option>`).join('')}</select></label>
      <button class="btn sm" data-story-explore>自由探索</button>${onEdit?'<button class="btn sm" data-story-edit>返回编辑</button>':''}<button class="x" data-story-close aria-label="关闭故事">×</button></div>
      <select data-story-jump aria-label="跳转故事镜头">${artifact.orderedScenes.map((s,i)=>`<option value="${i}" ${i===state.index?'selected':''}>${i+1} · ${esc(levels[s.kind])} · ${esc(s.title)}</option>`).join('')}</select>`;
  }
  playback.subscribe(render);
  panel.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-story-play')){if(playback.status==='playing')playback.pause();else if(playback.status==='paused')playback.resume();else playback.play();}
    if(b.hasAttribute('data-story-next'))playback.next();if(b.hasAttribute('data-story-previous'))playback.previous();
    if(b.hasAttribute('data-story-stop'))playback.stop();if(b.hasAttribute('data-story-explore')){playback.pause();document.querySelector('#globe canvas')?.focus();}
    if(b.hasAttribute('data-story-close')){playback.stop();hide();onClose?.();}
    if(b.hasAttribute('data-story-edit')){playback.stop();hide();onEdit?.();}
  });
  panel.addEventListener('change',e=>{if(e.target.hasAttribute('data-story-speed'))playback.setSpeed(Number(e.target.value));if(e.target.hasAttribute('data-story-jump'))playback.seek(Number(e.target.value));});
  function hide(){panel.hidden=true;document.body.classList.remove('story-active');delete document.body.dataset.storyTheme;artifact=null;}
  return {playback,load(input,{autoplay=true}={}){artifact=parseArtifact(input);playback.load(artifact);panel.hidden=false;document.body.classList.add('story-active');document.body.dataset.storyTheme=artifact.visualTheme;render(playback.snapshot());if(autoplay)return playback.play();},hide};
}
