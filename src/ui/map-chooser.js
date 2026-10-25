export function createMapChooser({bottom=()=>innerHeight-16}={}) {
  const panel=document.createElement('section');panel.id='map-chooser';panel.className='glass';panel.hidden=true;
  panel.setAttribute('role','dialog');panel.setAttribute('aria-label','足迹详情');document.body.append(panel);
  let trigger,kind;
  function close(restore=false) {
    if(panel.hidden)return false;panel.hidden=true;trigger?.setAttribute('aria-expanded','false');
    if(restore&&trigger?.isConnected)trigger.focus();kind=undefined;return true;
  }
  const outside=e=>{if(!panel.hidden&&!panel.contains(e.target)&&!trigger?.contains(e.target))close();};
  document.addEventListener('pointerdown',outside);
  return {
    open({title,subtitle,items,anchor,element,primary,type='places'}) {
      close();trigger=element;kind=type;panel.replaceChildren();panel.dataset.kind=type;
      const head=document.createElement('div');head.className='chooser-head';
      const heading=document.createElement('h3');heading.textContent=title;head.append(heading);
      const exit=document.createElement('button');exit.type='button';exit.className='x';exit.textContent='×';exit.setAttribute('aria-label','关闭足迹详情');exit.onclick=()=>close(true);head.append(exit);panel.append(head);
      if(subtitle){const sub=document.createElement('p');sub.className='chooser-sub';sub.textContent=subtitle;panel.append(sub);}
      const list=document.createElement('div');list.className='chooser-list scroll';
      for(const item of items) {
        const b=document.createElement('button');b.type='button';b.className='chooser-item';
        const name=document.createElement('span');name.textContent=item.title;b.append(name);
        if(item.meta){const meta=document.createElement('small');meta.textContent=item.meta;b.append(meta);}
        b.onclick=()=>{close();item.select();};list.append(b);
      }
      panel.append(list);
      if(primary){const b=document.createElement('button');b.type='button';b.className='btn chooser-primary';b.textContent=primary.title;b.onclick=()=>{close();primary.select();};panel.append(b);}
      const width=Math.min(340,innerWidth-24),maxHeight=Math.max(140,Math.min(420,bottom()-24));
      panel.style.width=width+'px';panel.style.maxHeight=maxHeight+'px';panel.hidden=false;
      panel.style.left=Math.max(12,Math.min(innerWidth-width-12,anchor.x-width/2))+'px';
      panel.style.top=Math.max(12,Math.min(anchor.y+22,bottom()-Math.min(panel.offsetHeight,maxHeight)-12))+'px';
      trigger?.setAttribute('aria-expanded','true');exit.focus({preventScroll:true});
    },
    close,
    get kind(){return kind;},
    get element(){return panel;},
    dispose(){document.removeEventListener('pointerdown',outside);panel.remove();}
  };
}
