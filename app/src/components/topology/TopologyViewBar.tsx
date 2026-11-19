/**
 * View switcher for the topology map (n0deforge fork): live, wired, Wi-Fi,
 * one tab per VLAN and one per access point. Pure presentation; the
 * filtering lives in ./views.
 */
import { useTranslation } from 'react-i18next'
import { Cable, Layers, Network, Radio, Router as RouterIcon, ShieldCheck, Wifi } from 'lucide-react'
import type { Device, Router, WireGuardStats } from '@/data/mock'
import { isTailscale, isWifi, isWired, routerTabs, tunnelsOf, viewKey, vlansOf, type TopologyView } from './views'

interface Props {
  view: TopologyView
  onChange: (v: TopologyView) => void
  routers: Router[]
  devices: Device[]
  wireguard?: WireGuardStats
  /** VLAN tag → network name reported by the gateway, when known. */
  vlanNames: Record<number, string>
}

function Chip({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  icon?: React.ReactNode
  label: string
  count?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors duration-150 ${
        active ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:bg-hover hover:text-text-primary'
      }`}
    >
      {icon}
      <span className="whitespace-nowrap">{label}</span>
      {count !== undefined && (
        <span className={`tabular-nums text-caption ${active ? 'text-accent/80' : 'text-text-muted'}`}>{count}</span>
      )}
    </button>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-1" role="group" aria-label={label}>
      <span className="px-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">{label}</span>
      {children}
    </div>
  )
}

export function TopologyViewBar({ view, onChange, routers, devices, wireguard, vlanNames }: Props) {
  const { t } = useTranslation()
  const key = viewKey(view)
  const online = devices.filter((d) => d.online !== false)
  const vlans = vlansOf(online)
  const aps = routerTabs(routers)
  const tunnels = tunnelsOf(wireguard)
  const icon = 'h-3.5 w-3.5'

  return (
    <nav
      aria-label={t('topology.views.label')}
      className="flex items-center gap-2 overflow-x-auto rounded-xl border border-border bg-surface p-1 [scrollbar-width:thin]"
    >
      <Group label={t('topology.views.label')}>
        <Chip active={key === 'live'} onClick={() => onChange({ kind: 'live' })} label={t('topology.views.live')} count={online.length} />
        <Chip
          active={key === 'wired'}
          onClick={() => onChange({ kind: 'wired' })}
          icon={<Cable className={icon} strokeWidth={1.75} />}
          label={t('topology.views.wired')}
          count={online.filter(isWired).length}
        />
        <Chip
          active={key === 'wifi'}
          onClick={() => onChange({ kind: 'wifi' })}
          icon={<Wifi className={icon} strokeWidth={1.75} />}
          label={t('topology.views.wifi')}
          count={online.filter(isWifi).length}
        />
      </Group>

      {vlans.length > 0 && (
        <>
          <span className="h-5 w-px shrink-0 bg-border" aria-hidden />
          <Group label={t('topology.views.vlan')}>
            {vlans.map((v) => (
              <Chip
                key={v}
                active={key === `vlan:${v}`}
                onClick={() => onChange({ kind: 'vlan', vlan: v })}
                icon={<Layers className={icon} strokeWidth={1.75} />}
                label={v === 0 ? t('topology.views.untagged') : vlanNames[v] ? `${v} · ${vlanNames[v]}` : `VLAN ${v}`}
                count={online.filter((d) => (v === 0 ? !d.vlan : d.vlan === v)).length}
              />
            ))}
          </Group>
        </>
      )}

      {aps.length > 0 && (
        <>
          <span className="h-5 w-px shrink-0 bg-border" aria-hidden />
          <Group label={t('topology.views.aps')}>
            {aps.map((r) => (
              <Chip
                key={r.id}
                active={key === `router:${r.id}`}
                onClick={() => onChange({ kind: 'router', id: r.id })}
                icon={
                  r.roleBadge === 'AP' ? (
                    <Radio className={icon} strokeWidth={1.75} />
                  ) : (
                    <RouterIcon className={icon} strokeWidth={1.75} />
                  )
                }
                label={r.name}
                count={online.filter((d) => d.routerId === r.id).length}
              />
            ))}
          </Group>
        </>
      )}

      {tunnels.length > 0 && (
        <>
          <span className="h-5 w-px shrink-0 bg-border" aria-hidden />
          <Group label={t('topology.views.vpn')}>
            {tunnels.map((iface) => {
              const peers = (wireguard?.peers ?? []).filter((p) => p.interface === iface)
              return (
                <Chip
                  key={iface}
                  active={key === `tunnel:${iface}`}
                  onClick={() => onChange({ kind: 'tunnel', iface })}
                  icon={
                    isTailscale(iface) ? (
                      <Network className={icon} strokeWidth={1.75} />
                    ) : (
                      <ShieldCheck className={icon} strokeWidth={1.75} />
                    )
                  }
                  label={isTailscale(iface) ? 'Tailscale' : iface}
                  count={peers.filter((p) => p.active || p.online).length}
                />
              )
            })}
          </Group>
        </>
      )}
    </nav>
  )
}
