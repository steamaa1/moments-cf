import { onBeforeUnmount, watch } from 'vue'
import type { Ref } from 'vue'

/** /api/page/get 下发的逐页资产字段（其余字段与本 composable 无关） */
type CustomPageAssets = {
  customCss?: string | null
  customJs?: string | null
}

/**
 * 逐页 CSS/JS 注入（P2-C）。
 *
 * 语义：
 * - 仅客户端执行（本站是 ssr:false 的 SPA，import.meta.client 恒真，但保留守卫更稳）。
 * - page 引用变化（/a → /b 或拉到 404）时先清理上一页的 style/script，再注入新资产；
 *   卸载时清理。脚本用 textContent + appendChild 注入，浏览器会执行内联脚本。
 * - 空字符串不创建标签，避免空 style/script 堆积。
 * - 删除 script 标签**不会撤销**它已经执行的副作用（事件监听、全局变量等）；这是
 *   「管理员自己写的页面脚本」的固有语义，与在页面里直接写 <script> 一致。
 *
 * 安全边界：资产只能由管理员通过 /api/admin/page/save 写入，与页面正文、markdown 的
 * 内联 HTML 同属管理员信任域；**绝不能**把 customJs 开放给非管理员或站外内容。
 *
 * 为什么不用 useHead：逐页 JS 需要真正的内联执行（innerHTML/useHead 的文本注入语义
 * 在不同版本里不稳定），且清理时机要跟路由组件生命周期严格对齐，手动管理标签最可控。
 */
export function useCustomPageAssets(page: Ref<CustomPageAssets | null>) {
  let styleEl: HTMLStyleElement | null = null
  let scriptEl: HTMLScriptElement | null = null

  const cleanup = () => {
    if (styleEl) styleEl.remove()
    if (scriptEl) scriptEl.remove()
    styleEl = null
    scriptEl = null
  }

  if (import.meta.client) {
    watch(
      page,
      (value) => {
        cleanup()
        const css = String(value?.customCss || '')
        const js = String(value?.customJs || '')
        if (css) {
          styleEl = document.createElement('style')
          styleEl.dataset.customPage = 'css'
          styleEl.textContent = css
          document.head.appendChild(styleEl)
        }
        if (js) {
          scriptEl = document.createElement('script')
          scriptEl.dataset.customPage = 'js'
          scriptEl.textContent = js
          document.body.appendChild(scriptEl)
        }
      },
      { immediate: true },
    )
    onBeforeUnmount(cleanup)
  }
}
