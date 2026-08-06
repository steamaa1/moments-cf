import type { SysConfigVO } from '~/types'

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string
      execute: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
  }
}

const waitFor = async (ready: () => boolean, timeout = 8000) => {
  const started = Date.now()
  while (!ready()) {
    if (Date.now() - started > timeout) throw new Error('人机验证组件加载超时')
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

export const useHumanVerification = () => {
  const config = useState<SysConfigVO>('sysConfig')

  const turnstileToken = async (action: 'newComment' | 'likeMemo') => {
    await waitFor(() => Boolean(window.turnstile))
    return new Promise<string>((resolve, reject) => {
      const overlay = document.createElement('div')
      overlay.setAttribute('role', 'dialog')
      overlay.setAttribute('aria-label', 'Cloudflare 人机验证')
      overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:rgba(15,23,42,.28);backdrop-filter:blur(4px)'
      const container = document.createElement('div')
      container.style.cssText = 'min-height:65px;padding:16px;border-radius:16px;background:white;box-shadow:0 20px 50px rgba(15,23,42,.22)'
      overlay.appendChild(container)
      document.body.appendChild(overlay)
      let widgetId = ''
      const cleanup = () => {
        if (widgetId && window.turnstile) window.turnstile.remove(widgetId)
        overlay.remove()
      }
      widgetId = window.turnstile!.render(container, {
        sitekey: config.value.turnstileSiteKey,
        action,
        appearance: 'interaction-only',
        execution: 'execute',
        callback: (token: string) => { cleanup(); resolve(token) },
        'error-callback': () => { cleanup(); reject(new Error('Cloudflare 人机验证失败')) },
        'expired-callback': () => { cleanup(); reject(new Error('Cloudflare 人机验证已过期')) },
      })
      window.turnstile!.execute(widgetId)
    })
  }

  const googleToken = async (action: 'newComment' | 'likeMemo') => {
    await waitFor(() => typeof grecaptcha !== 'undefined')
    return new Promise<string>((resolve, reject) => {
      grecaptcha.ready(() => grecaptcha.execute(config.value.googleSiteKey, { action }).then(resolve).catch(reject))
    })
  }

  const verify = async (action: 'newComment' | 'likeMemo') => {
    if (config.value.enableTurnstile) return turnstileToken(action)
    if (config.value.enableGoogleRecaptcha) return googleToken(action)
    return ''
  }

  return { verify }
}
