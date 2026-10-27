from pathlib import Path
from zipfile import ZipFile
from collections import deque
from PIL import Image,ImageDraw,ImageFont,ImageOps
import json,sys
ROOT=Path(__file__).resolve().parents[1]
DOC=ROOT.parent/'Bug小餐馆_v1.docx'
SRC=ROOT/'art/source';OUT=ROOT/'public/assets'
SRC.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
if DOC.exists():
 with ZipFile(DOC) as z:
  for n in ('image1.png','image2.png','image3.png'):(SRC/n).write_bytes(z.read('word/media/'+n))
im=Image.open(SRC/'image2.png').convert('RGBA')
rects={
 'chef_idle':(22,44,112,189),'waiter_idle':(125,58,212,190),
 'guest_man':(225,63,303,190),'guest_woman':(321,61,394,189),'guest_reader':(403,63,482,190),
 'chef_cook':(537,46,629,190),'chef_toss':(634,48,724,190),'chef_plate':(735,57,823,190),'chef_panic':(840,44,936,191),
 'waiter_carry':(962,60,1059,191),'waiter_walk':(1080,62,1172,190),'guest_eat':(1204,58,1296,191),
 'prop_stove':(18,528,168,636),'prop_prep':(173,529,328,641),'prop_fridge':(332,521,404,638),
 'prop_shelf':(410,521,500,638),'prop_sink':(505,539,607,638),'prop_pans':(631,523,719,640),
 'prop_rack':(729,545,849,622),'prop_baskets':(871,527,1007,641),'prop_ingredients':(1037,513,1297,640),
 'dish_todo':(21,715,140,804),'dish_cooking':(166,706,296,804),'dish_ready':(320,719,444,804),'dish_served':(469,720,594,804),
 'dish_pork':(645,740,729,804),'dish_rice':(758,741,842,804),'dish_ramen':(873,738,959,804),'dish_skewer':(981,739,1067,804),'dish_salad':(1098,740,1184,804),'dish_cake':(1205,738,1292,804),
 'prop_table':(18,894,145,981),'prop_plant':(166,893,215,978),'prop_menu':(245,886,347,982),
 'prop_register':(372,890,478,981),'prop_book':(510,897,574,978),'prop_plates':(603,897,680,978),
 'prop_sauce':(715,896,786,977),'prop_bin':(821,900,875,978),'prop_boxes':(909,894,989,978),
 'prop_lantern':(1021,894,1074,976),'prop_clock':(1104,895,1156,958),'prop_sign':(1180,894,1297,971),
 'chef_happy':(483,1061,550,1137),'chef_tired':(554,1061,622,1137),'chef_sweat':(623,1061,696,1137),'chef_angry':(698,1061,768,1137)
}
# Only remove light background reachable from the edge; enclosed white hats and plates are preserved.
def remove_bg(img):
 w,h=img.size;px=img.load();seen=bytearray(w*h);q=deque()
 def pale(x,y):
  r,g,b,a=px[x,y];return min(r,g,b)>205 and max(r,g,b)-min(r,g,b)<42
 def add(x,y):
  k=y*w+x
  if not seen[k] and pale(x,y):seen[k]=1;q.append((x,y))
 for x in range(w):add(x,0);add(x,h-1)
 for y in range(h):add(0,y);add(w-1,y)
 while q:
  x,y=q.popleft();px[x,y]=(0,0,0,0)
  for nx,ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
   if 0<=nx<w and 0<=ny<h:add(nx,ny)
 return img
hat_masks={
 'chef_idle':[(7,39),(4,32),(6,23),(12,17),(24,15),(29,8),(39,4),(49,4),(60,9),(65,15),(73,16),(79,23),(81,31),(78,39),(68,43),(66,52),(18,55),(16,42)],
 'chef_cook':[(10,39),(8,29),(12,21),(21,18),(27,19),(31,13),(40,11),(49,13),(54,19),(61,19),(68,24),(70,32),(67,39),(58,44),(57,51),(19,52),(18,42)],
 'chef_toss':[(13,39),(11,31),(15,24),(25,21),(30,15),(38,13),(48,14),(54,20),(62,21),(68,26),(70,34),(67,42),(58,46),(56,53),(23,53),(22,44)],
 'chef_plate':[(14,35),(13,28),(17,22),(26,21),(32,15),(40,14),(48,16),(53,22),(61,23),(67,28),(68,35),(63,41),(56,43),(54,51),(24,51),(23,41)],
 'chef_panic':[(15,43),(12,33),(15,25),(24,21),(31,21),(35,15),(43,13),(53,16),(59,22),(68,23),(75,29),(76,37),(71,44),(63,46),(62,56),(24,57),(23,46)]
}
assets=[]
for name,box in rects.items():
 original=im.crop(box);asset=remove_bg(original.copy())
 if name in hat_masks:
  mask=Image.new('L',asset.size,0);ImageDraw.Draw(mask).polygon(hat_masks[name],fill=255);asset.paste(original,(0,0),mask)
 asset.save(OUT/(name+'.png'))
 assets.append({'name':name,'source':'image2.png','rect':list(box),'size':list(asset.size),'file':name+'.png','transparent':True})
# Independent room vignettes provide the original illustrated wall, lighting and floor.
for name,box in {'room_dining':(580,276,769,452),'room_kitchen':(782,276,951,452),'room_window':(963,276,1122,452)}.items():
 im.crop(box).convert('RGB').save(OUT/(name+'.jpg'),quality=94)
 assets.append({'name':name,'source':'image2.png','rect':list(box),'file':name+'.jpg','transparent':False})
(OUT/'manifest.json').write_text(json.dumps(assets,ensure_ascii=False,indent=2),encoding='utf-8')
(ROOT/'art/crops.json').write_text(json.dumps(rects,ensure_ascii=False,indent=2),encoding='utf-8')
# Review contact sheet on a neutral backdrop.
font_path=Path(r'C:/Windows/Fonts/msyh.ttc')
font=ImageFont.truetype(str(font_path),14) if font_path.exists() else ImageFont.load_default()
w=1040;cw=173;ch=196;sheet=Image.new('RGB',(w,((len(rects)+5)//6)*ch),'#e3dbcc');d=ImageDraw.Draw(sheet)
for i,name in enumerate(rects):
 tile=Image.open(OUT/(name+'.png'));tile.thumbnail((150,155),Image.Resampling.LANCZOS);x=(i%6)*cw;y=(i//6)*ch
 sheet.paste(tile,(x+(cw-tile.width)//2,y+5),tile);d.text((x+5,y+164),name,font=font,fill='#453c32')
(ROOT/'work').mkdir(exist_ok=True);sheet.save(ROOT/'work/asset-review.jpg',quality=94)
# App icon is derived from the same chef, not a new drawing.
bg=Image.new('RGBA',(256,256),'#2c3029');chef=Image.open(OUT/'chef_idle.png');chef.thumbnail((190,223),Image.Resampling.LANCZOS);bg.alpha_composite(chef,((256-chef.width)//2,256-chef.height))
(ROOT/'build').mkdir(exist_ok=True);bg.save(ROOT/'build/icon.png');bg.save(ROOT/'build/icon.ico',sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
print(f'已从原文档裁切 {len(assets)} 项素材，原文档未修改')
