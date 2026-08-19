import { computed } from 'vue'
import { useStorage } from '@vueuse/core'
import type {LoginResp} from "~/types";

export type GlobalVO = {
    userinfo:Partial<LoginResp>
}

export const useGlobalState = createGlobalState(
    () => {
        const storage = useStorage<GlobalVO>('global', { userinfo: {} }, undefined, { deep: true })
        // 注意：get 必须直接返回 storage.value 的同一引用，不能展开新建对象。
        // 登录/登出都通过 `global.value.userinfo = x` 属性赋值写入，
        // 若返回新对象，该赋值只会修改临时对象、不触发 useStorage 的 deep watch，
        // localStorage 永远写不进去，刷新后登录态即丢失。
        return computed<GlobalVO>({
            get: () => {
                const value = storage.value ?? { userinfo: {} }
                if (!value.userinfo) value.userinfo = {}
                return value

            },
            set: value => { storage.value = value },
        })
    },
)

