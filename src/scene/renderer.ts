import {frameAt,guestState,waiterState,seats,along,type Clip,type SceneManifest,type Point} from './timeline'
const base='./scene-v3/'
export class RestaurantRenderer {
 private images=new Map<string,HTMLImageElement>()
 private manifest!:SceneManifest
 private ctx:CanvasRenderingContext2D
 private frames=0
 constructor(private canvas:HTMLCanvasElement){const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw new Error('画布不可用');this.ctx=ctx}
 async load(){
  const response=await fetch(base+'manifest.json');if(!response.ok)throw new Error('场景清单加载失败');this.manifest=await response.json()
  const files=[this.manifest.background,...Object.values(this.manifest.clips).map(c=>c.file),...Object.values(this.manifest.food)]
  await Promise.all(files.map(async file=>{const image=new Image();image.src=base+file;await image.decode();this.images.set(file,image)}))
  this.canvas.width=2560;this.canvas.height=864;this.canvas.dataset.ready='true'
 }
 private sprite(id:string,x:number,y:number,scale:number,time:number,flip=false,seated=false,opacity=1){
  const c=this.manifest.clips[id];if(!c)return
  const image=this.images.get(c.file)!;const frame=frameAt(c,time),root=seated&&c.seatRoot?c.seatRoot:c.root,ctx=this.ctx
  ctx.save();ctx.globalAlpha=opacity;ctx.translate(x,y);ctx.scale(flip?-scale:scale,scale)
  ctx.drawImage(image,frame%c.cols*c.tile.width,Math.floor(frame/c.cols)*c.tile.height,c.tile.width,c.tile.height,-root.x,-root.y,c.canvas.width,c.canvas.height);ctx.restore()
 }
 private shadow(x:number,y:number,w:number,h:number,alpha=.25){
  const c=this.ctx;c.save();c.translate(x,y);c.scale(w,h);const g=c.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,`rgba(35,21,12,${alpha})`);g.addColorStop(1,'rgba(35,21,12,0)');c.fillStyle=g;c.beginPath();c.arc(0,0,1,0,Math.PI*2);c.fill();c.restore()
 }
 private food(kind:string,state:string,x:number,y:number,scale=.42){const im=this.images.get(this.manifest.food[`food_${kind}_${state}_001`]||'');if(im)this.ctx.drawImage(im,x-im.width*scale/2,y-im.height*scale/2,im.width*scale,im.height*scale)}
 private foreground(points:Point[]){const c=this.ctx;c.save();c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.clip();c.drawImage(this.images.get(this.manifest.background)!,0,0,2560,864);c.restore()}
 private light(x:number,y:number,r:number,color:string,intensity:number){const c=this.ctx;c.save();c.globalCompositeOperation='screen';c.globalAlpha=intensity;const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'rgba(255,130,45,0)');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);c.restore()}
 render(time:number,mood:string){
  if(!this.manifest)return
  const c=this.ctx,t=time*1000;c.clearRect(0,0,2560,864);c.drawImage(this.images.get(this.manifest.background)!,0,0,2560,864)
  const chefPhase=time%24,chefAction=mood==='panic'?'panic':chefPhase<6?'chop':chefPhase<13?'stir':chefPhase<19?'toss':'plate'
  const chefX=1378
  this.light(1265,389,150,'#ff8b30',.16+Math.sin(time*17)*.03)
  this.sprite('fx_flame',1204,396,.28,t);this.sprite('fx_flame',1443,400,.23,t+210)
  this.sprite('fx_steam',1285+Math.sin(time)*4,338,.36,t,false,false,.23)
  this.sprite('fx_steam',1540,335,.22,t+180,false,false,.16)
  // 炉火属于后排灶台，必须先于厨师绘制，避免火焰叠在脸和帽子上。
  this.shadow(chefX,536,93,16,.24);this.sprite('char_chef_'+chefAction,chefX,557,.54,t)
  // 家具已烘焙进背景：只重绘同图的柜体遮挡，不再叠第二套桌柜。
  this.foreground([{x:864,y:565},{x:1974,y:577},{x:1971,y:824},{x:873,y:824}])
  const actors=seats.map((seat,index)=>{const s=guestState(time,index);const seated=!['enter','leave','absent'].includes(s.state);let x:number=seat.x,y:number=seat.y,flip=seat.direction==='back'
   if(!seated&&s.state!=='absent'){
    const foot={x:seat.x,y:seat.y+170*seat.scale},entry={x:index===2?2640:-80,y:842},turn={x:index===2?2158:615,y:842}
    const path=[entry,turn,foot],pos=along(s.state==='leave'?[...path].reverse():path,s.progress);x=pos.x;y=pos.y;flip=pos.dx<0
   }
   return {seat,index,s,seated,x,y,flip,depth:seated?seat.y+170*seat.scale:y}
  })
  const waiter=waiterState(time)
  const drawGuest=(actor:typeof actors[number])=>{const {seat,s,x,y,flip,seated,index}=actor;if(s.state==='absent')return
   const action=s.state==='enter'||s.state==='leave'?'walk':s.state==='wait'&&mood==='panic'?'impatient':s.state
   const direction=seated?seat.direction:'front';this.shadow(x,seated?y+165*seat.scale:y,65*seat.scale,15*seat.scale)
   this.sprite(`char_guest_${seat.guest}_${action}_${direction}`,x,y,seat.scale,s.elapsed,flip&&direction==='front',seated)
   if(seat.direction==='front'&&seated){this.foreground([{x:354,y:435},{x:474,y:413},{x:675,y:435},{x:672,y:459},{x:475,y:492},{x:354,y:461}])}
   if(['eat','happy','stand_up'].includes(s.state)){this.food(index===1?'dumpling':index===2?'noodle':'friedrice',s.phase>30?'empty':s.phase>22?'half':'done',seat.dish.x,seat.dish.y,.39);if(s.state==='happy')this.sprite('fx_heart',x,y-220*seat.scale,.23,s.elapsed,false,false,.8)}
  }
  // 地面角色按脚底深度排序；桌后客人先画，走过来的服务员不穿柜体。
  const objects=[...actors.map(a=>({depth:a.depth,draw:()=>drawGuest(a)})),{depth:waiter.position.y,draw:()=>{
   const {position:p,action,direction}=waiter;this.shadow(p.x,p.y+2,68,14,.3);this.sprite(`char_waiter_${action}_${direction}`,p.x,p.y,.45,waiter.elapsed,waiter.flip)
   if(waiter.holding){const clip:Clip=this.manifest.clips[`char_waiter_${action}_${direction}`]!;const socket=clip.sockets.tray||{x:256,y:430};const x=p.x+(socket.x-clip.root.x)*.45*(waiter.flip?-1:1),y=p.y+(socket.y-clip.root.y)*.45-9;this.food(waiter.index===1?'dumpling':waiter.index===2?'noodle':'friedrice','done',x,y,.27)}
  }}].sort((a,b)=>a.depth-b.depth);objects.forEach(o=>o.draw())
  for(const [x,y] of [[256,100],[915,70],[1740,70],[2460,110]])this.light(x!,y!,330,'#ffd28e',.055)
  this.light(1330,650,330,'#ffa158',.025+Math.sin(time*13)*.005)
  this.frames++;if(this.frames%15===0){this.canvas.dataset.time=time.toFixed(2);this.canvas.dataset.frame=String(this.frames);this.canvas.dataset.state=JSON.stringify({chef:chefAction,waiter:waiter.action,waiterPosition:waiter.position,guests:actors.map(a=>a.s.state),delivered:Math.floor(Math.max(0,time-10.4)/24)+Number(time>=10.4)})}
 }
}
