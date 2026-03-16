export async function fetchStashTabs(accountName: string, league: string, cookie: string) {
    const safeAccount = encodeURIComponent(accountName);
    const safeLeague = encodeURIComponent(league);
    const url = `https://www.pathofexile.com/character-window/get-stash-items?accountName=${safeAccount}&league=${safeLeague}&tabs=1&tabIndex=0`;
    const { data, error } = await window.poeAPI.fetchPoeData(url, cookie);
    if (error) {
        throw new Error(typeof error === 'object' ? JSON.stringify(error) : error);
    }
    return data;
}

export async function fetchStashTab(accountName: string, league: string, tabIndex: number, cookie: string) {
    const safeAccount = encodeURIComponent(accountName);
    const safeLeague = encodeURIComponent(league);
    const url = `https://www.pathofexile.com/character-window/get-stash-items?accountName=${safeAccount}&league=${safeLeague}&tabs=0&tabIndex=${tabIndex}`;
    const { data, error } = await window.poeAPI.fetchPoeData(url, cookie);
    if (error) {
        throw new Error(typeof error === 'object' ? JSON.stringify(error) : error);
    }
    return data;
}
