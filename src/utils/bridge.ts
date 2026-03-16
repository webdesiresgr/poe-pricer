import axios from 'axios';

// This is a bridge that works both in Electron and in Web (with limitations)
export const setupPoeBridge = () => {
    if (window.poeAPI) return; // Already setup by Electron preload

    window.poeAPI = {
        fetchPoeData: async (url, cookie) => {
            console.log("Web Mode: Fetching PoE Data (May fail due to CORS)", url);
            try {
                // In local dev, we use the Vite proxy
                const proxyUrl = url.replace('https://www.pathofexile.com', '/api-poe');

                let cleanCookie = cookie.trim();
                if (cleanCookie.toLowerCase().startsWith('poesessid=')) {
                    cleanCookie = cleanCookie.substring(10);
                }

                const response = await axios.get(proxyUrl, {
                    headers: {
                        // Note: Browsers will NOT let us set the Cookie header manually for security.
                        // This is why a real website needs a backend proxy.
                    },
                    withCredentials: true // Might help if the cookie is already in the browser
                });
                return { data: response.data, error: null };
            } catch (err: any) {
                console.error("Web PoE API Error:", err.message);
                return {
                    data: null,
                    error: "CORS/Cookie Error: Path of Exile API cannot be reached directly from a browser. This app works best as a Desktop App. In web, you must use a CORS bypass extension or a proxy server."
                };
            }
        },
        fetchNinjaData: async (url) => {
            try {
                const proxyUrl = url.replace('https://poe.ninja', '/api-ninja');
                const response = await axios.get(proxyUrl);
                return { data: response.data, error: null };
            } catch (err: any) {
                return { data: null, error: err.message };
            }
        }
    };
};
