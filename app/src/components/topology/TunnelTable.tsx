/**
 * Peer table for tunnel views (n0deforge fork): every peer of one WireGuard
 * interface or Tailscale tailnet, including the offline ones the map does
 * not draw. Status: "active" = recent handshake, "online" = reachable but
 * idle (Tailscale control plane), "offline" otherwise.
 */
import { useTranslation } from 'react-i18next'
import { relTime } from '@/i18n'
import type { WGPeer } from '@/data/mock'
import { isTailscale } from './views'

type Status = 'active' | 'online' | 'offline'

export const peerStatus = (p: WGPeer): Status => (p.active ? 'active' : p.online ? 'online' : 'offline')

const RANK: Record<Status, number> = { active: 0, online: 1, offline: 2 }


/** Direct (with endpoint), relayed through DERP (Tailscale without a direct
 * path) or unknown (plain WireGuard peer never seen). */
function linkText(t: (k: string) => string, iface: string, p: WGPeer, withAddr = true): string {
  if (p.endpoint) return withAddr ? `${t('topology.tunnel.direct')} ${p.endpoint}` : t('topology.tunnel.direct')
  return isTailscale(iface) && peerStatus(p) !== 'offline' ? t('topology.tunnel.relayed') : '—'
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
                  <td className="px-4 py-2 text-text-secondary">{relTime(p.lastHandshake)}</td>
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
