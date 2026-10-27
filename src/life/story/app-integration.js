import {mountStoryPlayer} from './player-ui.js';
import {createStoryBridge} from './viewer-bridge.js';

export function saveStoryBlob(name,blob){const link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export async function mountStoryExperience({privateData,getScope,enter,cancel,applyBridge,restore,onTheme,reducedMotion}){
  let composer;
  const close=()=>{restore();};
  const player=mountStoryPlayer({enter,cancel,reducedMotion,onClose:close,onEdit:privateData?()=>{restore();composer.open({resume:true});}:null});
  async function preview(artifact){applyBridge(createStoryBridge(artifact));onTheme(artifact.visualTheme);await player.load(artifact);}
  if(privateData){
    const {mountStoryComposer}=await import('./composer-ui.js');
    let publisher=null;
    try{const config=await fetch('./runtime-config.json',{cache:'no-store',signal:AbortSignal.timeout(5000)}).then(r=>r.ok?r.json():null);if(config?.publisher&&config?.viewerOrigin){const {PopupStoryPublisher}=await import('./publishing/popup-publisher.js');publisher=new PopupStoryPublisher({origin:config.viewerOrigin});}}catch{}
    composer=mountStoryComposer({publisher,getDataset:privateData,getScope,onPreview:preview,saveBlob:saveStoryBlob,
      onExportPackage:async(artifact,progress)=>{const {createSharePackage}=await import('./package.js');const blob=await createSharePackage(artifact,{onProgress:progress});saveStoryBlob('LifeStory-static.zip',blob);}});
    document.addEventListener('click',e=>{if(e.target.closest('[data-story-compose]'))composer.open();});
  }else{
    const {mountStandaloneViewer}=await import('./viewer.js');mountStandaloneViewer({onLoad:preview,onStop:()=>{player.playback.stop();player.hide();restore();}});
  }
  return {pauseForInteraction(){if(player.playback.status==='playing')player.playback.pause();},composer,player};
}
