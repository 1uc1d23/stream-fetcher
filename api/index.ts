import { OMSSServer } from '@omss/framework';
import { knownThirdPartyProxies } from '../src/thirdPartyProxies.js';
import { streamPatterns } from '../src/streamPatterns.js';
import { VidApiProvider } from '../src/providers/vidapi/vidapi.js';

let serverPromise: Promise<OMSSServer> | null = null;

async function getServer() {
    if (!serverPromise) {
        serverPromise = (async () => {
            const server = new OMSSServer({
                name: 'CinePro',
                version: '1.0.0',

                host: 'localhost',
                port: 3000,

                cache: {
                    type: 'memory',
                    ttl: {
                        sources: 60 * 60,
                        subtitles: 60 * 60 * 24
                    }
                },

                tmdb: {
                    apiKey: process.env.TMDB_API_KEY!,
                    cacheTTL: 24 * 60 * 60
                },

                proxyConfig: {
                    knownThirdPartyProxies,
                    streamPatterns
                },

                cors: {
                    origin: '*',
                    methods: ['GET', 'OPTIONS'],
                    allowedHeaders: ['Content-Type', 'Authorization'],
                    exposedHeaders: [
                        'Content-Range',
                        'Accept-Ranges',
                        'ETag'
                    ],
                    preflightContinue: false,
                    optionsSuccessStatus: 204
                },

                stremio: {
                    enableNativeAddon: true,
                    stremioAddons: []
                },

                mcp: {
                    enabled: false
                }
            });

            server.getRegistry().register(new VidApiProvider());

            await server.getInstance().ready();

            return server;
        })();
    }

    return serverPromise;
}

export default async function handler(req: any, res: any) {
    const server = await getServer();
    return server.getInstance().server.emit('request', req, res);
}