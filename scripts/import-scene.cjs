const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),sharp=require('sharp')
const root=path.resolve(__dirname,'..'),source=path.join(root,'docs/art-direction-v2/result'),out=path.join(root,'public/scene-v3')
async function main(){
 const input=JSON.parse(await fs.readFile(path.join(source,'manifest.json'),'utf8'))
 await fs.mkdir(path.join(out,'clips'),{recursive:true});await fs.mkdir(path.join(out,'food'),{recursive:true})
 const manifest={version:3,sourceUpdatedAt:input.updatedAt,canvas:{width:2560,height:864},background:'room.webp',clips:{},food:{},sourceHash:''},hash=crypto.createHash('sha256')
 const bg=await fs.readFile(path.join(source,'s1/background/bg_scene_furnished_001.png'));hash.update(bg)
 await sharp(bg).webp({quality:94}).toFile(path.join(out,'room.webp'))
 for(const clip of input.animations){
  const metaFile=(await fs.readdir(path.join(source,clip.dir))).find(f=>f.endsWith('_metadata.json'))
  const meta=JSON.parse(await fs.readFile(path.join(source,clip.dir,metaFile),'utf8')),width=Math.round(meta.canvas.width/2),height=Math.round(meta.canvas.height/2),cols=Math.min(4,clip.frameCount)
  const frames=[]
  for(let i=0;i<clip.files.length;i++){
   const bytes=await fs.readFile(path.join(source,clip.files[i]));hash.update(bytes)
   const actual=await sharp(bytes).metadata();if(actual.width!==meta.canvas.width||actual.height!==meta.canvas.height)throw new Error(`帧尺寸不一致：${clip.id}`)
   frames.push({input:await sharp(bytes).resize(width,height).png().toBuffer(),left:i%cols*width,top:Math.floor(i/cols)*height})
  }
  await sharp({create:{width:width*cols,height:height*Math.ceil(clip.frameCount/cols),channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(frames).webp({quality:91,alphaQuality:100}).toFile(path.join(out,'clips',clip.id+'.webp'))
  manifest.clips[clip.id]={file:'clips/'+clip.id+'.webp',count:clip.frameCount,cols,tile:{width,height},canvas:meta.canvas,root:meta.anchor||clip.root,seatRoot:meta.seatRoot||null,durations:meta.frameDurationsMs,loop:meta.loop,sockets:meta.sockets||{},events:meta.events||[]}
 }
 for(const item of input.statics.filter(s=>/\/food\/.*_(done|half|empty)_001\.png$/.test(s.path))){
  const id=path.basename(item.path,'.png'),bytes=await fs.readFile(path.join(source,item.path));hash.update(bytes)
  await sharp(bytes).webp({quality:93,alphaQuality:100}).toFile(path.join(out,'food',id+'.webp'));manifest.food[id]='food/'+id+'.webp'
 }
 manifest.sourceHash=hash.digest('hex');await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest))
 console.log(`场景素材导入完成：${Object.keys(manifest.clips).length} 组动画、${Object.keys(manifest.food).length} 张餐品；未调用付费接口`)
}
main().catch(e=>{console.error('素材导入失败：',e.message);process.exitCode=1})
