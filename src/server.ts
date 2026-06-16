import { OMSSServer } from '@omss/framework';
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { knownThirdPartyProxies } from './thirdPartyProxies.js';
import { streamPatterns } from './streamPatterns.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    const server = new OMSSServer({
        name: 'CinePro',
        version: '1.0.0',

        host: process.env.HOST ?? 'localhost',
        port: Number(process.env.PORT ?? 3000),
        publicUrl: process.env.PUBLIC_URL,

        cache: {
            type: (process.env.CACHE_TYPE as 'memory' | 'redis') ?? 'memory',
            ttl: {
                sources: 60 * 60,
                subtitles: 60 * 60 * 24
            },
            redis: {
                host: process.env.REDIS_HOST ?? 'localhost',
                port: Number(process.env.REDIS_PORT ?? 6379),
                password: process.env.REDIS_PASSWORD
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
            origin: process.env.CORS_ORIGIN ?? '*',
            methods: ['GET', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization'],
            exposedHeaders: ['Content-Range', 'Accept-Ranges', 'ETag'],
            preflightContinue: false,
            optionsSuccessStatus: 204
        },

        stremio: {
            enableNativeAddon: process.env.STREMIO_ADDON === 'true',
            stremioAddons: []
        },

        mcp: {
            enabled: process.env.MCP_ENABLED === 'true'
        }
    });

    const registry = server.getRegistry();

    const providersPath = path.join(__dirname, './providers');

    // 🔥 DEBUG 1: confirm path
    console.log('Providers path:', providersPath);

    // 🔥 DEBUG 2: show actual files Vercel sees
    try {
        console.log('Provider folders:', fs.readdirSync(providersPath));
    } catch (e) {
        console.error('Cannot read providers folder:', e);
    }

    // 🔥 LOAD PROVIDERS
    try {
        await registry.discoverProviders(providersPath);
    } catch (e) {
        console.error('discoverProviders error:', e);
    }

    // 🔥 DEBUG 3: final loaded providers
    const loaded = registry.getProviders();

    console.log('TOTAL LOADED PROVIDERS:', loaded.length);
    console.log('PROVIDERS:', loaded.map(p => p.name));

    await server.start();

    const publicUrl =
        process.env.PUBLIC_URL ??
        `http://${process.env.HOST ?? 'localhost'}:${process.env.PORT ?? 3000}`;

    const uiUrl = `https://ui.cinepro.cc/?omssurl=${encodeURIComponent(publicUrl)}`;

    console.log('UI:', uiUrl);
}

main().catch((err) => {
    console.error('FATAL ERROR:', err);
    process.exit(1);
});