import { OMSSServer } from '@omss/framework';
import { httpServerHandler } from 'cloudflare:node';
import { knownThirdPartyProxies } from './thirdPartyProxies.js';
import { streamPatterns } from './streamPatterns.js';
import { VidApiProvider } from './providers/vidapi/vidapi.js';

let initialization: Promise<void> | null = null;

async function initialize() {
    if (!initialization) {
        initialization = (async () => {
            const server = new OMSSServer({
                name: 'CinePro',
                version: '1.0.0',

                host: '0.0.0.0',
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

            const registry = server.getRegistry();
            registry.register(new VidApiProvider());

            await server.start();
        })();
    }

    await initialization;
}

const nodeHandler = httpServerHandler({
    port: 3000
});

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext) {
        await initialize();

        return nodeHandler.fetch!(request as any, env, ctx);
    }
};