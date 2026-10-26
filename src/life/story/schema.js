import {validatePeriod,clone} from '../schema.js';

export const STORY_VERSION=1;
export const SCENE_KINDS=['globe','chapter','trip','place','memory','closing'];
export const THEMES=['atlas','night','paper'];
export const unknown=()=>({precision:'unknown',value:null});
export const periodText=({start,end})=>`${start.precision==='unknown'?'日期未知':start.value} — ${end.precision==='unknown'?'结束未知':end.precision==='ongoing'?'至今':end.value}`;
export const visualContext=scene=>({month:['month','day'].includes(scene.start.precision)?Number(scene.start.value.slice(5,7)):null,label:periodText(scene)});
export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function text(value,max=2000){if(typeof value!=='string'||value.length>max)throw new Error('故事文本过长或格式无效');return value;}
export function keys(value,allowed){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))throw new Error('故事包含未知字段');}
export function list(value,max=10000){if(!Array.isArray(value)||value.length>max)throw new Error('故事列表无效或过大');return value;}
export function ids(value){list(value);value.forEach(v=>text(v,200));if(new Set(value).size!==value.length)throw new Error('故事 ID 重复');return value;}
export function validateScene(scene){
  keys(scene,['id','kind','title','description','start','end','chapterId','tripId','placeId','memoryId','duration']);
  text(scene.id,200);text(scene.title,200);text(scene.description,4000);validatePeriod(scene.start,scene.end);
  if(!SCENE_KINDS.includes(scene.kind)||!Number.isFinite(scene.duration)||scene.duration<.1||scene.duration>120)throw new Error('无效故事镜头');
  for(const k of ['chapterId','tripId','placeId','memoryId'])if(scene[k]!==null)text(scene[k],200);
}
export function validateStory(story){
  keys(story,['schemaVersion','kind','storyId','title','description','selectedChapterIds','selectedTripIds','orderedScenes','visualTheme','cameraPreferences','includedMemories','privacySettings','provenanceSummary']);
  if(story.schemaVersion!==STORY_VERSION||story.kind!=='LifeStory')throw new Error('不支持的 Story 版本');
  text(story.storyId,200);text(story.title,200);text(story.description,4000);
  ids(story.selectedChapterIds);ids(story.selectedTripIds);ids(story.includedMemories);
  list(story.orderedScenes,5000).forEach(validateScene);ids(story.orderedScenes.map(s=>s.id));
  if(!THEMES.includes(story.visualTheme))throw new Error('未知视觉主题');
  keys(story.cameraPreferences,['motion','speed']);
  if(!['system','reduced'].includes(story.cameraPreferences.motion)||!Number.isFinite(story.cameraPreferences.speed)||story.cameraPreferences.speed<.25||story.cameraPreferences.speed>4)throw new Error('无效镜头偏好');
  keys(story.privacySettings,['locationMode','includeNotes','includePhotos','excludedTripIds','excludedMemoryIds','hiddenPlaceIds','placeLabels']);
  const p=story.privacySettings;
  if(!['city','precise','hidden'].includes(p.locationMode)||typeof p.includeNotes!=='boolean'||typeof p.includePhotos!=='boolean')throw new Error('无效隐私设置');
  for(const k of ['excludedTripIds','excludedMemoryIds','hiddenPlaceIds'])ids(p[k]);
  if(!p.placeLabels||Object.getPrototypeOf(p.placeLabels)!==Object.prototype)throw new Error('无效分享地点名称');
  Object.entries(p.placeLabels).forEach(([id,label])=>{text(id,200);text(label,200);});
  keys(story.provenanceSummary,['method']);text(story.provenanceSummary.method,200);
  return story;
}
export function parseStory(input){return validateStory(clone(typeof input==='string'?JSON.parse(input):input));}
