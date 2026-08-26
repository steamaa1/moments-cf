import type { ResultVO } from "~/types"
import { toast } from "vue-sonner"
import { useGlobalState } from "~/store"
import markdownit from "markdown-it"
import { fromHighlighter } from "@shikijs/markdown-it/core"
import { createHighlighterCore } from "shiki/core"
import { uploadFiles } from "~/utils/upload"

const global = useGlobalState()

export const useMyFetch = async <T>(url: string, data?: any) => {
  const headers: Record<string, string> = {}

  const userinfo = global.value?.userinfo ?? {}
  if (userinfo.token) {
    headers["x-api-token"] = userinfo.token
  }

  let res: ResultVO<T> | null = null
  try {
    res = await $fetch<ResultVO<T>>(`/api${url}`, {
      method: "post",
      body: data ? JSON.stringify(data) : null,
      headers: headers,
    })
  } catch (error: any) {
    // ofetch 对非 2xx 直接抛错；携带了 token 却收到 401/code 3/4，即 token 已失效，
    // 清空登录态让界面回到未登录，否则会一直"看似已登录"直到某个操作才报错。
    const status = error?.response?.status || error?.status
    const bodyCode = error?.data?.code
    if (userinfo.token && (status === 401 || bodyCode === 3 || bodyCode === 4)) {
      global.value.userinfo = {}
      toast.error("登录已过期，请重新登录")
    }
    throw new Error(error?.data?.message || error?.message || "网络请求失败")
  }

  if (!res || res.code !== 0) {
    if (!res) {
      throw new Error("请求失败")
    }

    if (res.code === 3 || res.code === 4) {
      global.value.userinfo = {}
      window.location.href = "/"
      throw new Error(res.message || "请求失败")
    }

    throw new Error(res.message)
  }

  return res.data
}

export const useUpload = uploadFiles

export const md = markdownit({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true,
})

// 本站媒体（/upload/ 前缀）绝对 URL 规范化为相对路径，
// 避免动态正文 Markdown 外链图片跨域加载触发 CORB。
const defaultImage = md.renderer.rules.image || ((tokens: any, idx: number, options: any, env: any, self: any) => self.renderToken(tokens, idx, options))
md.renderer.rules.image = (tokens: any, idx: number, options: any, env: any, self: any) => {
  const src = tokens[idx].attrGet('src') || ''
  if (/^https?:\/\/[^/]+\/upload\//.test(src)) tokens[idx].attrSet('src', src.replace(/^https?:\/\/[^/]+/, ''))
  return defaultImage(tokens, idx, options, env, self)
}

createHighlighterCore({
  themes: [import("shiki/themes/github-dark.mjs")],
  langs: [
    import("shiki/langs/c.mjs"),
    import("shiki/langs/css.mjs"),
    import("shiki/langs/html.mjs"),
    import("shiki/langs/javascript.mjs"),
    import("shiki/langs/json.mjs"),
    import("shiki/langs/python.mjs"),
    import("shiki/langs/shellscript.mjs"),
    import("shiki/langs/sql.mjs"),
    import("shiki/langs/tsx.mjs"),
    import("shiki/langs/xml.mjs"),
    import("shiki/langs/yaml.mjs"),
    import("shiki/langs/go.mjs"),
  ],
  loadWasm: import("shiki/wasm"),
}).then(highlighter => {
  md.use(
    //@ts-ignore
    fromHighlighter(highlighter, {
      themes: {
        light: "github-dark",
        dark: "github-dark",
      },
    }),
  )
})

// APlayer / Meting 按需加载：仅音乐组件挂载时注入，
// 避免全局加载占用所有页面的首屏带宽与请求。
function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
    const el = document.createElement('script')
    el.src = src
    el.async = true
    el.onload = () => resolve()
    el.onerror = () => reject(new Error(`加载失败: ${src}`))
    document.head.appendChild(el)
  })
}
function injectStyle(href: string): void {
  if (document.querySelector(`link[href="${href}"]`)) return
  const el = document.createElement('link')
  el.rel = 'stylesheet'
  el.href = href
  document.head.appendChild(el)
}
let musicAssetsPromise: Promise<void> | null = null
export function loadMusicAssets(): Promise<void> {
  if (!musicAssetsPromise) {
    musicAssetsPromise = (async () => {
      injectStyle('/css/APlayer.min.css')
      await Promise.all([
        injectScript('/js/APlayer.min.js'),
        injectScript('/js/Meting.min.js'),
      ])
    })()
  }
  return musicAssetsPromise
}
