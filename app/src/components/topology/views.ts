/**
 * Topology views (n0deforge fork, docs/fork-opnsense.md).
 *
 * The map always draws the whole fleet. A view narrows the INPUT of
 * buildTopologyModel instead of touching the map: it keeps a subset of the
 * devices, the infrastructure that carries them (the gateway always stays as
 * the centre) and the semantic links/rings that only reference what is kept.
 * Geometry, animation, tooltips and layout editing stay exactly as in the
 * live view.
 */
import type { Device, DistributionNode, Router, TopoSemantics, WireGuardStats } from '@/data/mock'

export type TopologyView =
  | { kind: 'live' }
  | { kind: 'wired' }
  | { kind: 'wifi' }
  | { kind: 'vlan'; vlan: number } // 0 = devices without a known VLAN
  | { kind: 'router'; id: string }
  | { kind: 'tunnel'; iface: string }

export function viewKey(v: TopologyView): string {
  switch (v.kind) {
    case 'vlan':
      return `vlan:${v.vlan}`
    case 'router':
      return `router:${v.id}`
    case 'tunnel':
      return `tunnel:${v.iface}`
    default:
      return v.kind
  }
}

export function parseViewKey(key: string | null | undefined): TopologyView {
  if (!key) return { kind: 'live' }
  if (key === 'wired' || key === 'wifi' || key === 'live') return { kind: key }
  if (key.startsWith('vlan:')) {
    const n = Number(key.slice(5))
    if (Number.isInteger(n) && n >= 0) return { kind: 'vlan', vlan: n }
  }
  if (key.startsWith('router:') && key.length > 7) return { kind: 'router', id: key.slice(7) }
  if (key.startsWith('tunnel:') && key.length > 7) return { kind: 'tunnel', iface: key.slice(7) }
  return { kind: 'live' }
}

export const isWifi = (d: Device) => typeof d.band === 'string' && d.band.includes('GHz')
export const isWired = (d: Device) => d.band === 'cable'

export function gatewayOf(routers: Router[]): Router | undefined {
  return routers.find((r) => r.roleBadge === 'Principal') ?? routers[0]
}

/** VLAN tags seen on devices, ascending; 0 is added when some device has none. */
export function vlansOf(devices: Device[]): number[] {
  const set = new Set<number>()
  let untagged = false
  for (const d of devices) {
    if (d.vlan && d.vlan > 0) set.add(d.vlan)
    else untagged = true
  }
  const out = [...set].sort((a, b) => a - b)
  if (untagged && out.length > 0) out.push(0)
  return out
}

/** Access points and other non-gateway routers that get their own tab. */
export function routerTabs(routers: Router[]): Router[] {
  const gw = gatewayOf(routers)
  return routers.filter((r) => r.id !== gw?.id && r.roleBadge !== 'SW')
}

/** Tunnel interfaces that have peers, in a stable order (Tailscale last). */
export function tunnelsOf(wireguard: WireGuardStats | undefined): string[] {
  const set = new Set<string>()
  for (const p of wireguard?.peers ?? []) if (p.interface) set.add(p.interface)
  return [...set].sort((a, b) => Number(isTailscale(a)) - Number(isTailscale(b)) || a.localeCompare(b))
}

export const isTailscale = (iface: string) => iface.startsWith('tailscale')

export interface ViewInput {
  routers: Router[]
  devices: Device[]
  wireguard: WireGuardStats
  distributionNodes: DistributionNode[]
  topology?: TopoSemantics
}

function deviceFilter(view: TopologyView): ((d: Device) => boolean) | null {
  switch (view.kind) {
    case 'wired':
      return isWired
    case 'wifi':
      return isWifi
    case 'vlan':
      return (d) => (view.vlan === 0 ? !d.vlan : d.vlan === view.vlan)
    case 'router':
      return (d) => d.routerId === view.id || d.attachTo === view.id
    default:
      return null
  }
}

export function applyTopologyView(input: ViewInput, view: TopologyView): ViewInput {
  const keep = deviceFilter(view)
  if (!keep) return input

  const devices = input.devices.filter(keep)
  const deviceIds = new Set(devices.map((d) => d.id))
  const gw = gatewayOf(input.routers)

  // Infrastructure: the gateway always; a router tab shows its router; the
  // other views keep every router that carries at least one of the kept devices
  // (wired and Wi-Fi keep all APs, so empty radios are visible too).
  const carriers = new Set(devices.map((d) => d.routerId))
  const routers = input.routers.filter((r) => {
    if (r.id === gw?.id) return true
    if (view.kind === 'router') return r.id === view.id
    if (view.kind === 'wired' || view.kind === 'wifi') return r.roleBadge !== 'SW' || carriers.has(r.id)
    return carriers.has(r.id)
  })
  const routerIds = new Set(routers.map((r) => r.id))
  const distributionNodes = input.distributionNodes.filter((n) => routerIds.has(n.routerId))
  const distIds = new Set(distributionNodes.map((n) => n.id))
  const known = (id: string) => id === 'internet' || routerIds.has(id) || deviceIds.has(id) || distIds.has(id)

  let topology = input.topology
  if (topology) {
    const rings: Record<string, string[]> = {}
    for (const [rid, ids] of Object.entries(topology.rings ?? {})) {
      if (routerIds.has(rid) || distIds.has(rid)) rings[rid] = ids.filter((id) => deviceIds.has(id))
    }
    topology = {
      links: topology.links.filter((l) => known(l.from) && known(l.to)),
      rings,
      // "+N" counts belong to the full ring; in a narrowed view every kept
      // client is drawn, so the counters are dropped instead of lying.
      hiddenPeers: undefined,
    }
  }

  // WireGuard peers hang off the gateway in the live view only.
  const wireguard: WireGuardStats = { ...input.wireguard, peers: [] }
  return { routers, devices, wireguard, distributionNodes, topology }
}
