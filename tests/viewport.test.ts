import {describe,it,expect} from 'vitest'
// @ts-expect-error 原生场景直接加载 ES 模块，不进入 Vue 编译链。
import {fitViewport,cameraFrame} from '../prototypes/overlook/viewport.js'

describe('背景画幅扩展',()=>{
 for(const [width,height] of [[1600,900],[1920,1200],[2874,1392],[3440,1440],[3840,1080],[1080,1920]]){
  it(`${width}×${height} 铺满屏幕且不拉伸`,()=>{
   const view=fitViewport(width,height)
   expect(view.width*view.scale).toBeCloseTo(width)
   expect(view.height*view.scale).toBeCloseTo(height)
   expect(view.width).toBeGreaterThanOrEqual(1600-1e-6)
   expect(view.height).toBeGreaterThanOrEqual(900-1e-6)
   for(const camera of [0,1]){
    const frame=cameraFrame(view.width,view.height,camera)
    const base=cameraFrame(1600,900,camera)
    expect(view.width/(frame.right-frame.left)).toBeCloseTo(1600/(base.right-base.left))
    expect(view.height/(frame.top-frame.bottom)).toBeCloseTo(900/(base.top-base.bottom))
   }
  })
 }
})
