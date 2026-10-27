const fs=require('node:fs/promises');
const path=require('node:path');
const {installerName,validateManifest,fileHash}=require('../electron/updates.cjs');
async function generate(root=path.resolve(__dirname,'..'),notes){
 const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
 const dir=path.join(root,'release',pkg.version),installer=path.join(dir,installerName(pkg.version));
 const manifest=validateManifest({versionCode:pkg.versionCode,versionName:pkg.version,sha256:await fileHash(installer),notes:notes??pkg.releaseNotes??`Bug 小餐馆 v${pkg.version} 更新`});
 const file=path.join(dir,'latest.json');await fs.writeFile(file,JSON.stringify(manifest,null,2)+'\n');return {file,installer,manifest};
}
if(require.main===module)generate(undefined,process.argv.length>2?process.argv.slice(2).join(' '):undefined).then(({file,installer})=>console.log('更新版本文件已生成：'+file+'\n请先上传安装包，再上传 latest.json：'+installer)).catch(error=>{console.error('生成更新版本文件失败：',error.message);process.exitCode=1});
module.exports={generate};
