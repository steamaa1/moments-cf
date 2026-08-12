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

  const res = await $fetch<ResultVO<T>>(`/api${url}`, {
    method: "post",
    body: data ? JSON.stringify(data) : null,
    headers: headers,
  })

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
