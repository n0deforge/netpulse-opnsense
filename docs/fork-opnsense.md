# Fork notes: WireGuard from external gateways

This fork ([n0deforge/netpulse-opnsense](https://github.com/n0deforge/netpulse-opnsense))
tracks [gnacho/netpulse](https://github.com/gnacho/netpulse). It carries one
change to the ingestion contract and the server, kept small on purpose so it
rebases cleanly and can be proposed upstream.

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

Fork tags never use the plain `v*` prefix, so the upstream release, OpenWrt
package and Docker workflows do not fire on this repository.

## Upstream status

The change is neutral, documented and tested, which is what
[external-integrations.md](external-integrations.md) asks of a core contract
change. It has not been proposed upstream yet. If it is merged there, this
fork becomes unnecessary and the stack can point back at upstream images.
