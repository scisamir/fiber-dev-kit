"use client";
import { useState, useEffect } from "react";

const NAV = [
  { head: "Getting started", links: [
    { id:"demo",        label:"Quick demo"      },
    { id:"install",     label:"Installation"    },
    { id:"quickstart",  label:"First payment"   },
  ]},
  { head: "@fiber-dev-kit/core", links: [
    { id:"core-client",      label:"FiberClient"         },
    { id:"core-events",      label:"FiberEventClient"    },
    { id:"core-diagnose",    label:"diagnose()"          },
    { id:"core-alerts",      label:"evaluateAlerts()"    },
    { id:"core-utils",       label:"Amount utilities"    },
  ]},
  { head: "@fiber-dev-kit/test-client", links: [
    { id:"tc-network",   label:"FiberNetwork"         },
    { id:"tc-confidence",label:"routeConfidence()"     },
    { id:"tc-assert",    label:"Assertions"           },
    { id:"tc-simulate",  label:"Failure simulations"  },
  ]},
  { head: "@fiber-dev-kit/inspector", links: [
    { id:"insp-cli",  label:"CLI usage"     },
    { id:"insp-lib",  label:"As a library"  },
  ]},
  { head: "@fiber-dev-kit/cli", links: [
    { id:"cli-start",    label:"fiber start"           },
    { id:"cli-connect",  label:"fiber connect"         },
    { id:"cli-channel",  label:"fiber channel"         },
    { id:"cli-pay",      label:"fiber pay"             },
    { id:"cli-status",   label:"fiber status / doctor" },
    { id:"cli-env",      label:"Environment variables" },
  ]},
];

export default function DocsSidebar() {
  const [active, setActive] = useState("demo");
  useEffect(() => {
    const ids = NAV.flatMap(s => s.links.map(l => l.id));
    const obs = new IntersectionObserver(
      entries => { const v = entries.filter(e => e.isIntersecting); if (v.length) setActive(v[0].target.id); },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    ids.forEach(id => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);
  const go = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior:"smooth", block:"start" });
    setActive(id);
  };
  return (
    <aside className="sidebar">
      {NAV.map(({ head, links }) => (
        <div key={head} className="sb-group">
          <div className="sb-head">{head}</div>
          {links.map(({ id, label }) => (
            <button key={id} className={`sb-link${active===id?" on":""}`} onClick={() => go(id)}>{label}</button>
          ))}
        </div>
      ))}
    </aside>
  );
}
