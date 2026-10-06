import { defineStore } from 'pinia'

export interface ToastItem {
  id: number
  message: string
  type: 'info' | 'success' | 'error'
}

let nextId = 1

export const useToastStore = defineStore('toast', {
  state: () => ({
    items: [] as ToastItem[],
  }),
  actions: {
    push(message: string, type: ToastItem['type'] = 'info', duration = 2600) {
      const id = nextId++
      this.items.push({ id, message, type })
      if (this.items.length > 4) this.items.shift()
      window.setTimeout(() => this.dismiss(id), duration)
    },
    success(message: string) {
      this.push(message, 'success')
    },
    error(message: string) {
      this.push(message, 'error')
    },
    info(message: string) {
      this.push(message, 'info')
    },
    dismiss(id: number) {
      this.items = this.items.filter((t) => t.id !== id)
    },
  },
})
