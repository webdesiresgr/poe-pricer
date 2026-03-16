interface NinjaCategory {
    type: string;
    name: string;
}

const NINJA_CATEGORIES: NinjaCategory[] = [
    { type: 'currencyoverview', name: 'Currency' },
    { type: 'currencyoverview', name: 'Fragment' },
    { type: 'itemoverview', name: 'DivinationCard' },
    { type: 'itemoverview', name: 'Scarab' },
    { type: 'itemoverview', name: 'Fossil' },
    { type: 'itemoverview', name: 'Resonator' },
    { type: 'itemoverview', name: 'Essence' },
    { type: 'itemoverview', name: 'Oil' },
    { type: 'itemoverview', name: 'Incubator' },
    { type: 'itemoverview', name: 'UniqueWeapon' },
    { type: 'itemoverview', name: 'UniqueArmour' },
    { type: 'itemoverview', name: 'UniqueAccessory' },
    { type: 'itemoverview', name: 'UniqueFlask' },
    { type: 'itemoverview', name: 'UniqueJewel' },
    { type: 'itemoverview', name: 'SkillGem' },
    { type: 'itemoverview', name: 'Map' },
    { type: 'itemoverview', name: 'Tattoo' },
    { type: 'itemoverview', name: 'Omen' },
    { type: 'itemoverview', name: 'Artifact' },
    { type: 'itemoverview', name: 'Vial' },
    { type: 'itemoverview', name: 'BlightedMap' },
    { type: 'itemoverview', name: 'Invitation' },
    { type: 'itemoverview', name: 'DeliriumOrb' },
];

export async function fetchAllNinjaPrices(league: string, onProgress: (progress: string) => void) {
    const prices = new Map<string, number>();
    let divinePrice = 140; // Default fallback

    // Parallel requests to speed up fetching dramatically
    const fetchPromises = NINJA_CATEGORIES.map(async (cat) => {
        const url = `https://poe.ninja/api/data/${cat.type}?league=${league}&type=${cat.name}`;
        try {
            const { data, error } = await window.poeAPI.fetchNinjaData(url);

            if (!error && data && data.lines) {
                if (cat.type === 'currencyoverview') {
                    data.lines.forEach((line: any) => {
                        if (line.currencyTypeName === 'Divine Orb' && line.chaosEquivalent) {
                            divinePrice = line.chaosEquivalent;
                        }
                        if (line.currencyTypeName && line.chaosEquivalent) {
                            prices.set(line.currencyTypeName, line.chaosEquivalent);
                        }
                    });
                } else {
                    data.lines.forEach((line: any) => {
                        // For gems, maps, uniques, name + variants are critical
                        let itemName = line.name;
                        if (line.baseType && !itemName) itemName = line.baseType;
                        if ((cat.name === 'Map' || cat.name === 'BlightedMap') && line.mapTier) itemName += ` (Tier ${line.mapTier})`;

                        if (itemName && line.chaosValue) {
                            // For unique items, we map by name. If uncorrupted/links differ, poe.ninja has more fields, but we do basic name matching for bulk
                            // Store the highest value or basic value
                            if (!prices.has(itemName)) {
                                prices.set(itemName, line.chaosValue);
                            }
                        }
                    });
                }
            }
        } catch (err) {
            console.error(`Failed to fetch ninja prices for ${cat.name}:`, err);
        }
    });

    onProgress(`Fetching poe.ninja prices (0/${NINJA_CATEGORIES.length})...`);

    let completed = 0;
    for (const p of fetchPromises) {
        p.then(() => {
            completed++;
            onProgress(`Fetching poe.ninja prices (${completed}/${NINJA_CATEGORIES.length})...`);
        });
    }

    await Promise.allSettled(fetchPromises);

    // Fallback Tier Prices (if Ninja is missing generic entries)
    for (let t = 1; t <= 16; t++) {
        const key = `Map (Tier ${t})`;
        if (!prices.has(key)) {
            const fallback = t === 16 ? 5 : (t >= 14 ? 2 : 1);
            prices.set(key, fallback);
        }
    }
    if (!prices.has('Map (Tier 17)')) prices.set('Map (Tier 17)', 60);

    // Common aliases mapping
    prices.set('Chaos Orb', 1);
    prices.set('Divine Orb', divinePrice);
    return { prices, divinePrice };
}
