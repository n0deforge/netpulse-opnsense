package adapters

import "strings"

// fillVlanFromGateway completes the #1757 VLAN pass for clients whose own
// router has no FDB VLAN for them. A Wi-Fi client hangs off its access point,
// and an AP without a VLAN-filtering bridge (a dumb AP, or one fed by an
// external pusher) learns nothing per VLAN, so those clients stayed without a
// VLAN even when the gateway routes them and knows exactly which VLAN it sees
// their MAC on. The router's own evidence always wins: this only fills gaps,
// and a hypervisor tag= applied later still takes precedence.
func fillVlanFromGateway(devices []Device, polled map[string]*routerPolled, gwID string) {
	if gwID == "" {
		return
	}
	gw := polled[gwID]
	if gw == nil || len(gw.fdbVlans) == 0 {
		return
	}
	for i := range devices {
		d := &devices[i]
		if d.Vlan > 0 || d.MAC == "" || d.RouterID == gwID {
			continue
		}
		if v := gw.fdbVlans[strings.ToUpper(d.MAC)]; v > 0 {
			d.Vlan = v
			d.VlanKnown = true
		}
	}
}
