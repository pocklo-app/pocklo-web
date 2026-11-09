小兜 OAuth 让应用在用户同意后读取小兜文件，或代表用户创建分享链接。面向有服务端的 Web 应用。OAuth 回调和令牌交换都应由你的服务端处理。

## 嵌入资源选择器

### 宿主已有小兜 OAuth 授权

将 iframe 指向 `/picker/embed/?mode=oauth&origin=<宿主 origin>`。选择器加载后会立即请宿主读取当前用户的资源。具备 `files.read` 时可以直接浏览，具备 `shares.create` 时可以在 iframe 内确认并创建分享链接。两步都在当前网页完成。

宿主收到 `pocklo.picker.ready` 后，返回 `{ type: 'pocklo.picker.init', version: 1, canShare: true }`。只在当前授权包含 `shares.create` 时将 `canShare` 设为 `true`。选择器随后会发出 `pocklo.picker.request`，每个请求带有 `requestId` 和 `action`。

| action | 消息字段 | 宿主服务端操作与返回值 |
| --- | --- | --- |
| `files` | `resourceId`、`query`、`offset` | 调用 OAuth `GET files/` 或 `GET files/{resource_id}/`，原样返回 `resource`、`entries`、`has_more` 和 `next_offset`。空 `resourceId` 表示根目录 |
| `share` | `resourceId`、`operationId` | 调用 OAuth `POST shares/`，使用 `operationId` 作为幂等键，返回 `{ url }` |

宿主应在每次请求时从自身登录会话解析当前用户，并在服务端使用该用户的 OAuth 授权。iframe 消息中无需传送 OAuth 令牌、客户端密钥或账号 ID。服务端继续执行现有权限检查。

以下是使用现有 Frienden API 客户端的消息处理示例。初始化监听器后再设置 iframe 的 `src`，组件卸载时移除监听器。

```js
const pockloOrigin = 'https://pocklo.jyonn.space';

async function onPickerMessage(event) {
  if (event.origin !== pockloOrigin || event.source !== frame.contentWindow ||
      event.data?.version !== 1) return;
  const message = event.data;
  const reply = (type, fields) => event.source.postMessage({ type, version: 1, ...fields }, pockloOrigin);

  if (message.type === 'pocklo.picker.ready') {
    // 此处使用 Frienden 已确认为 connected 的连接状态。
    reply('pocklo.picker.init', { canShare: true });
  } else if (message.type === 'pocklo.picker.request' &&
             ['files', 'share'].includes(message.action) &&
             typeof message.requestId === 'string') {
    const { requestId, resourceId, query, offset, operationId } = message;
    try {
      const signal = AbortSignal.timeout(12000);
      const result = message.action === 'files'
        ? await api.pockloFiles(resourceId, offset, signal, query)
        : await api.pockloShare(resourceId, operationId, signal);
      reply('pocklo.picker.response', { requestId, result });
    } catch (error) {
      reply('pocklo.picker.response', { requestId, error: error.identifier || 'unavailable' });
    }
  } else if (message.type === 'pocklo.picker.selected') {
    onShareSelected(message.url);
  }
}

window.addEventListener('message', onPickerMessage);
frame.src = pockloOrigin + '/picker/embed/?mode=oauth&origin=' + encodeURIComponent(location.origin);
```

### 宿主尚未接入 OAuth

网页可以通过 iframe 直接嵌入小兜资源选择器。用户在小兜窗口登录并允许浏览后，可以留在 iframe 内浏览目录、搜索和选择资源。确认分享时会打开小兜窗口，确认后宿主网页只接收本次创建的分享链接。这个流程不需要注册 OAuth 应用或填写密钥。分享可以在小兜的「我的分享」中撤销。

下面示例将宿主网页的准确 origin 传给选择器，并检查返回消息的来源。生产宿主使用 HTTPS，本机测试支持 HTTP 回环地址。

```html
<iframe id="pocklo-picker" title="从小兜选择资源" width="100%" height="580"
  style="border:0" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox">
</iframe>
<a id="pocklo-share" hidden>查看分享</a>
<script>
  const origin = 'https://pocklo.jyonn.space';
  const frame = document.getElementById('pocklo-picker');
  const link = document.getElementById('pocklo-share');
  window.addEventListener('message', (event) => {
    if (event.origin !== origin || event.source !== frame.contentWindow ||
        event.data?.version !== 1) return;

    if (event.data.type === 'pocklo.picker.ready') {
      frame.contentWindow.postMessage({ type: 'pocklo.picker.init', version: 1 }, origin);
    } else if (event.data.type === 'pocklo.picker.selected') {
      const url = new URL(event.data.url);
      if (url.origin !== origin || !url.pathname.startsWith('/share/')) return;
      link.href = url.href;
      link.hidden = false;
    }
  });
  frame.src = origin + '/picker/embed/?origin=' + encodeURIComponent(location.origin);
</script>
```

选择器也会发送 `pocklo.picker.cancelled` 和 `pocklo.picker.error`，方便宿主处理取消或弹窗被拦截。旧的 `/assets/picker/index.html` 会跳转到同一个嵌入页。已有嵌入请把 iframe 高度调整到约 580 像素，给文件列表留出空间。宿主需允许嵌入小兜来源并允许弹窗。若站点的浏览器隔离策略切断了弹窗与开启者的连接，选择器会显示连接中断。

## 注册应用

在[开发者平台](/developer)登录小兜，填写名称、网站、用途和精确的 HTTPS 回调地址。可以登记多个回调，禁止通配符和 URL 片段。保存 Client ID 和 Client secret。密钥只展示一次，请存入服务端。需要公开分享时，在开发者平台申请「创建分享链接」，通过小兜管理员审批后再发起用户授权。

