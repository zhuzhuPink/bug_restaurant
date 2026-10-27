param([string]$Handle,[ValidateSet('attach','restore','inspect')][string]$Action,[int]$X=0,[int]$Y=0,[int]$Width=1920,[int]$Height=1080,[long]$Style=0,[long]$ExStyle=0)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
Add-Type @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class BistroDesktop {
 public delegate bool EnumProc(IntPtr h,IntPtr l);
 [StructLayout(LayoutKind.Sequential)] public struct Rect {public int Left,Top,Right,Bottom;}
 [StructLayout(LayoutKind.Sequential)] public struct Point {public int X,Y;}
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc fn,IntPtr l);
 [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent,EnumProc fn,IntPtr l);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h,StringBuilder cls,int n);
 [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h,uint flags);
 [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] public static extern bool ScreenToClient(IntPtr h,ref Point p);
 [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h,ref Point p);
 [DllImport("user32.dll",SetLastError=true)] public static extern IntPtr SetParent(IntPtr child,IntPtr parent);
 [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW",SetLastError=true)] public static extern IntPtr GetStyle(IntPtr h,int index);
 [DllImport("user32.dll",EntryPoint="SetWindowLongPtrW",SetLastError=true)] public static extern IntPtr SetStyle(IntPtr h,int index,IntPtr style);
 [DllImport("user32.dll",SetLastError=true)] public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int height,uint flags);
 [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr h,uint msg,IntPtr w,IntPtr l,uint flags,uint timeout,out IntPtr result);
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 public static string Class(IntPtr h){var s=new StringBuilder(256);GetClassName(h,s,256);return s.ToString();}
 public static List<IntPtr> Tops(){var windows=new List<IntPtr>();EnumWindows(delegate(IntPtr h,IntPtr l){windows.Add(h);return true;},IntPtr.Zero);return windows;}
 public static bool HasIcons(IntPtr h){bool found=false;EnumChildWindows(h,delegate(IntPtr c,IntPtr l){if(Class(c)=="SHELLDLL_DefView")found=true;return true;},IntPtr.Zero);return found;}
 public static bool Covers(IntPtr h,int x,int y,int width,int height){Rect r;return GetWindowRect(h,out r)&&r.Left<=x+4&&r.Top<=y+4&&r.Right>=x+width-4&&r.Bottom>=y+height-4;}
 public static IntPtr Host(int x,int y,int width,int height){
  var tops=Tops();IntPtr progman=IntPtr.Zero;foreach(var h in tops)if(Class(h)=="Progman"){progman=h;break;}
  if(progman!=IntPtr.Zero){IntPtr result;SendMessageTimeout(progman,0x052C,IntPtr.Zero,IntPtr.Zero,2,1000,out result);SendMessageTimeout(progman,0x052C,new IntPtr(0xD),new IntPtr(1),2,1000,out result);}
  tops=Tops();
  // 不依赖 FindWindow：某些 Windows 11 桌面可枚举但类名查找返回空。
  foreach(var iconHost in tops){if(!HasIcons(iconHost))continue;uint shellPid;GetWindowThreadProcessId(iconHost,out shellPid);
   int index=tops.IndexOf(iconHost);
   for(int i=index+1;i<tops.Count;i++){var h=tops[i];uint pid;GetWindowThreadProcessId(h,out pid);if(pid==shellPid&&Class(h)=="WorkerW"&&!HasIcons(h)&&IsWindowVisible(h)&&Covers(h,x,y,width,height))return h;}
   IntPtr child=IntPtr.Zero;EnumChildWindows(iconHost,delegate(IntPtr h,IntPtr l){if(Class(h)=="WorkerW"&&!HasIcons(h)&&IsWindowVisible(h)&&Covers(h,x,y,width,height))child=h;return true;},IntPtr.Zero);
   if(child!=IntPtr.Zero)return child;
   // 新版 Explorer 可能把图标与背景保留在同个 Progman 下；子窗口置于图标层下方。
   if(Class(iconHost)=="Progman"&&IsWindowVisible(iconHost)&&Covers(iconHost,x,y,width,height))return iconHost;
  }
  throw new InvalidOperationException("未找到覆盖目标显示器的 Windows 桌面宿主");
 }
 public static void Position(IntPtr h,IntPtr parent,int x,int y,int width,int height){
  var point=new Point{X=x,Y=y};if(parent!=IntPtr.Zero)ScreenToClient(parent,ref point);
  if(!SetWindowPos(h,new IntPtr(1),point.X,point.Y,width,height,0x0050|0x0020))throw new InvalidOperationException("桌面窗口定位失败");
  // Electron 无边框窗口仍可能保留不可见的非客户区，按实际客户区校准而不是只铺满外框。
  Rect outer,client;var origin=new Point();
  if(!GetWindowRect(h,out outer)||!GetClientRect(h,out client)||!ClientToScreen(h,ref origin))throw new InvalidOperationException("读取桌面内容区失败");
  int left=origin.X-outer.Left,top=origin.Y-outer.Top;
  int extraWidth=outer.Right-outer.Left-client.Right,extraHeight=outer.Bottom-outer.Top-client.Bottom;
  if(!SetWindowPos(h,new IntPtr(1),point.X-left,point.Y-top,width+extraWidth,height+extraHeight,0x0050|0x0020))throw new InvalidOperationException("校准桌面内容区失败");
  origin=new Point();GetClientRect(h,out client);ClientToScreen(h,ref origin);
  if(Math.Abs(origin.X-x)>1||Math.Abs(origin.Y-y)>1||Math.Abs(client.Right-width)>1||Math.Abs(client.Bottom-height)>1)throw new InvalidOperationException("桌面内容区未完整覆盖显示器");
 }
}
"@
$window=[IntPtr]([long]$Handle)
if(-not [BistroDesktop]::IsWindow($window)){throw '餐馆窗口已失效'}
[BistroDesktop]::SetThreadDpiAwarenessContext([IntPtr](-4)) | Out-Null
if($Action -eq 'restore'){
 [BistroDesktop]::SetParent($window,[IntPtr]::Zero) | Out-Null
 # WS_CHILD 尚未清除时，GetParent 会返回系统桌面；先还原样式再验证顶层窗口。
 [BistroDesktop]::SetStyle($window,-16,[IntPtr]$Style)|Out-Null
 [BistroDesktop]::SetStyle($window,-20,[IntPtr]$ExStyle)|Out-Null
 if(-not [BistroDesktop]::SetWindowPos($window,[IntPtr]::Zero,0,0,0,0,0x0037)){throw '恢复普通窗口位置失败'}
 if(([BistroDesktop]::GetStyle($window,-16).ToInt64() -band 0x40000000L) -ne 0 -or [BistroDesktop]::GetAncestor($window,2) -ne $window){throw '恢复普通窗口层级失败'}
 @{mode='normal'}|ConvertTo-Json -Compress;exit
}
if($Action -eq 'attach'){
 $oldStyle=[BistroDesktop]::GetStyle($window,-16).ToInt64();$oldExStyle=[BistroDesktop]::GetStyle($window,-20).ToInt64()
 $parentWindow=[BistroDesktop]::Host($X,$Y,$Width,$Height)
 try{
  # 桌面子窗口不能保留标题栏和可调整边框，否则内容区四周会缩进。
  [BistroDesktop]::SetStyle($window,-16,[IntPtr](($oldStyle -band (-bnot 0x80CF0000L)) -bor 0x40000000L))|Out-Null
  [BistroDesktop]::SetStyle($window,-20,[IntPtr](($oldExStyle -band (-bnot 0x40000L)) -bor 0x08000080L))|Out-Null
  [BistroDesktop]::SetParent($window,$parentWindow)|Out-Null
  if([BistroDesktop]::GetParent($window) -ne $parentWindow){throw '桌面窗口挂载失败'}
  [BistroDesktop]::Position($window,$parentWindow,$X,$Y,$Width,$Height)
  if(-not [BistroDesktop]::IsWindowVisible($window)){throw '桌面窗口不可见'}
 }catch{
  [BistroDesktop]::SetParent($window,[IntPtr]::Zero)|Out-Null
  [BistroDesktop]::SetStyle($window,-16,[IntPtr]$oldStyle)|Out-Null
  [BistroDesktop]::SetStyle($window,-20,[IntPtr]$oldExStyle)|Out-Null
  throw
 }
}
$parentWindow=[BistroDesktop]::GetParent($window)
$rect=New-Object BistroDesktop+Rect
[BistroDesktop]::GetWindowRect($window,[ref]$rect)|Out-Null
$client=New-Object BistroDesktop+Rect
[BistroDesktop]::GetClientRect($window,[ref]$client)|Out-Null
$result=@{currentExStyle=[BistroDesktop]::GetStyle($window,-20).ToInt64();currentStyle=[BistroDesktop]::GetStyle($window,-16).ToInt64();client=@{width=$client.Right-$client.Left;height=$client.Bottom-$client.Top};mode=$(if(([BistroDesktop]::GetStyle($window,-16).ToInt64() -band 0x40000000L) -eq 0){'normal'}elseif([BistroDesktop]::Class($parentWindow) -in @('Progman','WorkerW')){'embedded'}else{'detached'});parent=$parentWindow.ToInt64().ToString();hostClass=[BistroDesktop]::Class($parentWindow);visible=[BistroDesktop]::IsWindowVisible($window);hostVisible=[BistroDesktop]::IsWindowVisible($parentWindow);rect=@{x=$rect.Left;y=$rect.Top;width=$rect.Right-$rect.Left;height=$rect.Bottom-$rect.Top}}
if($Action -eq 'attach'){$result.style=$oldStyle;$result.exStyle=$oldExStyle}
$result|ConvertTo-Json -Depth 4 -Compress
