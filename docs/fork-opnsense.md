# Fork notes: WireGuard from external gateways

This fork ([n0deforge/netpulse-opnsense](https://github.com/n0deforge/netpulse-opnsense))
tracks [gnacho/netpulse](https://github.com/gnacho/netpulse). Each change is a
separate commit, small on purpose so the branch rebases cleanly and every
change can be proposed upstream on its own:

| Change | Area |
|---|---|
| [WireGuard from external gateways](#why) | ingestion contract, server |
| [VLAN of AP clients from the gateway](#vlan-of-ap-clients) | server |
| [24 h WAN total on a fresh install](#24-h-wan-total) | server, bug fix |
| [Topology views](#topology-views) | web app |
| [Tunnel views and peer details](#tunnel-views) | contract, server, web app |

## Why

NetPulse reads WireGuard by opening an SSH session to the gateway and running
`wg show <if> dump` plus `uci show network`. That works on OpenWrt. It does
not work on a gateway that is only reachable through an API, such as an
OPNsense firewall: there is no SSH key to install and no UCI to read, so the
WireGuard panel stays empty even though the firewall knows every peer.

The fix follows the model in [external-integrations.md](external-integrations.md):
the external pusher reads the vendor API and sends the data through the
existing signed ingestion endpoint. The server only needs a neutral place to
receive it.

## The contract change

`probe.PayloadData` gains an optional `wireguard` section
([agent/probe/payload.go](../agent/probe/payload.go)):

```json
"wireguard": {
  "interfaces": ["wg0"],
  "peers": [
    {
      "interface": "wg0",
      "publicKey": "base64 public key",
      "name": "phone",
      "endpoint": "203.0.113.9:4500",
      "allowedIps": "10.9.0.2/32",
      "lastHandshake": 1800000000,
      "rxBytes": 1234,
      "txBytes": 5678
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `interfaces` | Every WireGuard interface on the unit, peers or not |
| `publicKey` | Peer public key, standard base64. Stable identity of the peer |
| `name` | Name configured for the peer on the unit; optional |
| `endpoint` | Last seen `host:port`; empty when the peer has never connected |
| `allowedIps` | Comma separated, the first entry is used as the tunnel IP |
| `lastHandshake` | Unix seconds, `0` = never |
| `rxBytes` / `txBytes` | Cumulative bytes, as in `wg show dump` |
| `online` | Optional. Reachability reported by a control plane (Tailscale); omitted for plain WireGuard |

Absence and emptiness keep the usual meaning: a missing section means the
pusher did not report WireGuard, so the server falls back to its SSH probe. A
present section with no peers means WireGuard answered and has no peers.

## Server behaviour

`pollWireGuard` checks whether the gateway is fed by a fresh agent push that
carries the section. If it does, the stats are built from the payload with the
same `buildWGPeer` the SSH path uses
([wireguard_payload.go](../server-go/internal/adapters/wireguard_payload.go)),
so these behave exactly as before:

- peer naming (NetPulse device name, then the configured name, then the tunnel IP)
- the urgent flag and its push alerts
- connect and disconnect transitions
- the per-peer series and the 30-day transfer window

Gateways without the section, which is every native OpenWrt agent today, keep
the SSH probe unchanged.

## Compatibility

- An older server ignores the unknown `wireguard` key; nothing breaks.
- An older pusher does not send it; the server uses SSH as before.
- No database migration and no UI change.

## VLAN of AP clients

A device's VLAN comes from the FDB of the router it hangs off (#1757). A
Wi-Fi client hangs off its access point, and an AP fed by an external pusher
usually has no VLAN data, so those clients had none. When the client's own
router has no VLAN for it, the server now checks the gateway, which routes
the client and knows the VLAN it sees the MAC on (an OPNsense ARP interface,
a bridge FDB on OpenWrt). The router's own evidence still wins.

## 24 h WAN total

`wanDayStats` estimated the 24 h total as `SUM(rx_bps) × 86400 / n`, which
assumes the table already covers a full day. On a fresh install with an hour
of samples that reports roughly 24 times the real traffic. It now uses the
real spacing of the samples, the same formula `wanRangeStat` adopted in
#2047. The existing test encoded the old assumption and was updated; a new
test covers the fresh-install case.

## Topology views

The topology page gets a view bar above the map:

| View | Shows |
|---|---|
| Live | Everything, as upstream |
| Wired / Wi-Fi | Only cabled or only wireless clients, all APs kept |
| One tab per VLAN | Clients on that VLAN and the routers that carry them; names come from the gateway's networks |
| One tab per access point | That AP and its clients |

A view narrows the input of `buildTopologyModel` (routers, devices, semantic
links and rings) instead of changing the map, so geometry, animation,
tooltips and labels behave as in the live view
([views.ts](../app/src/components/topology/views.ts)). Layout editing stays in
the live view because saved positions apply to the whole map. Labels exist in
English, Spanish, Russian and Chinese.

## Tunnel views

Each WireGuard peer the server returns now carries three optional fields:
`interface` (`wg0`, `tailscale0`), `endpoint` (last direct `host:port`) and
`online` (control-plane presence, from the payload field above). The SSH
probe fills `interface` and `endpoint` too, so OpenWrt gateways benefit.

The view bar uses them for a **VPN** group with one tab per tunnel
interface; `tailscale0` is labelled Tailscale. A tunnel tab is drawn by the
same map as every other view: the tunnel is a hub node hanging off the
gateway and every reachable peer is a client in its ring, with an icon from
the OS the peer reports, tooltips, packet flow proportional to its rate
(derived from the byte counters between snapshots) and drag-to-move layout.
The hub and its peers are virtual, so they do not link to router or device
pages. A peer table below the map lists every peer, offline ones included:

| Status | Meaning |
|---|---|
| Active | Handshake within the last few minutes: traffic is flowing |
| Online, idle | Reachable according to the control plane, no recent traffic (Tailscale) |
| Offline | Neither |

The table adds the tunnel IP, last handshake, whether the link is direct
(with its endpoint) or relayed, and transfer. On the fleet map, a tailnet
peer that is online but idle is drawn as up, since it is reachable. Peers
also expose `os`, `rxBytes` and `txBytes` in the API. Tailscale peers come
from the OPNsense os-tailscale plugin through the OPNsense pusher.

## Running this fork

The image is published to GHCR on every `n0de/v*` tag:

```sh
docker pull ghcr.io/n0deforge/netpulse-opnsense:latest
```

The full stack (server, OPNsense pusher, Wi-Fi controller pusher) with a
compose file and setup steps lives in
[netpulse-integrations-opnsense/deploy/docker](https://github.com/n0deforge/netpulse-integrations-opnsense/tree/opnsense/deploy/docker).
Building from source works exactly as upstream ([docker.md](docker.md)).

## Branches and versions

| Branch / tag | Meaning |
|---|---|
| `main` | Untouched mirror of upstream `main` |
| `opnsense` | Upstream plus the commits of this fork, rebased on upstream |
| `n0de/vX.Y.Z` | Fork release; builds `ghcr.io/n0deforge/netpulse-opnsense:X.Y.Z` and `:latest` |

The image reports its version as `<upstream base>+n0de.X.Y.Z` (for example
`2.53.0+n0de.0.1.1`). Build metadata does not count for version precedence, so
the built-in update check only flags a real upstream release.

Upstream's publishing workflows (`release`, `docker`, `openwrt-package`,
`dist`, `go`) are disabled in this repository's Actions settings rather than
edited, so upstream syncs never conflict on them and a "Sync fork" or a
GitHub Release here publishes nothing upstream-shaped. `pr-checks`,
`gitleaks` and `fork-image` stay enabled. Fork tags also avoid the plain `v*`
prefix as a second guard.

## Upstream status

None of the changes has been proposed upstream yet. The WireGuard section is
neutral, documented and tested, as
[external-integrations.md](external-integrations.md) asks of a contract
change; the VLAN fallback and the WAN total fix are independent of OPNsense
and good candidates on their own. If they are merged there, this fork shrinks
to whatever is left, or disappears.
