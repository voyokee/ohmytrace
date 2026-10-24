// Fictional fixtures for local visual checks. The demo path never reads or writes saved trips.
export const SCENE_DEMOS={
  mountain_forest:{name:'新疆天山',title:'雪岭山林',lat:43.485,lon:87.08,month:8},
  birch_forest:{name:'阿尔山白桦林',title:'白桦薄雾',lat:47.19,lon:119.92,month:8},
  grassland:{name:'呼伦贝尔草原',title:'风过草原',lat:49.32,lon:119.17,month:8},
  alpine_snow:{name:'稻城亚丁',title:'雪山云谷',lat:28.435,lon:100.325,month:10},
  sakura:{name:'日本京都',title:'樱花微雨',lat:35.0116,lon:135.7681,month:4},
  coastal_city:{name:'上海',title:'海岸之城',lat:31.23,lon:121.47,month:6},
  desert:{name:'敦煌戈壁',title:'戈壁微风',lat:40.04,lon:94.51,month:9},
};
export function demoCsv(demo) {
  return `日期,行程,地点,类型,备注,坐标\n2025-${String(demo.month).padStart(2,'0')},${demo.title},${demo.name},旅行,虚构景观演示,"${demo.lat},${demo.lon}"`;
}
