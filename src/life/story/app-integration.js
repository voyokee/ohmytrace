import {mountStoryPlayer} from './player-ui.js';
import {createStoryBridge} from './viewer-bridge.js';
import {projectShare} from './share.js';
import {saveDocument} from '../../platform/document-save.js';

export function saveStoryBlob(name,blob){return saveDocument(name,blob);}
export async function mountStoryExperience({privateData,getScope,enter,cancel,applyBridge,restore,onTheme,onError,reducedMotion}){
  let composer,introDone=null,introOff=null,introTimer=null,introRemaining=20000,introStarted=null;
  function finishIntro(){if(!introDone)return;const done=introDone;introDone=null;clearTimeout(introTimer);introOff?.();introOff=null;player.playback.stop();player.hide();document.body.classList.remove('first-intro');restore();done();}
  const close=()=>{if(introDone)finishIntro();else restore();};
  const player=mountStoryPlayer({enter,cancel,reducedMotion,onClose:close,onEdit:privateData?()=>{restore();composer.open({resume:true});}:null});
  async function preview(artifact){applyBridge(createStoryBridge(artifact));onTheme(artifact.visualTheme);await player.load(artifact);}
  if(privateData){
    const {mountStoryComposer}=await import('./composer-ui.js');
    let publisher=null;
    try{const config=await fetch('./runtime-config.json',{cache:'no-store',signal:AbortSignal.timeout(5000)}).then(r=>r.ok?r.json():null);if(config?.publisher&&config?.viewerOrigin){const {PopupStoryPublisher}=await import('./publishing/popup-publisher.js');publisher=new PopupStoryPublisher({origin:config.viewerOrigin});}}catch{}
    composer=mountStoryComposer({publisher,getDataset:privateData,getScope,onPreview:preview,saveBlob:saveStoryBlob,
      onExportPackage:async(artifact,progress)=>{const {createSharePackage}=await import('./package.js');const blob=await createSharePackage(artifact,{onProgress:progress});await saveStoryBlob('LifeStory-static.zip',blob);}});
    document.addEventListener('click',e=>{if(e.target.closest('[data-story-compose]'))composer.open();const quick=e.target.closest('[data-story-quick]');if(quick)quickPlay(quick.dataset.storyQuick).catch(error=>onError?.(error));});
  }else{
    const {mountStandaloneViewer}=await import('./viewer.js');mountStandaloneViewer({onLoad:preview,onStop:()=>{player.playback.stop();player.hide();restore();}});
  }
  // The owner's own replay never leaves this device, so it shows real names and notes;
  // sharing still starts from the composer's privacy defaults.
  async function quickPlay(source){const story=composer.prepare(source),data=privateData();
    await preview(projectShare(data,{...story,privacySettings:{...story.privacySettings,locationMode:'precise',includeNotes:true}},{images:{}}));}
  async function intro(done){
    const {composeStory}=await import('./compose.js');const data=privateData(),story=composeStory(data),seen=new Set();
    const places=story.orderedScenes.filter(s=>s.kind==='place'&&!seen.has(s.placeId)&&seen.add(s.placeId)).slice(0,4);
    if(!places.length){done();return;}story.selectedTripIds=[];story.selectedChapterIds=[];story.orderedScenes=[story.orderedScenes[0],...places,story.orderedScenes.at(-1)].map(s=>({...s,tripId:null,chapterId:null,duration:2}));
    story.title='照片里的这些地方';story.privacySettings.locationMode='precise';introDone=done;document.body.classList.add('first-intro');
    introRemaining=20000;introStarted=null;introOff=player.playback.subscribe(s=>{
      if(introStarted!==null){introRemaining-=performance.now()-introStarted;introStarted=null;}clearTimeout(introTimer);
      if(s.status==='ended'||s.status==='error'){finishIntro();return;}
      if(s.status==='playing'){introStarted=performance.now();introTimer=setTimeout(finishIntro,Math.max(0,introRemaining));}
    });
    // The introductory tour has a wall-clock cap including camera flights. Background pauses follow the player.
    try{await preview(projectShare(data,story));}catch(error){finishIntro();throw error;}
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)player.playback.pause();});
  return {intro:privateData?intro:null,pauseForInteraction(){if(player.playback.status==='playing')player.playback.pause();},composer,player,replay:privateData?quickPlay:null};
}
