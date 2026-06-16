export const config = {
  runtime: 'edge', // Infinite streaming enabled
};

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });
  }

  try {
    const urlObj = new URL(request.url);
    const rawData = urlObj.searchParams.get('data');

    if (!rawData) {
      return new Response(JSON.stringify({ error: 'Missing data parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const decodedData = JSON.parse(decodeURIComponent(rawData));
    const targetUrl = decodedData.url;
    const targetHeaders = decodedData.headers || {};

    const modifiedHeaders = new Headers();
    Object.entries(targetHeaders).forEach(([key, value]) => {
      modifiedHeaders.set(key, value);
    });

    const rangeHeader = request.headers.get('range');
    if (rangeHeader) {
      modifiedHeaders.set('range', rangeHeader);
    }

    const videoResponse = await fetch(targetUrl, {
      method: 'GET',
      headers: modifiedHeaders,
    });

    // Explicitly set video/mp4 and streaming friendly headers
    const responseHeaders = new Headers();
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
    responseHeaders.set('Content-Type', videoResponse.headers.get('content-type') || 'video/mp4');
    responseHeaders.set('Accept-Ranges', 'bytes');

    if (videoResponse.headers.get('content-length')) {
      responseHeaders.set('Content-Length', videoResponse.headers.get('content-length'));
    }
    if (videoResponse.headers.get('content-range')) {
      responseHeaders.set('Content-Range', videoResponse.headers.get('content-range'));
    }

    // Use a clean transform pipeline to stream bytes smoothly without locking the thread
    const { readable, writable } = new TransformStream();
    videoResponse.body.pipeTo(writable).catch(() => {});

    return new Response(readable, {
      status: videoResponse.status,
      statusText: videoResponse.statusText,
      headers: responseHeaders,
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Edge Proxy Error', details: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}