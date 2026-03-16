import { useState, useMemo, useEffect, useRef } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { fetchAllNinjaPrices } from './utils/ninja';

interface ItemPrice {
  id: string;
  name: string;
  count: number;
  icon: string;
  frameType: number;
  chaosValue: number;
  divineValue: number;
  totalChaos: number;
  totalDivine: number;
}

export default function App() {
  const [accountName, setAccountName] = useState(localStorage.getItem('poe-account') || '');
  const [poesessid, setPoesessid] = useState(localStorage.getItem('poe-sessid') || '');
  const [league, setLeague] = useState(localStorage.getItem('poe-league') || 'Standard');
  const [activeTab, setActiveTab] = useState<'pricer' | 'login'>(
    (localStorage.getItem('poe-account') && localStorage.getItem('poe-sessid')) ? 'pricer' : 'login'
  );

  // Helper to resolve asset paths correctly on GitHub Pages
  const getAssetPath = (path: string) => {
    const base = import.meta.env.BASE_URL || './';
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    const finalPath = base.endsWith('/') ? `${base}${cleanPath}` : `${base}/${cleanPath}`;
    return finalPath;
  };



  const [selectedTabIndex, setSelectedTabIndex] = useState<number | 'all'>(-1);
  const [tabs, setTabs] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const [search, setSearch] = useState('');

  const [items, setItems] = useState<ItemPrice[]>([]);
  const [divinePrice, setDivinePrice] = useState(1);
  const fetchTaskId = useRef(0);
  const [cooldownTime, setCooldownTime] = useState(0);
  const stashCache = useRef<Map<number, { items: any[], timestamp: number }>>(new Map());

  const handleTabClick = (index: number | 'all') => {
    if (cooldownTime > 0) return;
    setSelectedTabIndex(index);
    setItems([]);
    setStatus("Loading...");
  };

  // Cooldown countdown effect
  useEffect(() => {
    if (cooldownTime > 0) {
      const timer = setInterval(() => {
        setCooldownTime(prev => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [cooldownTime]);

  useEffect(() => {
    if (selectedTabIndex !== -1 && tabs.length > 0 && cooldownTime === 0) {
      calculatePricer();
    }
  }, [selectedTabIndex, tabs.length, cooldownTime]);

  // Automatic Fetch on Startup
  useEffect(() => {
    if (accountName && poesessid && league && tabs.length === 0) {
      loadStashTabsList();
    }
  }, []);

  const saveSettings = () => {
    localStorage.setItem('poe-account', accountName);
    localStorage.setItem('poe-sessid', poesessid);
    localStorage.setItem('poe-league', league);

  };

  const loadStashTabsList = async () => {
    if (!accountName || !poesessid || !league) {
      setError("Please fill in Account Name, POESESSID Cookie, and League.");
      return;
    }

    saveSettings();
    setLoading(true);
    setError(null);
    setStatus("Fetching stash tabs list...");

    try {
      const result = await (window as any).poeAPI.fetchPoeData(
        `https://www.pathofexile.com/character-window/get-stash-items?league=${encodeURIComponent(league)}&accountName=${encodeURIComponent(accountName)}&tabs=1`,
        poesessid
      );

      if (result.error) {
        const errorMsg = String(result.error);
        if (errorMsg.toLowerCase().includes("rate limit") || errorMsg.toLowerCase().includes("429")) {
          const waitSecs = parseInt(result.retryAfter) || 60;
          setError("Rate limit reached: PoE API is blocking requests. Please wait...");
          setCooldownTime(waitSecs);
        } else if (errorMsg.includes("Forbidden")) {
          setError("Forbidden: Session expired or invalid settings. Try to Re-Login on pathofexile.com for a NEW POESESSID and verify your League name.");
        } else {
          setError(result.error);
        }
        return;
      }

      const data = result.data;
      if (data && data.tabs) {
        setTabs(data.tabs);
      } else {
        setError("Could not parse stash tabs list from PoE API");
      }
    } catch (err: any) {
      setError(err.message || "Failed to load stash tabs");
    } finally {
      setLoading(false);
      setStatus("");
    }
  };

  const formatItemName = (item: any) => {
    let name = "";
    const cleanName = item.name ? item.name.replace("<<set:MS>><<set:M>><<set:S>>", "").trim() : "";
    let cleanBase = item.typeLine ? item.typeLine.replace("<<set:MS>><<set:M>><<set:S>>", "").trim() : (item.baseType || "").trim();

    // In 3.25+, maps in the Map Tab might have generic bases like "Map" or "Atlas Map"
    const isGenericMap = cleanBase === "Map" || cleanBase === "Atlas Map";
    const isMap = isGenericMap || cleanBase.toLowerCase().includes("map") || item.icon?.includes("/Maps/");

    if (isMap) {
      // For pricing compatibility, we use "Map" as base for generic tier entries
      name = isGenericMap ? "Map" : cleanBase;
    } else if (item.frameType === 3 || item.frameType === 9) {
      name = cleanName || cleanBase;
    } else if (item.frameType === 2) {
      name = cleanName && cleanBase ? `${cleanName} (${cleanBase})` : (cleanName || cleanBase);
    } else {
      name = cleanBase || cleanName;
    }

    if (item.properties) {
      const mapTierProp = item.properties.find((p: any) => p.name === "Map Tier");
      if (mapTierProp && mapTierProp.values && mapTierProp.values[0]) {
        const tier = mapTierProp.values[0][0];
        if (!name.includes(`(Tier ${tier})`)) {
          name += ` (Tier ${tier})`;
        }
      }
    }

    name = name.replace("Superior ", "");
    return name;
  };

  const [ninjaPrices, setNinjaPrices] = useState<Map<string, number>>(new Map());

  const calculatePricer = async () => {
    if (!accountName || !poesessid || !league || cooldownTime > 0) return;
    if (tabs.length === 0) return;

    // Increment Task ID to "cancel" any previous running calculatePricer loops
    const taskId = ++fetchTaskId.current;

    // 1. Debounce: Wait a moment before starting the actual fetch
    await new Promise(r => setTimeout(r, 500));
    if (taskId !== fetchTaskId.current) return;

    setLoading(true);
    setError(null);

    try {
      let localDivPrice = divinePrice;
      let currentNinja = ninjaPrices;

      // 2. Fetch Ninja prices if needed
      if (ninjaPrices.size === 0) {
        setStatus("Fetching market prices (Ninja)...");
        const { prices, divinePrice: currentDivPrice } = await fetchAllNinjaPrices(league, setStatus);
        setNinjaPrices(prices);
        setDivinePrice(currentDivPrice);
        currentNinja = prices;
        localDivPrice = currentDivPrice;
      }

      if (taskId !== fetchTaskId.current) return;

      let allRawItems = new Map<string, any>();
      const tabsToFetch = selectedTabIndex === 'all' ? tabs.map((_, i) => i) : [selectedTabIndex];

      // Cache duration: 10 minutes
      const CACHE_EXPIRY = 10 * 60 * 1000;
      const now = Date.now();

      // 3. Fetch Stash Items (Check Cache First)
      for (let i = 0; i < tabsToFetch.length; i++) {
        if (taskId !== fetchTaskId.current) return;

        const tabIndex = tabsToFetch[i];
        if (tabIndex === -1) continue;

        const cached = stashCache.current.get(tabIndex);
        const isExpired = !cached || (now - cached.timestamp) > CACHE_EXPIRY;

        if (!isExpired && cached) {
          // Use cached data
          cached.items.forEach((item: any) => {
            const name = formatItemName(item);
            const count = item.count;
            if (allRawItems.has(name)) {
              let existing = allRawItems.get(name);
              existing.count += count;
              allRawItems.set(name, existing);
            } else {
              allRawItems.set(name, { ...item });
            }
          });
        } else {
          // Fetch from API
          setStatus(`Fetching stash items... (${i + 1}/${tabsToFetch.length})`);
          try {
            const currentTab = tabs[tabIndex];
            const isMapTab = currentTab?.type === 'MapStash';
            let apiUrl = `https://www.pathofexile.com/character-window/get-stash-items?accountName=${encodeURIComponent(accountName)}&league=${encodeURIComponent(league)}&tabs=0&tabIndex=${tabIndex}${isMapTab ? '&map=1' : ''}`;

            let result = await (window as any).poeAPI.fetchPoeData(apiUrl, poesessid);

            // SPECIAL CASE: If Map Tab with &map=1 fails with Forbidden, try without it
            if (result.error && String(result.error).includes("Forbidden") && isMapTab && apiUrl.includes("&map=1")) {
              apiUrl = apiUrl.replace("&map=1", "");
              result = await (window as any).poeAPI.fetchPoeData(apiUrl, poesessid);
            }

            if (taskId !== fetchTaskId.current) return;

            if (result.error) {
              const errorMsg = String(result.error);
              if (errorMsg.includes("rate limit") || errorMsg.toLowerCase().includes("429")) {
                const waitSecs = parseInt(result.retryAfter as string) || 60;
                setError(`RATE LIMIT REACHED! Please wait...`);
                setCooldownTime(waitSecs);
                break;
              }

              if (errorMsg.includes("Forbidden")) {
                setError("Forbidden: Session might be expired or blocked. Try to Log Out and Log In again on pathofexile.com to get a fresh POESESSID.");
              } else {
                setError(result.error);
              }
              break;
            }

            const tabData = result.data;
            if (tabData && tabData.items) {
              const processedItems = tabData.items.map((item: any) => ({
                id: item.id || Math.random().toString(),
                name: formatItemName(item),
                count: item.stackSize || 1,
                icon: item.icon ? item.icon.replace(/\?.*$/, '') : '',
                frameType: item.frameType
              }));

              // Update Cache
              stashCache.current.set(tabIndex, { items: processedItems, timestamp: now });

              processedItems.forEach((item: any) => {
                if (allRawItems.has(item.name)) {
                  let existing = allRawItems.get(item.name);
                  existing.count += item.count;
                  allRawItems.set(item.name, existing);
                } else {
                  allRawItems.set(item.name, { ...item });
                }
              });
            }

            // Safety delay ONLY if we actually made a request
            if (tabsToFetch.length > 1 && i < tabsToFetch.length - 1) {
              await new Promise(r => setTimeout(r, 2000));
            }
          } catch (tabErr: any) {
            console.error("Tab fetch error:", tabErr);
          }
        }

        // Update UI
        const currentItems: ItemPrice[] = Array.from(allRawItems.values()).map(val => {
          let chaosValue = currentNinja.get(val.name) || 0;

          // Fallback check for uniques: Ninja sometimes stores just the name, and stash might have base
          if (chaosValue === 0 && (val.frameType === 3 || val.frameType === 9)) {
            // We could try to match just the name if it's formatted wrongly, but Ninja is usually fine
          }

          if (val.name === "Divine Orb") chaosValue = localDivPrice;
          const dPrice = localDivPrice || 1;
          return {
            id: val.id, name: val.name, count: val.count, icon: val.icon,
            frameType: val.frameType,
            chaosValue: chaosValue,
            divineValue: chaosValue / dPrice,
            totalChaos: chaosValue * val.count,
            totalDivine: (chaosValue * val.count) / dPrice
          }
        });
        setItems(currentItems.sort((a, b) => b.totalChaos - a.totalChaos));
      }
    } catch (err: any) {
      setError(err.message || "Pricing failed");
    } finally {
      if (taskId === fetchTaskId.current) {
        setLoading(false);
        setStatus("");
      }
    }
  };

  const handleManualRefresh = () => {
    stashCache.current.clear();
    setItems([]);
    calculatePricer();
  };

  const filteredItems = useMemo(() => {
    if (!search) return items;
    return items.filter(it => it.name.toLowerCase().includes(search.toLowerCase()));
  }, [items, search]);

  const totalChaos = useMemo(() => filteredItems.reduce((acc, item) => acc + item.totalChaos, 0), [filteredItems]);
  const totalDivine = useMemo(() => filteredItems.reduce((acc, item) => acc + item.totalDivine, 0), [filteredItems]);

  return (
    <div>

      {/* FULL WIDTH HEADER */}
      <div className="poe-login-header">
        <div className="header-container" style={{ alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            {accountName && (
              <div className="poe-user-info">
                <div>
                  <span className="muted">Logged in as</span>
                  <span className="username">{accountName}</span>
                </div>
                <div className="poe-sub-links">
                  <button className="link-btn" onClick={() => setActiveTab('login')}>SETTINGS</button>
                  <button className="link-btn" onClick={() => { localStorage.clear(); window.location.reload(); }}>LOG OUT</button>
                </div>
              </div>
            )}
          </div>

          <div className="header-logo" onClick={() => setActiveTab('pricer')} style={{ cursor: 'pointer', flex: 1, textAlign: 'center', display: 'flex', justifyContent: 'center' }}>
            <img
              src={getAssetPath('/default.webp')}
              alt="Path of Exile"
              style={{ height: '160px', display: 'block' }}
            />
          </div>

          <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
            {/* Placeholder to keep logo perfectly centered */}
          </div>
        </div>
      </div>

      <div className="container" style={{ maxWidth: '1200px' }}>
        {activeTab === 'login' ? (
          <div className="glass-panel" style={{ maxWidth: '600px', margin: '4rem auto' }}>
            <h2 style={{ border: 'none', textAlign: 'center', marginBottom: '2rem' }}>POE ACCOUNT LOGIN</h2>
            <div className="setup-form">
              <div className="input-group">
                <label>Account Name</label>
                <input type="text" placeholder="e.g. YoloSwaggYolo" value={accountName} onChange={e => setAccountName(e.target.value)} />
              </div>
              <div className="input-group">
                <label>POESESSID</label>
                <input type="password" placeholder="Your session cookie" value={poesessid} onChange={e => setPoesessid(e.target.value)} />
              </div>
              <div className="input-group">
                <label>League</label>
                <input type="text" placeholder="Standard, Settlers, etc." value={league} onChange={e => setLeague(e.target.value)} />
              </div>
              <button className="btn btn-primary" onClick={() => { loadStashTabsList(); setActiveTab('pricer'); }} disabled={loading}>
                <RefreshCw size={18} className={loading && status.includes('tabs') ? 'animate-spin' : ''} />
                CONNECT & FETCH TABS
              </button>
              {error && <div className="error-message">{error}</div>}
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '1rem', textAlign: 'center' }}>
                Settings are saved locally. You only need to login once.
              </p>
            </div>
          </div>
        ) : activeTab === 'pricer' ? (
          <div className="dashboard">
            {/* 1. TOTAL VALUES AT THE TOP */}
            <div className="stats-grid" style={{ marginBottom: '1rem' }}>
              <div className="stat-card glass-panel premium-border">
                <div className="stat-title">Total Value</div>
                <div className="stat-value divine">
                  {totalDivine.toFixed(2)} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>Divines</span>
                </div>
              </div>
              <div className="stat-card glass-panel">
                <div className="stat-title">Chaos Equivalent</div>
                <div className="stat-value text-chaos" style={{ color: 'var(--chaos)' }}>
                  {Math.round(totalChaos).toLocaleString()} <span style={{ fontSize: '1rem' }}>c</span>
                </div>
              </div>
              <div className="stat-card glass-panel">
                <div className="stat-title">Divine Price (ninja)</div>
                <div className="stat-value">{Math.round(divinePrice)}c</div>
              </div>
            </div>

            {error && (
              <div className="glass-panel error-banner" style={{ marginBottom: '1rem', border: '1px solid #ff4444', animation: 'flash 2s infinite' }}>
                <div style={{ flex: 1 }}>
                  <span style={{ color: '#ff4444', fontWeight: 'bold' }}>⚠️ ERROR: </span>
                  <span style={{ color: '#ff8888' }}>{error}</span>
                  {cooldownTime > 0 && (
                    <div style={{ marginTop: '0.4rem', color: '#ffea32', fontWeight: 'bold', fontSize: '1.1rem' }}>
                      RETRYING IN: {cooldownTime}s
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 2. SEARCH BAR & MIN PRICE */}
            <div className="filters-bar glass-panel" style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', flex: 1, margin: 0, position: 'relative' }}>
                <Search size={18} style={{ color: 'var(--text-muted)', position: 'absolute', marginLeft: '1rem' }} />
                <input
                  type="text"
                  placeholder="Search items by name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ width: '100%', paddingLeft: '2.5rem', margin: 0 }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                <button
                  className="btn"
                  onClick={handleManualRefresh}
                  title="Force Refresh (Clears Cache)"
                  disabled={loading || cooldownTime > 0}
                  style={{ padding: '0.4rem', background: 'transparent', boxShadow: 'none' }}
                >
                  <RefreshCw size={18} className={loading ? 'animate-spin' : ''} style={{ color: 'var(--accent)' }} />
                </button>
              </div>
              {status && <span className="status-text" style={{ color: 'var(--accent)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{status}</span>}
            </div>

            {/* 3. TABS */}
            {tabs.length > 0 && (
              <div className="poe-tabs-container custom-scrollbar" style={{ overflowX: 'auto', flexWrap: 'nowrap', marginBottom: '1px' }}>
                <button
                  className={`poe-tab poe-tab-all ${selectedTabIndex === 'all' ? 'active' : ''}`}
                  onClick={() => handleTabClick('all')}
                >
                  ALL TABS
                </button>
                {tabs.map((tab, i) => {
                  const rgb = tab.colour ? `#${tab.colour.r.toString(16).padStart(2, '0')}${tab.colour.g.toString(16).padStart(2, '0')}${tab.colour.b.toString(16).padStart(2, '0')}` : '#2a2319';
                  return (
                    <button
                      key={tab.id}
                      className={`poe-tab ${selectedTabIndex === i ? 'active' : ''}`}
                      style={{ '--tag-color': rgb, whiteSpace: 'nowrap' } as React.CSSProperties}
                      onClick={() => handleTabClick(i)}
                    >
                      {tab.n}
                    </button>
                  )
                })}
              </div>
            )}

            {/* 4. ITEMS LIST */}
            <div className="dashboard-content" style={{ padding: 0 }}>
              <div className="items-table-container glass-panel" style={{ padding: 0, overflow: 'hidden', borderTop: 'none', borderRadius: '0 0 4px 4px' }}>
                <div style={{ maxHeight: '550px', overflowY: 'auto' }} className="custom-scrollbar">
                  <table className="items-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                        <th style={{ textAlign: 'right' }}>Unit Price</th>
                        <th style={{ textAlign: 'right' }}>Total Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.map(item => (
                        <tr key={item.id}>
                          <td>
                            <div className="item-name">
                              {item.icon && <img src={item.icon} alt={item.name} className="item-icon" loading="lazy" />}
                              <span className={`rarity-${item.frameType}`}>{item.name}</span>
                            </div>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: '#e2e8f0' }}>x{item.count.toLocaleString()}</td>
                          <td style={{ textAlign: 'right' }}>
                            {item.chaosValue > 0
                              ? (item.chaosValue >= divinePrice
                                ? <span className="divine">{item.divineValue.toFixed(2)} div</span>
                                : <span style={{ color: 'var(--chaos)' }}>{item.chaosValue.toFixed(2)} c</span>)
                              : <span style={{ opacity: 0.3 }}>---</span>
                            }
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>
                            {item.totalChaos > 0
                              ? (item.totalChaos >= divinePrice
                                ? <span className="divine">{item.totalDivine.toFixed(2)} div</span>
                                : <span style={{ color: 'var(--chaos)' }}>{Math.round(item.totalChaos).toLocaleString()} c</span>)
                              : <span style={{ opacity: 0.3 }}>---</span>
                            }
                          </td>
                        </tr>
                      ))}
                      {filteredItems.length === 0 && (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            {loading ? "Discovering items..." : "No items match your filters."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
