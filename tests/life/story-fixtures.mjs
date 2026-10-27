import {emptyDataset,upsertChapter,addMemory,addEvidence} from '../../src/life/schema.js';
import {importCSVInto} from '../../src/life/legacy.js';
export function storyFixture(){
  const data=emptyDataset('user');
  importCSVInto(data,'日期,行程,地点,类型,备注,坐标\n2024~至今,,秘密住宅 123 单元,现居地,PRIVATE_HOME_NOTE,"1.312345,103.812345"\n2025-05,北京实习,北京,旅行,PRIVATE_NOTE,"39.912345,116.412345"\n2025-05,北京实习,未知博物馆,旅行,PRIVATE_UNKNOWN,\n2026,再访北京,北京,旅行,,"39.912345,116.412345"\n,私人旅行,秘密地点,旅行,PRIVATE_TRIP,"22.556789,114.123456"');
  const [trip,repeat,secret]=data.trips;
  const chapter=upsertChapter(data,{title:'新加坡硕士',type:'study',start:'2024',end:'2026',homeAnchors:[data.residences[0].placeId],relatedTripIds:[trip.id,repeat.id]});
  const overlap=upsertChapter(data,{title:'北京实习阶段',type:'work',start:'2025',end:'2025',relatedTripIds:[trip.id]});
  const photo=addMemory(data,{kind:'photo',title:'获准分享的照片',start:'2025-05',end:'2025-05',tripIds:[trip.id],placeIds:[data.visits.find(v=>v.tripId===trip.id).placeId],uri:'file:///PRIVATE_PATH/phone/photo.jpg',source:{kind:'photo-exif',device:'PRIVATE_DEVICE'}});
  const privatePhoto=addMemory(data,{kind:'photo',title:'PRIVATE_PHOTO',start:'2025',tripIds:[trip.id]});
  data.evidence.push({id:'PRIVATE_DEVICE_EVIDENCE',state:'observed',source:{kind:'device',serial:'PRIVATE_SERIAL'},revisions:[]});
  data.places[0].evidenceIds.push('PRIVATE_DEVICE_EVIDENCE');
  return {data,chapter,overlap,trip,repeat,secret,photo,privatePhoto};
}
