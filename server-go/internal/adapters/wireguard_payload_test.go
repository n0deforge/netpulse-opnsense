package adapters

import (
	"testing"

	"github.com/gnacho/netpulse/agent/probe"
)

func TestWireGuardStatsFromPayload(t *testing.T) {
	now := int64(1_800_000_000)
	wg := &probe.WireGuardData{
		Interfaces: []string{"wg0"},
		Peers: []probe.WireGuardPeer{
			{Interface: "wg0", PublicKey: "aGVsbG8gd29ybGQgaGVsbG8gd29ybGQgaGVsbG8gd28=", Name: "phone",
				AllowedIPs: "10.9.0.2/32", LastHandshake: now - 30, RxBytes: 2048, TxBytes: 4096},
			{Interface: "wg0", PublicKey: "Ym9vbWJvb21ib29tYm9vbWJvb21ib29tYm9vbWJvb20=",
				AllowedIPs: "10.9.0.3/32", LastHandshake: 0},
			{Interface: "wg0", PublicKey: ""},
		},
	}
	s := WireGuardStatsFromPayload(wg, map[string]WGPeerName{}, map[string]bool{}, now)
	if s.Status != "active" || s.Interface != "wg0" {
		t.Fatalf("status/interface = %q/%q", s.Status, s.Interface)
	}
	if len(s.Peers) != 2 {
		t.Fatalf("peers = %d, want 2 (blank key skipped)", len(s.Peers))
	}
	if p := s.Peers[0]; p.Name != "phone" || !p.Active || p.TunnelIP != "10.9.0.2" || p.RxBytes != 2048 || p.Key == "" {
		t.Fatalf("peer0 = %+v", p)
	}
	if s.Peers[0].Interface != "wg0" || s.Peers[0].Online != nil {
		t.Fatalf("peer0 interface/online = %q/%v", s.Peers[0].Interface, s.Peers[0].Online)
	}
	if p := s.Peers[1]; p.Active || p.Name != "10.9.0.3" {
		t.Fatalf("peer1 = %+v", p)
	}
	if s.Transfer == nil {
		t.Fatal("transfer missing")
	}
	on := true
	ts := WireGuardStatsFromPayload(&probe.WireGuardData{Interfaces: []string{"tailscale0"}, Peers: []probe.WireGuardPeer{
		{Interface: "tailscale0", PublicKey: "nodekey:abcd", Name: "laptop", AllowedIPs: "100.64.0.2/32", Endpoint: "192.0.2.10:41641", Online: &on},
	}}, map[string]WGPeerName{}, map[string]bool{}, now)
	if p := ts.Peers[0]; p.Interface != "tailscale0" || p.Online == nil || !*p.Online || p.Active || p.Endpoint != "192.0.2.10:41641" {
		t.Fatalf("tailscale peer = %+v", p)
	}
	empty := WireGuardStatsFromPayload(&probe.WireGuardData{}, nil, nil, now)
	if empty.Status != "inactive" {
		t.Fatalf("empty status = %q", empty.Status)
	}
}
