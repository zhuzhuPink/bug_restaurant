param([Parameter(Mandatory=$true)][int]$ParentPid)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
Add-Type -ReferencedAssemblies System.Windows.Forms,Accessibility -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;
using Accessibility;
public static class BistroInput {
 [StructLayout(LayoutKind.Sequential)] public struct Point {public int X,Y;}
 [StructLayout(LayoutKind.Sequential)] public struct Mouse {public Point point;public uint data,flags,time;public UIntPtr extra;}
 delegate IntPtr Hook(int code,IntPtr message,IntPtr data);
 static Hook callback=OnMouse;static IntPtr hook;static Point down;static bool pressed,dragged;static int parent;
 [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id,Hook callback,IntPtr module,uint thread);
 [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr h);
 [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h,int code,IntPtr msg,IntPtr data);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr GetModuleHandle(string name);
 [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point p);
 [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h,uint flags);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h,StringBuilder text,int max);
 [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 [DllImport("oleacc.dll")] static extern int AccessibleObjectFromWindow(IntPtr window,uint objectId,ref Guid iid,[MarshalAs(UnmanagedType.Interface)] out object accessible);
 static string Class(IntPtr h){var b=new StringBuilder(128);GetClassName(h,b,128);return b.ToString();}
 static bool DesktopRoot(IntPtr h){string c=Class(GetAncestor(h,2));return c=="Progman"||c=="WorkerW";}
 static bool EmptyDesktop(Point point) {
  IntPtr window=WindowFromPoint(point);
  if(!DesktopRoot(window)||!DesktopRoot(GetForegroundWindow()))return false;
  string c=Class(window);
  if(c=="SysListView32"){
   object accessible=null,hit=null;
   try{
    var iid=new Guid("618736E0-3C3D-11CF-810C-00AA00389B71");
    if(AccessibleObjectFromWindow(window,0xFFFFFFFC,ref iid,out accessible)!=0)return false;
    hit=((IAccessible)accessible).accHitTest(point.X,point.Y);
    // CHILDID_SELF 表示列表背景；子元素表示图标/图标文字，完全交给 Explorer。
    return (hit is int && (int)hit==0)||Object.ReferenceEquals(hit,accessible);
   }catch{return false;}finally{
    if(hit!=null&&!Object.ReferenceEquals(hit,accessible)&&Marshal.IsComObject(hit))Marshal.ReleaseComObject(hit);
    if(accessible!=null&&Marshal.IsComObject(accessible))Marshal.ReleaseComObject(accessible);
   }
  }
  return c=="Progman"||c=="WorkerW"||c=="SHELLDLL_DefView";
 }
 static void Report(string type,Point point,int delta){
  // 检测放在消息队列中执行，低级钩子立即返回，绝不阻塞/吞掉桌面输入。
  if(!EmptyDesktop(point))return;
  Console.WriteLine("{\"type\":\""+type+"\",\"x\":"+point.X+",\"y\":"+point.Y+",\"delta\":"+delta+"}");Console.Out.Flush();
 }
 static Control dispatcher;
 static IntPtr OnMouse(int code,IntPtr message,IntPtr data){
  if(code>=0){var m=(Mouse)Marshal.PtrToStructure(data,typeof(Mouse));int kind=message.ToInt32();
   if(kind==0x201){down=m.point;pressed=true;dragged=false;}
   if(kind==0x200&&pressed&&(Math.Abs(down.X-m.point.X)>=5||Math.Abs(down.Y-m.point.Y)>=5))dragged=true;
   if(kind==0x202){Point start=down;bool click=pressed&&!dragged&&Math.Abs(down.X-m.point.X)<5&&Math.Abs(down.Y-m.point.Y)<5;pressed=false;if(click)dispatcher.BeginInvoke((Action)(()=>{if(EmptyDesktop(start))Report("click",m.point,0);}));}
   if(kind==0x20A){int delta=(short)(m.data>>16);dispatcher.BeginInvoke((Action)(()=>Report("wheel",m.point,delta)));}
  }
  return CallNextHookEx(hook,code,message,data);
 }
 public static void Run(int parentPid){
  parent=parentPid;SetThreadDpiAwarenessContext(new IntPtr(-4));
  dispatcher=new Control();var unused=dispatcher.Handle;
  hook=SetWindowsHookEx(14,callback,GetModuleHandle(null),0);if(hook==IntPtr.Zero)throw new InvalidOperationException("无法启用桌面鼠标交互");
  var timer=new Timer{Interval=1000};timer.Tick+=(s,e)=>{try{if(Process.GetProcessById(parent).HasExited)Application.ExitThread();}catch{Application.ExitThread();}};timer.Start();
  Console.WriteLine("{\"type\":\"ready\"}");Console.Out.Flush();
  try{Application.Run();}finally{timer.Dispose();UnhookWindowsHookEx(hook);dispatcher.Dispose();}
 }
}
"@
[BistroInput]::Run($ParentPid)
