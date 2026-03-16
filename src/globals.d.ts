// Types for Electron API bindings
declare global {
    interface Window {
        poeAPI: {
            fetchPoeData: (url: string, cookie: string) => Promise<{ data: any; error: string | null }>;
            fetchNinjaData: (url: string) => Promise<{ data: any; error: string | null }>;
        };
    }
}

declare global {
    namespace JSX {
        interface IntrinsicElements {
            webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { src: string };
        }
    }
}

export { };
