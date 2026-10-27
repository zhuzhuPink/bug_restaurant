const defaults = Object.freeze({waiting:3,vehicles:2,view:'angled',animated:true,exterior:true,stats:true,interactive:true,auto:true});
function validate(value={}) {
 const result={...defaults};
 for(const [key,max] of [['waiting',6],['vehicles',10]]) if(Number.isInteger(value[key])) result[key]=Math.max(0,Math.min(max,value[key]));
 if(['front','angled'].includes(value.view))result.view=value.view;
 for(const key of ['animated','exterior','stats','interactive','auto'])if(typeof value[key]==='boolean')result[key]=value[key];
 return result;
}
// 旧版本曾默认保存摆正视角；只迁移一次，之后尊重用户手动选择。
function load(value={}) {const result=validate(value);if(value.viewPreset!==1)result.view='angled';return result;}
function serialize(value) {return {...validate(value),viewPreset:1};}
module.exports={defaults,validate,load,serialize};
