'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function MovieSearch({ initial }: { initial: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const [value, setValue] = useState(initial)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const next = new URLSearchParams(params.toString())
    if (value) next.set('q', value)
    else next.delete('q')
    next.delete('page')
    router.push(`/admin?${next.toString()}`)
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search by title…"
        className="max-w-sm"
      />
      <Button type="submit" variant="outline" size="sm">
        Search
      </Button>
    </form>
  )
}