| 权限 | 允许的操作 | 开通条件 |
| --- | --- | --- |
| `files.read` | 浏览目录、递归搜索文件名、读取元数据、下载文件或读取网页链接 | 应用注册后，由用户同意 |
| `shares.create` | 为该账号的文件或目录创建可撤销的分享链接 | 管理员审批应用，再由用户同意 |

两项权限可分别申请。读取权限覆盖该小兜账号拥有的资源，分享权限只创建新链接。目录分享包含该目录的子资源，任何持有链接的人都可以查看共享内容。

## 1. 打开授权页

API 根地址为 `https://disk.6-79.cn/api/oauth/`。生成并在服务端会话保存随机 `state` 和 PKCE `code_verifier`。Verifier 长度为 43–128 个 ASCII 字符，允许字母、数字和 `-._~`。Challenge 是 verifier 的 SHA-256 摘要，采用无填充的 Base64URL 编码。

把用户浏览器跳转到以下地址。实际请求应对每个参数做 URL 编码，并使用随机生成的 state 和 challenge。

```text
GET https://disk.6-79.cn/api/oauth/authorize/
  ?response_type=code
  &client_id=YOUR_CLIENT_ID
  &redirect_uri=https%3A%2F%2Fapp.example%2Foauth%2Fpocklo
  &scope=files.read%20shares.create
  &state=YOUR_RANDOM_STATE
  &code_challenge=YOUR_S256_CHALLENGE
  &code_challenge_method=S256
```

省略 `scope` 时默认 `files.read`。授权请求有效期为 10 分钟。用户同意后，小兜将浏览器带回登记地址，并附上 `code` 和 `state`。拒绝时返回 `error=access_denied` 和 `state`。收到回调后先核对并消费 state，再处理 code 或 error。无效的客户端、回调地址或权限请求会在小兜端直接报错。

## 2. 在服务端换取令牌

使用 HTTP Basic 认证，用户名为 Client ID，密码为 Client secret。授权码一次有效，需在 120 秒内兑换。回调地址须与第 1 步逐字一致。

```sh
curl --user "$POCKLO_CLIENT_ID:$POCKLO_CLIENT_SECRET" \
  https://disk.6-79.cn/api/oauth/token/ \
  --data-urlencode 'grant_type=authorization_code' \
  --data-urlencode "code=$CODE" \
  --data-urlencode "redirect_uri=$REDIRECT_URI" \
  --data-urlencode "code_verifier=$VERIFIER"
```

响应为 JSON，含 `access_token`、`refresh_token`、`token_type: "Bearer"`、`expires_in: 900` 和实际授予的 `scope`。仅在服务端存放令牌。访问令牌有效 15 分钟，刷新令牌有效 30 天。

## 3. 访问文件和分享 API

业务请求带 `Authorization: Bearer ACCESS_TOKEN`，以下路径相对于 API 根地址。

| 方法与路径 | 说明 |
| --- | --- |
| `GET files/` | 用户根目录。返回 `resource`、`entries`、`has_more` 和 `next_offset` |
| `GET files/{id}/` | 文件或目录。目录浏览每页 100 项，传 `?offset=next_offset` 继续 |
| `GET files/{id}/?q=keyword` | 搜索目录及子目录的文件名，最多返回 100 项，超出时 `has_more` 为 true。搜索不分页 |
| `GET files/{id}/download/` | 返回 `kind=download`、`url` 和 `expires_in=300`。网页链接返回 `kind=link` 和原地址 |
| `POST shares/` | 传入 JSON `{"resource_id":"FILE_ID"}` 和 `Idempotency-Key`，返回分享 `url`、`token` 及资源信息 |

资源 ID 取自 `resource.id` 或 `entries[].id`。列表条目还包含 `name`、`folder`、`size`、`preview`、`thumbnail` 和 `created_at`。下载接口只签发短时地址，应用可按需打开或下载。短时地址在自身有效期内可使用。

```sh
curl https://disk.6-79.cn/api/oauth/shares/ \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $SHARE_OPERATION_ID" \
  --data '{"resource_id":"FILE_ID"}'
```

同一次创建操作的重试沿用同一个幂等键，首次返回 201，重复成功返回 200。键相同但资源不同返回 409。若原链接已撤销，同键重试返回 410。分享可在小兜「我的分享」中管理。

## 刷新、检查和撤销

- `POST token/` 使用同一 HTTP Basic 凭据，发送 `grant_type=refresh_token` 和 `refresh_token`。每次刷新都返回新的刷新令牌。按账号串行刷新并立即保存新令牌，旧刷新令牌重复使用会撤销该次授权。遇到失效后让用户重新授权。
- `POST introspect/` 使用 HTTP Basic，发送 `token`。有效且属于该应用时返回 `active: true`、`scope` 和 `exp`，否则返回 `active: false`。
- `POST revoke/` 使用 HTTP Basic，发送 `token`，撤销该次用户授权。用户也可以在[已授权应用](/account/applications)撤销。已生成的分享链接仍由用户在「我的分享」中管理。
- 同一应用对同一账号重新授权会替换旧授权。修改应用配置、重置密钥、变更审批或停用应用会使该应用的旧授权失效。

令牌和撤销接口接受 `application/x-www-form-urlencoded` 或 JSON，响应均为 JSON。失败返回 `{"error":"错误码"}`。常见错误包括 `invalid_client`（应用认证失败）、`invalid_grant`（授权码或刷新令牌失效）、`invalid_token`（访问令牌无效）、`insufficient_scope`（令牌缺少权限）和 `resource_not_found`（资源不存在或不属于该账号）。
