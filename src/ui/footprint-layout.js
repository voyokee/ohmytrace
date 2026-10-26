const overlap=(a,b,pad=3)=>a.left<b.right+pad&&a.right>b.left-pad&&a.top<b.bottom+pad&&a.bottom>b.top-pad;
const rect=(x,y,w,h)=>({left:x,top:y,right:x+w,bottom:y+h});

// Compact groups around real projected footprints, never a transitive chain across a country.
// Seed order is stable; a small hysteresis keeps existing groups during gentle camera movement.
export function clusterFootprints(points,{radius=28,previousSeeds=[]}={}) {
  const previous=new Set(previousSeeds),cell=radius*1.15,grid=new Map(),groups=[];
  const order=points.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)).slice().sort((a,b)=>
    ((b.priority||0)+(previous.has(b.id)?2:0))-((a.priority||0)+(previous.has(a.id)?2:0))||(a.id<b.id?-1:a.id>b.id?1:0));
  for(const p of order) {
    const gx=Math.floor(p.x/cell),gy=Math.floor(p.y/cell);let nearest,dist=Infinity;
    for(let y=gy-1;y<=gy+1;y++)for(let x=gx-1;x<=gx+1;x++)for(const g of grid.get(`${x}:${y}`)||[]) {
      const d=Math.hypot(p.x-g.x,p.y-g.y),limit=radius*(previous.has(g.key)?1.15:1);
      if(d<=limit&&d<dist){nearest=g;dist=d;}
    }
    // Existing seeds survive a small translation. They merge only after a meaningful
    // zoom-out, or when a newly selected/home point has higher semantic priority.
    if(nearest&&previous.has(p.id)&&nearest.priority<=(p.priority||0)+2&&dist>radius*.8)nearest=undefined;
    if(nearest)nearest.members.push(p);
    else {
      const g={key:p.id,x:p.x,y:p.y,seed:p,members:[p],priority:p.priority||0};groups.push(g);
      const key=`${gx}:${gy}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(g);
    }
  }
  return groups;
}

export function layoutFootprints(points,{width,height,obstacles=[],labelLimit=8,...options}={}) {
  const groups=clusterFootprints(points,options),labels=[];
  const dots=groups.map(g=>rect(g.x-(g.members.length>1?18:7),g.y-(g.members.length>1?18:7),g.members.length>1?36:14,g.members.length>1?36:14));
  for(const g of groups) {
    g.label=null;
    if(labels.length>=labelLimit)continue;
    const w=g.seed.labelWidth||100,h=g.seed.labelHeight||25,r=g.members.length>1?18:7;
    const choices=[[r+8,-h/2],[r+8,6],[-r-8-w,-h/2],[-r-8-w,6],[-w/2,-r-h-7],[-w/2,r+7]];
    for(const [dx,dy]of choices) {
      const box=rect(g.x+dx,g.y+dy,w,h);
      if(box.left<10||box.right>width-10||box.top<10||box.bottom>height-10)continue;
      if([...obstacles,...labels,...dots].some(b=>overlap(box,b)))continue;
      g.label={dx,dy,...box};labels.push(box);break;
    }
  }
  return groups;
}
