'use client'
import { useEffect, useState } from 'react'

export function Timer({ seconds, onEnd }: { seconds: number; onEnd?: () => void }) {
  const [left, setLeft] = useState(seconds)

  useEffect(() => {
    setLeft(seconds)
    const interval = setInterval(() => {
      setLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          onEnd?.()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [seconds, onEnd])

  const pct = (left / seconds) * 100
  const color = left > 10 ? 'bg-indigo-500' : left > 5 ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-400">Temps</span>
        <span className={`font-mono font-bold ${left <= 5 ? 'text-red-400' : ''}`}>{left}s</span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-1000`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
