/**
 * Tunnel map (n0deforge fork): one WireGuard interface, or a Tailscale
 * tailnet, as seen from the gateway. The live topology has four peer slots
 * around Internet; a tailnet usually has more devices than that, so a tunnel
 * view gets its own hub-and-spoke map with every peer plus a table.
 *
 * Status per peer: "active" = recent handshake (traffic is flowing), "online"
 * = reachable but idle (Tailscale control plane), "offline" otherwise.
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useReducedMotion } from 'framer-motion'
import type { WGPeer } from '@/data/mock'
import { isTailscale } from './views'

type Status = 'active' | 'online' | 'offline'

export const peerStatus = (p: WGPeer): Status => (p.active ? 'active' : p.online ? 'online' : 'offline')

const RANK: Record<Status, number> = { active: 0, online: 1, offline: 2 }

const W = 1000
const H = 620
const CX = W / 2
const CY = H / 2

function layout(n: number): { x: number; y: number }[] {
  // Up to 14 peers on one ring, the rest on a second, staggered ring.
  const out: { x: number; y: number }[] = []
  const inner = Math.min(n, 14)
  const outer = n - inner
  const ring = (count: number, r: number, offset: number) => {
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + offset + (i * 2 * Math.PI) / count
      out.push({ x: CX + r * 1.45 * Math.cos(a), y: CY + r * Math.sin(a) })
    }
  }
  ring(inner, n <= 6 ? 190 : 215, 0)
  if (outer > 0) ring(outer, 285, Math.PI / Math.max(outer, 1))
  return out
}

/** Direct (with endpoint), relayed through DERP (Tailscale without a direct
 * path) or unknown (plain WireGuard peer never seen). */
function linkText(t: (k: string) => string, iface: string, p: WGPeer, withAddr = true): string {
  if (p.endpoint) return withAddr ? `${t('topology.tunnel.direct')} ${p.endpoint}` : t('topology.tunnel.direct')
  return isTailscale(iface) && peerStatus(p) !== 'offline' ? t('topology.tunnel.relayed') : '—'
}

function short(s: string, max = 16): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

