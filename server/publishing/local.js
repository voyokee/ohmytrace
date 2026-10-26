import {HttpStoryPublisher} from '../../src/life/story/publishing/publisher.js';
import {createPublicationService} from './service.js';
import {memoryPublicationStorage} from './memory.js';
export function createLocalStoryPublisher({owner='local-owner',storage=memoryPublicationStorage()}={}){
 const service=createPublicationService({...storage,identify:async()=>owner,origin:'http://localhost',editorOrigin:'http://localhost:8765'});
 return new HttpStoryPublisher({origin:'http://localhost',fetch:async(url,options)=>{if(options.signal?.aborted)throw new DOMException('已取消','AbortError');return service.handle(new Request(url,options));}});
}
