# HTTP 接入说明

## 配置

在餐馆设置选择“HTTP · 只读 JSON 接口”，填写地址与可选 Bearer 令牌，保存后同步。令牌留空保持原值；使用“清除已保存令牌”显式清除。远程仅 HTTPS，本机允许 HTTP。不要把真实令牌写进仓库或共享截图。

应用发送 GET，请求头为 Accept: application/json；填写令牌时另加 Authorization: Bearer <token>。不分页、不自动刷新认证令牌、不自动跳转。上游若分页，需由转换服务汇总成一个快照再提供给应用。

## 返回结构

支持直接数组，也支持 { "items": [...] }。示例：

```json
{
  "items": [
    {
      "id": "BUG-1001",
      "title": "筛选切换后列表未刷新",
      "status": "doing",
      "assignee": "小林",
      "priority": "high",
      "createdAt": "2026-10-22T08:00:00+08:00",
      "updatedAt": "2026-10-22T09:10:00+08:00"
    },
    {
      "id": "BUG-1002",
      "title": "修复日期显示",
      "status": "closed",
      "updatedAt": "2026-10-22T10:00:00+08:00",
      "closedAt": "2026-10-22T10:00:00+08:00"
    }
  ]
}
```

示例日期是固定日期，之后运行时请使用真实时间；历史关闭条目不会计入“今日关闭”。

| 字段 | 要求 |
|---|---|
| id | 必填、非空字符串，最多 160 字符 |
| title | 必填、非空字符串，最多 1000 字符 |
| status | 必填，见下面状态表 |
| updatedAt | 必填，有效日期字符串，建议 ISO 8601 并附时区 |
| closedAt | closed 状态必填，有效日期字符串 |
| createdAt | 可选，省略时使用 updatedAt |
| assignee | 可选字符串，缺省显示未分配，最多保留 100 字符 |
| priority | 可选 high / normal / low，其他值按 normal |

| 餐馆状态 | 支持的输入 |
|---|---|
| todo（待处理） | todo、new、未开始、新建、待处理 |
| doing（处理中） | doing、in_progress、处理中 |
| ready（做好待上桌） | ready、resolved、wontfix、已修复、暂不解决 |
| closed（已关闭） | closed、已关闭 |

英文状态不区分大小写。相同 id 按 updatedAt 保留较新条目，时间相同保留后出现条目。最多 10000 条；无效条目会使整份快照报错，不悄悄丢弃。今日判断采用运行机器的本地时区。

## 错误行为

非 2xx、非法 JSON、校验失败、响应超 4 MiB、12 秒超时均显示中文错误并保留当前有效快照。首次连接无有效快照时可能显示空列表；网络恢复后点击“重新同步”即可。接口应返回完整当前快照，不是增量事件。

## 本机最小示例

将下列代码保存到你自己的 `.cjs` 文件并用 Node.js 执行，然后配置 `http://127.0.0.1:8787/bugs`。示例只监听本机且不需要令牌。

```javascript
const http = require('node:http')
http.createServer((req, res) => {
  if (req.url !== '/bugs' || req.method !== 'GET') {
    res.writeHead(404).end(); return
  }
  const now = new Date().toISOString()
  res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'})
  res.end(JSON.stringify({items: [
    {id: 'API-1', title: '示例接口订单', status: 'doing', updatedAt: now}
  ]}))
}).listen(8787, '127.0.0.1', () => console.log('本机示例接口已启动'))
```

这只是通用数据契约，不代表云效已经对接。云效响应的字段名、嵌套层次、状态编码和分页若不同，应在独立转换层处理，不要在界面里放管理凭证。
