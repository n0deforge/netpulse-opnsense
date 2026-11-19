package adapters

import "testing"

func TestFillVlanFromGateway(t *testing.T) {
	polled := map[string]*routerPolled{
		"gw": {fdbVlans: map[string]int{"AA:00:00:00:00:01": 10, "AA:00:00:00:00:02": 20, "AA:00:00:00:00:03": 30}},
		"ap": {fdbVlans: map[string]int{}},
	}
	cases := []struct {
		name     string
		dev      Device
		wantVlan int
		wantKnow bool
	}{
		{"AP client without VLAN takes the gateway's", Device{MAC: "aa:00:00:00:00:01", RouterID: "ap"}, 10, true},
		{"own router evidence wins", Device{MAC: "AA:00:00:00:00:02", RouterID: "ap", Vlan: 99, VlanKnown: true}, 99, true},
		{"gateway clients are left to the #1757 pass", Device{MAC: "AA:00:00:00:00:03", RouterID: "gw"}, 0, false},
		{"MAC unknown to the gateway stays unknown", Device{MAC: "AA:00:00:00:00:09", RouterID: "ap"}, 0, false},
		{"no MAC", Device{RouterID: "ap"}, 0, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			devs := []Device{c.dev}
			fillVlanFromGateway(devs, polled, "gw")
			if devs[0].Vlan != c.wantVlan || devs[0].VlanKnown != c.wantKnow {
				t.Fatalf("vlan=%d known=%v, want %d/%v", devs[0].Vlan, devs[0].VlanKnown, c.wantVlan, c.wantKnow)
			}
		})
	}
	// No gateway, or a gateway without VLAN data: nothing changes, no panic.
	devs := []Device{{MAC: "AA:00:00:00:00:01", RouterID: "ap"}}
	fillVlanFromGateway(devs, polled, "")
	fillVlanFromGateway(devs, map[string]*routerPolled{}, "gw")
	if devs[0].Vlan != 0 {
		t.Fatalf("vlan changed without gateway data: %d", devs[0].Vlan)
	}
}
