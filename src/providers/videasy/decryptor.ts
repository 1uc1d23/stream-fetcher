// decryptor.ts
// Decrypts Videasy's encrypted response through enc-dec.app.

const DEC_API = 'https://enc-dec.app/api/dec-videasy';

interface DecApiResponse {
    status: number;
    result?: {
        sources?: Array<{
            quality?: string;
            url: string;
            type?: string;
        }>;
        subtitles?: Array<{
            url: string;
            lang?: string;
            language?: string;
        }>;
    };
}

export interface DecryptedPayload {
    sources: Array<{
        quality?: string;
        url: string;
        type?: string;
    }>;
    subtitles: Array<{
        url: string;
        lang?: string;
        language?: string;
    }>;
}

const cache = new Map<string, DecryptedPayload>();

function blobKey(
    tmdbId: string,
    seed: string,
    blob: string
): string {
    return `${tmdbId}:${seed}:${blob.slice(0, 32)}`;
}

export async function decryptResponse(
    blob: string,
    tmdbId: string,
    seed: string
): Promise<DecryptedPayload | null> {
    if (!blob || blob.length < 10 || !seed) {
        return null;
    }

    const key = blobKey(tmdbId, seed, blob);

    const cached = cache.get(key);
    if (cached) {
        return cached;
    }

    try {
        const res = await fetch(DEC_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify({
                text: blob,
                id: tmdbId,
                seed
            })
        });

        if (!res.ok) {
            console.error(
                `[Videasy decrypt] HTTP ${res.status}:`,
                await res.text()
            );
            return null;
        }

        const json = (await res.json()) as DecApiResponse;

        if (
            json.status !== 200 ||
            !json.result ||
            !Array.isArray(json.result.sources)
        ) {
            console.error(
                '[Videasy decrypt] Invalid decoder response:',
                json
            );
            return null;
        }

        const payload: DecryptedPayload = {
            sources: json.result.sources,
            subtitles: json.result.subtitles ?? []
        };

        cache.set(key, payload);

        return payload;
    } catch (error) {
        console.error('[Videasy decrypt] Error:', error);
        return null;
    }
}
