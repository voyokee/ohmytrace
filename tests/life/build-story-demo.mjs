// Explicitly fictional demo generation. Never read a user's database or media.
import {readFile,writeFile} from 'node:fs/promises';
import {storyFixture} from './story-fixtures.mjs';
import {importCSVInto} from '../../src/life/legacy.js';
import {composeStory,setStoryMemories} from '../../src/life/story/compose.js';
import {projectShare,cleanJPEG} from '../../src/life/story/share.js';
const f=storyFixture();
importCSVInto(f.data,'日期,行程,地点,类型,备注,坐标\n2026,再访北京,天津,旅行,,"39.1,117.2"','append');
const story=setStoryMemories(composeStory(f.data,{title:'求学与城市之间 · 虚构人生故事',chapterIds:[f.chapter,f.overlap],tripIds:[f.trip.id,f.repeat.id]}),f.data,[f.photo]);
story.description='虚构示例：重叠的人生阶段、同城重访、未知地点与一张授权缩略图。';story.privacySettings.includePhotos=true;
const image='data:image/jpeg;base64,'+Buffer.from(cleanJPEG(await readFile(new URL('./fixtures/photo-base.jpg',import.meta.url)))).toString('base64');
await writeFile(new URL('../../src/life/story/demo.story.json',import.meta.url),JSON.stringify(projectShare(f.data,story,{images:{[f.photo]:image}}),null,2));
console.log('Generated fictional Story demo; no private data read.');