export function TunnelMap({ iface, peers, gatewayName }: { iface: string; peers: WGPeer[]; gatewayName: string }) {
  const { t } = useTranslation()
  const reduce = useReducedMotion()
  const [hover, setHover] = useState<string | null>(null)
  const ordered = useMemo(
    () => [...peers].sort((a, b) => RANK[peerStatus(a)] - RANK[peerStatus(b)] || a.name.localeCompare(b.name)),
    [peers],
  )
  const pos = layout(ordered.length)
  const title = isTailscale(iface) ? 'Tailscale' : iface

  if (ordered.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-text-muted">{t('topology.tunnel.empty')}</div>
    )
  }

  const edgeClass: Record<Status, string> = {
    active: 'stroke-accent',
    online: 'stroke-accent/50',
    offline: 'stroke-border',
  }
  const nodeClass: Record<Status, string> = {
    active: 'fill-accent/15 stroke-accent',
    online: 'fill-surface stroke-accent/60',
    offline: 'fill-surface stroke-border',
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label={t('topology.tunnel.mapAria', { name: title })}>
      {ordered.map((p, i) => {
        const st = peerStatus(p)
        const { x, y } = pos[i]!
        return (
          <line
            key={`e-${p.key || p.id}`}
            x1={CX}
            y1={CY}
            x2={x}
            y2={y}
            className={`${edgeClass[st]} transition-opacity`}
            strokeWidth={hover === (p.key || p.id) ? 2.5 : 1.5}
            strokeDasharray={st === 'online' ? '6 6' : st === 'active' && !reduce ? '10 8' : undefined}
            opacity={hover && hover !== (p.key || p.id) ? 0.35 : 1}
          >
            {st === 'active' && !reduce && (
              <animate attributeName="stroke-dashoffset" from="36" to="0" dur="1.2s" repeatCount="indefinite" />
            )}
          </line>
        )
      })}

      <g>
        <circle cx={CX} cy={CY} r={46} className="fill-elevated stroke-accent" strokeWidth={2} />
        <text x={CX} y={CY - 4} textAnchor="middle" className="fill-text-primary text-[15px] font-semibold">
          {title}
        </text>
        <text x={CX} y={CY + 15} textAnchor="middle" className="fill-text-muted text-[11px]">
          {short(gatewayName, 18)}
        </text>
      </g>

      {ordered.map((p, i) => {
        const st = peerStatus(p)
        const { x, y } = pos[i]!
        const id = p.key || p.id
        const below = y >= CY
        return (
          <g
            key={`n-${id}`}
            onMouseEnter={() => setHover(id)}
            onMouseLeave={() => setHover(null)}
            className="cursor-default"
            opacity={hover && hover !== id ? 0.55 : 1}
          >
            <title>
              {`${p.name} · ${p.tunnelIp}\n${t(`topology.tunnel.${st}`)} · ${t('topology.tunnel.handshake')}: ${p.lastHandshake}\n${linkText(
                t,
                iface,
                p,
              )}\n↓ ${p.rx}  ↑ ${p.tx}`}
            </title>
            <circle cx={x} cy={y} r={20} className={nodeClass[st]} strokeWidth={1.75} />
            <circle
              cx={x + 14}
              cy={y - 14}
              r={5}
              className={st === 'active' ? 'fill-accent' : st === 'online' ? 'fill-accent/50' : 'fill-text-muted/40'}
            />
            <text x={x} y={y + 4} textAnchor="middle" className="fill-text-secondary text-[12px] font-semibold uppercase">
              {p.name.slice(0, 2)}
            </text>
            <text x={x} y={below ? y + 38 : y - 34} textAnchor="middle" className="fill-text-primary text-[13px] font-medium">
              {short(p.name)}
            </text>
            <text x={x} y={below ? y + 54 : y - 50} textAnchor="middle" className="fill-text-muted text-[11px] tabular-nums">
              {p.tunnelIp}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function TunnelTable({ iface, peers }: { iface: string; peers: WGPeer[] }) {
  const { t } = useTranslation()
  const rows = [...peers].sort((a, b) => RANK[peerStatus(a)] - RANK[peerStatus(b)] || a.name.localeCompare(b.name))
  const counts = rows.reduce(
    (acc, p) => ({ ...acc, [peerStatus(p)]: acc[peerStatus(p)] + 1 }),
    { active: 0, online: 0, offline: 0 } as Record<Status, number>,
  )
  const dot: Record<Status, string> = { active: 'bg-accent', online: 'bg-accent/50', offline: 'bg-text-muted/40' }
  return (
    <section className="rounded-2xl border border-border bg-surface">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-text-primary">
          {isTailscale(iface) ? 'Tailscale' : iface} · {t('topology.tunnel.peers', { count: rows.length })}
        </h2>
        <p className="text-caption text-text-muted">
          {(['active', 'online', 'offline'] as Status[])
            .filter((s) => counts[s] > 0)
            .map((s) => `${counts[s]} ${t(`topology.tunnel.${s}`).toLowerCase()}`)
            .join(' · ')}
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="text-left text-caption text-text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">{t('topology.tunnel.peer')}</th>
              <th className="px-4 py-2 font-medium">IP</th>
              <th className="px-4 py-2 font-medium">{t('topology.tunnel.status')}</th>
              <th className="px-4 py-2 font-medium">{t('topology.tunnel.handshake')}</th>
              <th className="px-4 py-2 font-medium">{t('topology.tunnel.link')}</th>
              <th className="px-4 py-2 text-right font-medium">↓ / ↑</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const st = peerStatus(p)
              return (
                <tr key={p.key || p.id} className="border-t border-border/60">
                  <td className="px-4 py-2 font-medium text-text-primary">{p.name}</td>
                  <td className="px-4 py-2 tabular-nums text-text-secondary">{p.tunnelIp}</td>
                  <td className="px-4 py-2">
                    <span className="inline-flex items-center gap-1.5 text-text-secondary">
                      <span className={`h-2 w-2 rounded-full ${dot[st]}`} aria-hidden />
                      {t(`topology.tunnel.${st}`)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-text-secondary">{p.lastHandshake}</td>
                  <td className="px-4 py-2 text-text-secondary">
                    <span title={p.endpoint || undefined}>{linkText(t, iface, p, false)}</span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-text-secondary">
                    {p.rx} / {p.tx}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
