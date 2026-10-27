"""Reproduce country packs from pinned Natural Earth v5.1.2 GeoJSON sources.
Download ne_50m_admin_0_countries, ne_10m_admin_1_states_provinces and
ne_10m_populated_places (full, for NAME_ZH) into INPUT as countries.json/admin1-full.json/cities.json.
No invented rectangles or city boundaries. Coordinates quantized to 4 decimals.
"""
import json, pathlib, sys
source=pathlib.Path(sys.argv[1]);out=pathlib.Path(__file__).resolve().parents[1]/'src/life/geocoding/data';out.mkdir(parents=True,exist_ok=True)
def load(n):return json.loads((source/(n+'.json')).read_text())['features']
def rounded(x):return [rounded(i) for i in x] if isinstance(x,list) else round(x,4)
def polygons(g):return g['coordinates'] if g['type']=='MultiPolygon' else [g['coordinates']]
def simplify_line(points,tolerance=0.005):
 if len(points)<=4:return points
 # Iterative Douglas-Peucker; split closed rings to avoid identical endpoints.
 def segment(seq):
  keep={0,len(seq)-1};stack=[(0,len(seq)-1)]
  while stack:
   a,b=stack.pop();x,y=seq[a];dx=seq[b][0]-x;dy=seq[b][1]-y;den=dx*dx+dy*dy;best=tolerance*tolerance;at=None
   for i in range(a+1,b):
    px,py=seq[i];t=max(0,min(1,((px-x)*dx+(py-y)*dy)/den)) if den else 0;dist=(px-x-t*dx)**2+(py-y-t*dy)**2
    if dist>best:best=dist;at=i
   if at is not None:keep.add(at);stack.extend([(a,at),(at,b)])
  return [seq[i] for i in sorted(keep)]
 mid=len(points)//2;result=segment(points[:mid+1])[:-1]+segment(points[mid:])
 return result if len(result)>=4 else points

def geom(g):
 polys=[[[*simplify_line(r)] for r in poly] for poly in polygons(g)]
 return {'type':g['type'],'coordinates':rounded(polys if g['type']=='MultiPolygon' else polys[0])}
def bbox(g):
 pts=[p for poly in polygons(g) for ring in poly for p in ring];return [min(p[0] for p in pts),min(p[1] for p in pts),max(p[0] for p in pts),max(p[1] for p in pts)]
def write(p,x):p.write_text(json.dumps(x,ensure_ascii=False,separators=(',',':'))+'\n')
packs={};index=[]
for f in load('countries'):
 p=f['properties'];code=p['ADM0_A3'];name=p.get('NAME_ZH') or p['NAME'];g=geom(f['geometry']);packs[code]={'country':{'code':code,'name':name,'geometry':g},'admins':[],'cities':[]};index.append({'code':code,'name':name,'bounds':[bbox({'type':'Polygon','coordinates':poly}) for poly in polygons(g)]})
for f in load('admin1-full'):
 p=f['properties'];code=p['adm0_a3']
 if code in packs and f['geometry']:
  g=geom(f['geometry']);packs[code]['admins'].append({'name':p.get('name_zh') or p['name'],'geometry':g,'bounds':[bbox({'type':'Polygon','coordinates':poly}) for poly in polygons(g)]})
# Cities are point samples, never containment evidence. The app is Chinese: NAME_ZH is
# shown when present and the English source name is preserved as nameEn.
for f in load('cities'):
 p={k.upper():v for k,v in f['properties'].items()};code=p['ADM0_A3']
 if code in packs:
  zh=(p.get('NAME_ZH') or '').strip();zh=zh[:-1] if len(zh)>2 and zh.endswith('市') else zh;city={'name':zh or p['NAME'],'admin':p.get('ADM1NAME'),'coordinates':{'latitude':p['LATITUDE'],'longitude':p['LONGITUDE']}}
  if zh:city['nameEn']=p['NAME']
  packs[code]['cities'].append(city)
for code,pack in packs.items():write(out/(code+'.json'),pack)
write(out/'index.json',{'source':'Natural Earth v5.1.2','license':'Public Domain','crs':'WGS84','countries':index})
print(len(packs),'country packs;',sum(p.stat().st_size for p in out.glob('*.json')),'bytes')
