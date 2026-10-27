const defaults = {source:'mock',endpoint:'',animations:true,showStats:true,autoDemo:true,refreshSeconds:60,threshold:8,windowSize:'normal',windowMode:'normal',alwaysOnTop:false}
function validate(v={}) {
 const n=(key,min,max)=>Number.isFinite(v[key])?Math.min(max,Math.max(min,Math.round(v[key]))):defaults[key]
 const choice=(key,values)=>values.includes(v[key])?v[key]:defaults[key]
 return {...defaults,source:choice('source',['mock','http']),endpoint:typeof v.endpoint==='string'?v.endpoint.slice(0,2048):'',animations:typeof v.animations==='boolean'?v.animations:true,showStats:typeof v.showStats==='boolean'?v.showStats:true,autoDemo:typeof v.autoDemo==='boolean'?v.autoDemo:true,alwaysOnTop:typeof v.alwaysOnTop==='boolean'?v.alwaysOnTop:false,refreshSeconds:n('refreshSeconds',5,3600),threshold:n('threshold',1,999),windowSize:choice('windowSize',['compact','normal','large']),windowMode:choice('windowMode',['normal','borderless','desktop'])}
}
function endpointURL(value) {
 let url;try{url=new URL(value)}catch{throw new Error('请输入有效的 HTTP 数据地址')}
 if (url.username || url.password) throw new Error('请使用独立令牌字段，不要把凭证放入地址')
 if(url.protocol!=='https:' && !(url.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) throw new Error('远程数据地址必须使用 HTTPS；仅本机地址允许 HTTP')
 return url
}
module.exports={defaults,validate,endpointURL}
