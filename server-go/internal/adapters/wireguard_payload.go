package adapters

import (
	"strings"

	"github.com/gnacho/netpulse/agent/probe"
)

// WireGuardStatsFromPayload builds the gateway WireGuard view from a pushed
// payload section (an external gateway such as OPNsense, read through its
// API) with the same peer builder the SSH probe uses, so names, urgency,
// alerts and the 30-day series behave identically.
func WireGuardStatsFromPayload(wg *probe.WireGuardData, peerNames map[string]WGPeerName, urgent map[string]bool, nowSec int64) *WireGuardStats {
	stats := &WireGuardStats{
		Interface: strings.Join(wg.Interfaces, ", "),
		Status:    "active",
		Peers:     []WGPeer{},
	}
	if len(wg.Interfaces) == 0 && len(wg.Peers) == 0 {
		stats.Status = "inactive"
		return stats
	}
	descs := map[string]string{}
	var sumRx, sumTx int64
	for i, p := range wg.Peers {
		if strings.TrimSpace(p.PublicKey) == "" {
			continue
		}
		if p.Name != "" {
			descs[p.PublicKey] = p.Name
		}
		d := WGDumpPeer{
			Pubkey:       p.PublicKey,
			AllowedIPs:   p.AllowedIPs,
			HandshakeSec: p.LastHandshake,
			RxBytes:      p.RxBytes,
			TxBytes:      p.TxBytes,
		}
		if p.Endpoint != "" {
			ep := p.Endpoint
			d.Endpoint = &ep
		}
		stats.Peers = append(stats.Peers, buildWGPeer(d, peerNames, descs, nowSec, i+1, urgent))
		sumRx += p.RxBytes
		sumTx += p.TxBytes
	}
	if len(stats.Peers) > 0 {
		stats.Transfer = &WGTransfer{Rx: fmtBytes(float64(sumRx)), Tx: fmtBytes(float64(sumTx))}
	}
	return stats
}
