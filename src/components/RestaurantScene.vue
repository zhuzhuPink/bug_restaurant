<script setup lang="ts">
import {ref,onMounted,onUnmounted,watch} from 'vue'
import type {Stage} from '../model'
import {RestaurantRenderer} from '../scene/renderer'
const props=defineProps<{stats:Record<Stage,number>;mood:string;animated:boolean;activity:string}>()
const emit=defineEmits<{open:[stage:Stage]}>()
const canvas=ref<HTMLCanvasElement>(),ready=ref(false),error=ref('')
let renderer:RestaurantRenderer,raf=0,last=0,elapsed=0,disposed=false
function tick(now:number){if(disposed)return;const delta=last?Math.min(100,now-last):0;last=now;if(props.animated)elapsed+=delta;renderer.render(elapsed/1000,props.mood);raf=requestAnimationFrame(tick)}
watch(()=>props.animated,()=>last=0)
onMounted(async()=>{try{renderer=new RestaurantRenderer(canvas.value!);await renderer.load();if(disposed)return;ready.value=true;raf=requestAnimationFrame(tick)}catch(e){error.value=e instanceof Error?e.message:'场景加载失败'}})
onUnmounted(()=>{disposed=true;cancelAnimationFrame(raf)})
</script>
<template>
 <div class="scene-viewport living-scene" :class="{'no-animation':!animated}" data-testid="restaurant-scene" :aria-busy="!ready">
  <canvas ref="canvas" class="restaurant-canvas" aria-label="连续营业的小餐馆：厨师烹饪，服务员走动送餐，顾客落座等餐和吃饭" data-testid="scene-canvas"></canvas>
  <div v-if="!ready" class="scene-loading" role="status">{{error||'小餐馆正在开门…'}}</div>
  <div class="scene-hotspots" v-if="ready">
   <button class="room-hotspot spot-todo" aria-label="查看待处理 Bug" @click="emit('open','todo')"><span>接单台 <b>{{stats.todo}}</b></span></button>
   <button class="room-hotspot spot-doing" aria-label="查看处理中 Bug" @click="emit('open','doing')"><span>烹饪中 <b>{{stats.doing}}</b></span></button>
   <button class="room-hotspot spot-ready" aria-label="查看已修复待上桌 Bug" @click="emit('open','ready')"><span>待上桌 <b>{{stats.ready}}</b></span></button>
   <button class="room-hotspot spot-closed" aria-label="查看今日关闭的 Bug" @click="emit('open','closed')"><span>今日完成 <b>{{stats.closed}}</b></span></button>
  </div>
  <div class="room-sign"><i></i>{{animated?'小餐馆 · 持续营业中':'小餐馆 · 动画已暂停'}}</div>
  <span class="scene-a11y" data-testid="chef" :data-mood="mood">厨师</span><span class="scene-a11y" data-testid="waiter" :class="{walking:animated}">服务员</span>
 </div>
</template>
<style scoped>
.living-scene{position:relative;width:100%;aspect-ratio:2560/864;height:auto!important;min-height:0!important;max-height:none!important;overflow:hidden;background:#70462d url('/scene-v3/room.webp') center/cover;border-radius:0;isolation:isolate}
.restaurant-canvas{display:block;width:100%;height:100%;position:absolute;inset:0}.scene-loading{position:absolute;inset:0;display:grid;place-items:center;color:#fff2cf;background:#372316a8;font-size:14px}.scene-hotspots{position:absolute;inset:0;pointer-events:none}.room-hotspot{position:absolute;border:0;background:transparent;pointer-events:auto;cursor:pointer;color:#fff4dc;padding:0}.room-hotspot span{display:inline-flex;align-items:center;gap:8px;background:#352319bf;border:1px solid #f9d99550;border-radius:30px;padding:6px 12px;font-size:10px;box-shadow:0 3px 12px #25190f40;opacity:.8;transition:opacity .2s,transform .2s}.room-hotspot:hover span,.room-hotspot:focus-visible span{opacity:1;transform:translateY(-3px);background:#493023}.room-hotspot b{color:#f7d798}.spot-todo{left:31%;top:52%}.spot-doing{left:48%;top:22%}.spot-ready{left:68%;top:53%}.spot-closed{left:6%;top:40%}.room-sign{position:absolute;right:18px;bottom:13px;color:#ffeac1;font-size:9px;letter-spacing:1px;padding:6px 10px;border-radius:20px;background:#342118a8;display:flex;align-items:center;gap:6px}.room-sign i{width:5px;height:5px;border-radius:50%;background:#b6c584;box-shadow:0 0 8px #c2e094}.scene-a11y{position:absolute;width:1px;height:1px;clip-path:inset(50%);overflow:hidden;pointer-events:none}
</style>
