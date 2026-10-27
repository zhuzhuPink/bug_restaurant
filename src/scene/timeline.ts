export type Point={x:number;y:number}
export type Clip={file:string;count:number;cols:number;tile:{width:number;height:number};canvas:{width:number;height:number};root:Point;seatRoot:Point|null;durations:number[];loop:boolean;sockets:Record<string,Point&{w?:number;h?:number}>;events:{frame:number;type:string}[]}
export type SceneManifest={version:number;canvas:{width:number;height:number};background:string;clips:Record<string,Clip>;food:Record<string,string>}
export function frameAt(clip:Pick<Clip,'count'|'durations'|'loop'>,elapsed:number){
 const durations=Array.from({length:clip.count},(_,i)=>Math.max(1,clip.durations[i]||100)),total=durations.reduce((a,b)=>a+b,0)
 let time=Math.max(0,elapsed);if(clip.loop)time%=total;else if(time>=total)return clip.count-1
 for(let i=0;i<durations.length;i++){time-=durations[i]!;if(time<0)return i}return clip.count-1
}
export function along(points:Point[],progress:number){
 if(!points.length)throw new Error('路径不能为空')
 if(progress>=1){const end=points.at(-1)!,prev=points.at(-2)||end;return {...end,dx:end.x-prev.x,dy:end.y-prev.y}}
 const lengths=points.slice(1).map((b,i)=>Math.hypot(b.x-points[i]!.x,b.y-points[i]!.y)),total=lengths.reduce((a,b)=>a+b,0)
 let distance=Math.max(0,Math.min(1,progress))*total
 for(let i=0;i<lengths.length;i++){const a=points[i]!,b=points[i+1]!,len=lengths[i]!;if(distance<=len&&len){const f=distance/len;return {x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,dx:b.x-a.x,dy:b.y-a.y}}distance-=len}
 const end=points.at(-1)!;return {...end,dx:0,dy:0}
}
export const seats=[
 {id:'T1',guest:'a',x:345,y:692,scale:.48,direction:'back',dish:{x:170,y:545},service:{x:561,y:778}},
 {id:'T2',guest:'b',x:491,y:493,scale:.34,direction:'front',dish:{x:550,y:457},service:{x:754,y:636}},
 {id:'T3',guest:'c',x:2394,y:690,scale:.48,direction:'back',dish:{x:2248,y:535},service:{x:2138,y:771}}
] as const
export const pass={x:2047,y:637}
export function servicePath(index:number):Point[]{
 const target=seats[index]!.service
 return index===2?[pass,{x:2115,y:692},target]:[pass,{x:2056,y:841},{x:756,y:841},target]
}
export type GuestPhase='wait'|'eat'|'happy'|'stand_up'|'leave'|'absent'|'enter'|'sit_down'|'order'
export function guestState(time:number,index:number){
 const phase=((time-index*24)%72+72)%72
 let state:GuestPhase,start=0
 if(phase<10.4)state='wait'
 else if(phase<36){state='eat';start=10.4}
 else if(phase<39){state='happy';start=36}
 else if(phase<40.2){state='stand_up';start=39}
 else if(phase<48){state='leave';start=40.2}
 else if(phase<59){state='absent';start=48}
 else if(phase<66){state='enter';start=59}
 else if(phase<67.4){state='sit_down';start=66}
 else if(phase<70){state='order';start=67.4}
 else{state='wait';start=70}
 return {state,phase,elapsed:(phase-start)*1000,progress:state==='enter'?(phase-59)/7:state==='leave'?(phase-40.2)/7.8:0}
}
export function waiterState(time:number){
 const slot=Math.floor(Math.max(0,time)/24),index=slot%3,phase=time%24,path=servicePath(index)
 let action:string,elapsed=0,holding=false,position={...pass,dx:0,dy:0}
 if(phase<1.2){action='pickup';elapsed=phase;holding=phase>.7}
 else if(phase<9.5){action='hold_walk';elapsed=phase-1.2;holding=true;position=along(path,elapsed/8.3)}
 else if(phase<10.4){action='put_down';elapsed=phase-9.5;holding=elapsed<.5;position={...seats[index]!.service,dx:0,dy:0}}
 else if(phase<18.8){action='walk';elapsed=phase-10.4;position=along([...path].reverse(),elapsed/8.4)}
 else if(phase<21.4){action='take_order';elapsed=phase-18.8}
 else{action='idle';elapsed=phase-21.4}
 const direction=position.dy<-25?'back':'front'
 return {index,phase,action,elapsed:elapsed*1000,holding,position,direction,flip:position.dx<0}
}
