export const SCENE_TEMPLATES = {
  mountain_forest:{label:'雪岭山林',species:{spruce:0.78,broadleaf:0.22},density:1,treeline:3300,
    fog:0.00006,mist:5,particles:'pollen',tone:[1.07,1.12,1.08],wind:0.7,camera:{range:1800,pitch:-19}},
  birch_forest:{label:'白桦薄雾',species:{birch:0.85,spruce:0.15},density:0.9,treeline:2300,
    fog:0.00013,mist:8,particles:'pollen',tone:[1.09,1.04,1.05],wind:0.55,camera:{range:1300,pitch:-17}},
  grassland:{label:'风过草原',species:{grass:0.9,shrub:0.1},density:1,treeline:2900,
    fog:0.000035,mist:2,particles:'firefly',tone:[1.10,1.17,1.05],wind:1,camera:{range:260,pitch:-12}},
  alpine_snow:{label:'雪山云谷',species:{spruce:0.85,shrub:0.15},density:0.45,treeline:4300,
    fog:0.00010,mist:7,particles:'snow',tone:[1.10,0.97,1.10],wind:0.5,camera:{range:2400,pitch:-23}},
  sakura:{label:'樱花微雨',species:{sakura:0.8,broadleaf:0.2},density:0.75,treeline:1800,
    fog:0.000075,mist:3,particles:'petal',tone:[1.08,1.06,1.02],wind:0.65,camera:{range:1600,pitch:-24}},
  coastal_city:{label:'海岸之城',species:{broadleaf:1},density:0.12,treeline:1600,
    fog:0.000035,mist:0,particles:null,tone:[1.07,1.03,1.04],wind:0.25,camera:{range:2400,pitch:-28}},
  desert:{label:'戈壁微风',species:{shrub:.85,grass:.15},density:.08,treeline:3000,
    fog:.000018,mist:0,particles:null,tone:[1.05,1.03,1.08],wind:1.1,camera:{range:1000,pitch:-17}},
};
export function sceneTemplateFor({name='',lat=0,lon=0,height=0,groundHeight=height,month=7,template}={}) {
  let id=template;
  if(!Object.hasOwn(SCENE_TEMPLATES,id)) {
    if(/沙漠|戈壁|敦煌|塔克拉玛干|撒哈拉|库木塔格/.test(name))id='desert';
    else if(/上海|深圳|香港|天津|青岛|大连|厦门|海口|东京|纽约|新加坡/.test(name))id='coastal_city';
    else if(/阿尔山|白桦|大兴安岭/.test(name))id='birch_forest';
    else if(/呼伦贝尔|那拉提|草原|巴音布鲁克|锡林郭勒/.test(name))id='grassland';
    else if(/京都|樱|奈良/.test(name))id='sakura';
    else if(/稻城|亚丁|雪山|珠峰|冰岛|阿尔卑斯/.test(name)||groundHeight>3200)id='alpine_snow';
    else if(lat>44&&lon>105&&lon<140)id='birch_forest';
    else id='mountain_forest';
  }
  const result={id,...SCENE_TEMPLATES[id]};
  if(id==='grassland'&&/那拉提/.test(name))result.treeSpecies={spruce:.85,birch:.15};
  const seasonMonth=lat<0?(month+5)%12+1:month;
  if(id==='birch_forest'&&seasonMonth>=9&&seasonMonth<=10)return {...result,autumn:1,label:'白桦秋色'};
  if(id==='birch_forest'&&(seasonMonth<=2||seasonMonth>=11))return {...result,snow:.7,particles:'snow',label:'白桦冬林'};
  if(id==='sakura'&&(month<3||month>5))return {...result,species:{broadleaf:1},particles:'pollen',label:'四季庭园'};
  return result;
}
