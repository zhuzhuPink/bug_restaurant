const fs = require('node:fs/promises');
const path = require('node:path');
// 正式入口复用同一套 3D 实现；只复制运行资源，不携带开发服务器与验收产物。
async function build() {
 const source = path.resolve('prototypes/overlook'), target = path.resolve('dist/bistro');
 await fs.mkdir(target, {recursive:true});
 for (const name of ['index.html','style.css','layout.js','street.js','walking.js','model.js','scene.js','traffic.js','viewport.js','main.js','desktop-client.js','settings.html','settings-client.js','settings.css']) {
  let text = await fs.readFile(path.join(source,name),'utf8');
  if(name==='index.html') text=text.replace(/<script type="importmap">.*?<\/script>/s,'').replace('全屏视角选型 Demo','Windows 桌面版');
  text=text.replaceAll("from 'three'", "from './vendor/three.module.js'")
   .replaceAll("'./node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js'", "'./vendor/RoundedBoxGeometry.js'");
  await fs.writeFile(path.join(target,name),text,'utf8');
 }
 await fs.mkdir(path.join(target,'vendor'),{recursive:true});
 const three = path.resolve('node_modules/three');
 for(const name of ['three.module.js','three.core.js']) await fs.copyFile(path.join(three,'build',name),path.join(target,'vendor',name));
 const rounded = await fs.readFile(path.join(three,'examples/jsm/geometries/RoundedBoxGeometry.js'),'utf8');
 await fs.writeFile(path.join(target,'vendor/RoundedBoxGeometry.js'),rounded.replaceAll("from 'three'","from './three.module.js'"));
 await fs.copyFile(path.join(three,'LICENSE'),path.join(target,'vendor/THREE-LICENSE.txt'));
 console.log('3D 餐馆正式资源已构建，全部使用本地文件');
}
build().catch(e=>{console.error('餐馆资源构建失败：',e);process.exitCode=1});
