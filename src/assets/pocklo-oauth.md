小兜 OAuth 让应用在用户同意后读取小兜文件，或代表用户创建分享链接。面向有服务端的 Web 应用。OAuth 回调和令牌交换都应由你的服务端处理。

## 嵌入资源选择器

网页可以通过 iframe 加入「从小兜选择资源」按钮。用户在小兜窗口登录、搜索和确认分享后，宿主网页只接收本次创建的分享链接。这个流程不需要注册 OAuth 应用或填写密钥。分享可以在小兜的「我的分享」中撤销。

下面示例将宿主网页的准确 origin 传给选择器，并检查返回消息的来源。生产宿主使用 HTTPS，本机测试支持 HTTP 回环地址。

```html
<iframe id="pocklo-picker" title="从小兜选择资源" width="100%" height="105"
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
  frame.src = origin + '/assets/picker/index.html?origin=' + encodeURIComponent(location.origin);
</script>
```

选择器也会发送 `pocklo.picker.cancelled` 和 `pocklo.picker.error`，方便宿主处理取消或弹窗被拦截。请让用户点击 iframe 内的按钮来开启小兜窗口。宿主需允许嵌入小兜来源并允许弹窗。若站点的浏览器隔离策略切断了弹窗与开启者的连接，选择器会显示连接中断。

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
