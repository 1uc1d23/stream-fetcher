import { BaseProvider } from '@omss/framework';
import type {
    ProviderCapabilities,
    ProviderMediaObject,
    ProviderResult
} from '@omss/framework';
import type { VideasyServer } from './videasy.types.js';
import { decryptResponse } from './decryptor.js';

/**
 * all known api endpoints. mb-flix is the primary english source.
 * endpoints like meine, overflix, cuevana serve other languages.
 * hdmovie returns sources where the "quality" field is actually
 * a language label ("Hindi", "English") rather than a resolution.
 * those which are commented do not work
 */

const VIDEASY_SERVERS: readonly VideasyServer[] = [
    {
        name: 'videasy',
        url: 'https://api.speedracelight.com/cdn/sources-with-title',
        language: 'english'
    }
] as const;

export class VideasyProvider extends BaseProvider {
    readonly id = 'Videasy';
    readonly name = 'Videasy';
    readonly enabled = true;
    readonly BASE_URL = 'https://api.videasy.to';
    readonly HEADERS = {
        'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'application/json, */*; q=0.01',
        Referer: 'https://player.videasy.to/',
        Origin: 'https://player.videasy.to'
    };

    readonly capabilities: ProviderCapabilities = {
        supportedContentTypes: ['movies', 'tv']
    };

    async getMovieSources(media: ProviderMediaObject): Promise<ProviderResult> {
        return this.getSources(media);
    }

    async getTVSources(media: ProviderMediaObject): Promise<ProviderResult> {
        return this.getSources(media);
    }

    // fans out to all servers in parallel, merges results
    private async getSources(
        media: ProviderMediaObject
    ): Promise<ProviderResult> {
        const results = await Promise.allSettled(
            VIDEASY_SERVERS.map((server) => this.fetchFromServer(server, media))
        );

        const sources: ProviderResult['sources'] = [];
        const subtitles: ProviderResult['subtitles'] = [];
        const diagnostics: ProviderResult['diagnostics'] = [];
        let failCount = 0;

        for (const result of results) {
            if (result.status === 'rejected' || !result.value) {
                failCount++;
                continue;
            }
            sources.push(...result.value.sources);
            subtitles.push(...result.value.subtitles);
        }

        if (failCount > 0 && sources.length > 0) {
            diagnostics.push({
                code: 'PARTIAL_SCRAPE',
                message: `${failCount} of ${VIDEASY_SERVERS.length} videasy servers did not return results`,
                field: '',
                severity: 'warning'
            });
        }

        if (sources.length === 0) {
            return this.emptyResult(
                'all videasy servers returned no sources',
                media
            );
        }

        return { sources, subtitles, diagnostics };
    }

    // I have added a small identification of error in case in future we have some problem
    // if the error has all capital then it proly mean that they shifted their encryption and all
    // if it's small and has same then we might have to change a bit let's say api url ?.
    // suppose the small invalid response indicates that they might have changed their setup
    // while the capital indicates that the response might be short not enough, hope it helps.

    // fetches one server, reads plain text blob, decrypts via enc-dec.app
    private async fetchFromServer(
        server: VideasyServer,
        media: ProviderMediaObject
    ): Promise<ProviderResult | null> {
        try {
            // 1. Get seed
            const seedUrl =
                `https://api.speedracelight.com/seed?mediaId=${media.tmdbId}`;

            const seedResponse = await fetch(seedUrl, {
                headers: this.HEADERS
            });

            if (!seedResponse.ok) {
                console.error(
                    `[Videasy:${server.name}] Seed request failed: ${seedResponse.status}`
                );
                return null;
            }

            const seedData = (await seedResponse.json()) as {
                seed?: string;
                ttlMs?: number;
            };

            if (!seedData.seed) {
                console.error(`[Videasy:${server.name}] No seed returned`);
                return null;
            }

            // 2. Build sources request
            const params = {
                ...this.buildParams(server, media),
                enc: '2',
                seed: seedData.seed
            };

            const url =
                `${server.url}?` +
                new URLSearchParams(params).toString();

            console.log(`[Videasy:${server.name}] ${url}`);

            const response = await fetch(url, {
                headers: this.HEADERS
            });

            if (!response.ok) {
                console.error(
                    `[Videasy:${server.name}] HTTP ${response.status}`
                );
                return null;
            }

            // 3. Read encrypted response
            const blob = await response.text();

            console.log('[Videasy] response content-type:',
                response.headers.get('content-type')
            );

            console.log('[Videasy] blob length:', blob.length);
            console.log('[Videasy] blob:', blob.slice(0, 300));


            if (!blob || blob.length < 10) {
                console.error(
                    `[Videasy:${server.name}] Empty response`
                );
                return null;
            }

            // 4. Decrypt
            const decrypted = await decryptResponse(
                blob,
                String(media.tmdbId),
                seedData.seed
            );


            if (!decrypted || decrypted.sources.length === 0) {
                console.error(
                    `[Videasy:${server.name}] Decryption returned no sources`
                );
                return null;
            }

            // 5. Map sources
            const sources: ProviderResult['sources'] =
                decrypted.sources
                    .filter((s) => !!s?.url)
                    .map((s) => ({
                        url: this.createProxyUrl(s.url, this.HEADERS),
                        type: this.detectType(s.url, s.type),
                        quality: this.normalizeQuality(s.quality),
                        audioTracks: [
                            {
                                language: this.resolveLanguage(server),
                                label: this.resolveLanguageLabel(server)
                            }
                        ],
                        provider: {
                            id: this.id,
                            name: this.name
                        }
                    }));

            const subtitles: ProviderResult['subtitles'] =
                decrypted.subtitles
                    .filter((s) => !!s?.url)
                    .map((s) => ({
                        url: this.createProxyUrl(s.url, {}),
                        label: s.lang ?? s.language ?? 'Unknown',
                        format: 'vtt' as const
                    }));

            return {
                sources,
                subtitles,
                diagnostics: []
            };
        } catch (error) {
            console.error(
                `[Videasy:${server.name}] Error:`,
                error
            );
            return null;
        }
    }

    // builds query params — title passed as plain string, URLSearchParams handles encoding
    private buildParams(
        server: VideasyServer,
        media: ProviderMediaObject
    ): Record<string, string> {
        const base: Record<string, string> = {
            title: media.title ?? '', // no encodeURIComponent — URLSearchParams does it
            mediaType: media.type === 'movie' ? 'movie' : 'tv',
            tmdbId: String(media.tmdbId),
            imdbId: media.imdbId ?? '',
            episodeId: String(media.type === 'tv' ? (media.e ?? 1) : 1),
            seasonId: String(media.type === 'tv' ? (media.s ?? 1) : 1)
        };

        if (media.type === 'movie') {
            base.year = String(media.releaseYear ?? '');
        }

        if (server.language) {
            base.language = server.language;
        }

        return base;
    }

    // detects stream type from url extension and api hint
    private detectType(url: string, hint?: string): 'hls' | 'mp4' {
        const lower = (hint ?? '').toLowerCase();
        if (
            lower.includes('hls') ||
            lower.includes('m3u8') ||
            url.toLowerCase().includes('.m3u8')
        ) {
            return 'hls';
        }
        return 'mp4';
    }

    // guards against language labels being passed as quality (e.g. "Hindi")
    private normalizeQuality(raw?: string): string {
        if (!raw) return 'unknown';
        return /^\d{3,4}p$|^4K$|^8K$|^HD$|^SD$/i.test(raw.trim())
            ? raw.trim()
            : 'unknown';
    }

    private resolveLanguage(server: VideasyServer): string {
        if (!server.language) return 'en';
        const map: Record<string, string> = {
            german: 'de',
            italian: 'it',
            french: 'fr'
        };
        return map[server.language] ?? 'en';
    }

    private resolveLanguageLabel(server: VideasyServer): string {
        if (!server.language) return 'English';
        const map: Record<string, string> = {
            german: 'German',
            italian: 'Italian',
            french: 'French'
        };
        return map[server.language] ?? 'English';
    }

    private emptyResult(
        message: string,
        _media: ProviderMediaObject
    ): ProviderResult {
        return {
            sources: [],
            subtitles: [],
            diagnostics: [
                {
                    code: 'PROVIDER_ERROR',
                    message: `${this.name}: ${message}`,
                    field: '',
                    severity: 'error'
                }
            ]
        };
    }

    async healthCheck(): Promise<boolean> {
        try {
            const res = await fetch(this.BASE_URL, {
                method: 'HEAD',
                headers: this.HEADERS
            });
            return res.status < 500;
        } catch {
            return false;
        }
    }
}
