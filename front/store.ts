import { computed } from 'vue'
import { useStorage } from '@vueuse/core'
import type {LoginResp} from "~/types";

export type GlobalVO = {
    userinfo:Partial<LoginResp>
}

export const useGlobalState = createGlobalState(
    () => {
        const storage = useStorage<GlobalVO>('global', { userinfo: {} }, undefined, { deep: true })
        return computed<GlobalVO>({
            get: () => ({ userinfo: {}, ...(storage.value ?? {}) }),
            set: value => { storage.value = value },
        })
    },
)

