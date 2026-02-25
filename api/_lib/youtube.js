function extractYouTubeId(url) {
    if (!url || typeof url !== 'string') return null;
    const raw = url.trim();
    if (!raw) return null;
    try {
        const parsed = new URL(raw);
        const host = parsed.hostname.replace(/^www\./, '');
        if (host === 'youtu.be') {
            const id = parsed.pathname.replace(/^\/+/, '').split('/')[0];
            return id && id.length === 11 ? id : null;
        }
        if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
            const byQuery = parsed.searchParams.get('v');
            if (byQuery && byQuery.length === 11) return byQuery;
            const parts = parsed.pathname.split('/').filter(Boolean);
            const markerIndex = parts.findIndex(p => ['embed', 'v', 'shorts', 'live'].includes(p));
            if (markerIndex !== -1 && parts[markerIndex + 1] && parts[markerIndex + 1].length === 11) {
                return parts[markerIndex + 1];
            }
        }
    } catch (_) { }
    const match = raw.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/i);
    return match ? match[1] : null;
}

function normalizeYouTubeUrl(url) {
    const videoId = extractYouTubeId(url);
    return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
}

function extractJsonObjectAfterToken(source, token) {
    const startToken = source.indexOf(token);
    if (startToken === -1) return null;
    const startBrace = source.indexOf('{', startToken + token.length);
    if (startBrace === -1) return null;
    let depth = 0, inString = false, escape = false;
    for (let i = startBrace; i < source.length; i++) {
        const ch = source[i];
        if (inString) {
            if (escape) { escape = false; }
            else if (ch === '\\') { escape = true; }
            else if (ch === '"') { inString = false; }
            continue;
        }
        if (ch === '"') { inString = true; continue; }
        if (ch === '{') depth++;
        if (ch === '}') { depth--; if (depth === 0) return source.slice(startBrace, i + 1); }
    }
    return null;
}

async function fetchYouTubeVideoMetadata(rawUrl) {
    const normalizedUrl = normalizeYouTubeUrl(rawUrl);
    if (!normalizedUrl) throw new Error('Link YouTube non valido.');
    const videoId = extractYouTubeId(normalizedUrl);

    const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(normalizedUrl)}&format=json`);
    if (!oembedRes.ok) throw new Error('Impossibile leggere i dati del video YouTube.');
    const oembed = await oembedRes.json();

    let title = oembed.title || '';
    let description = '';
    let thumbnail = oembed.thumbnail_url || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '');
    let publishedAt = null;

    try {
        const watchRes = await fetch(normalizedUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7' },
        });
        if (watchRes.ok) {
            const html = await watchRes.text();
            const playerRespRaw = extractJsonObjectAfterToken(html, 'var ytInitialPlayerResponse =')
                || extractJsonObjectAfterToken(html, 'ytInitialPlayerResponse =');
            if (playerRespRaw) {
                try {
                    const parsed = JSON.parse(playerRespRaw);
                    const details = parsed?.videoDetails || {};
                    const micro = parsed?.microformat?.playerMicroformatRenderer || {};
                    title = details.title || micro?.title?.simpleText || title;
                    description = details.shortDescription || micro?.description?.simpleText || description;
                    publishedAt = micro.publishDate || micro.uploadDate || publishedAt;
                    const thumbs = details?.thumbnail?.thumbnails;
                    if (Array.isArray(thumbs) && thumbs.length > 0) {
                        thumbnail = thumbs[thumbs.length - 1].url || thumbnail;
                    }
                } catch (_) { }
            }
            const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
            let match;
            while ((match = scriptRegex.exec(html)) !== null) {
                try {
                    const parsed = JSON.parse(match[1].trim());
                    const node = Array.isArray(parsed) ? parsed.find(x => x?.['@type'] === 'VideoObject') : parsed;
                    if (node && node['@type'] === 'VideoObject') {
                        title = node.name || title;
                        description = node.description || description;
                        publishedAt = node.uploadDate || node.datePublished || publishedAt;
                        if (Array.isArray(node.thumbnailUrl) && node.thumbnailUrl.length > 0) thumbnail = node.thumbnailUrl[0];
                        else if (typeof node.thumbnailUrl === 'string') thumbnail = node.thumbnailUrl;
                        break;
                    }
                } catch (_) { }
            }
        }
    } catch (_) { }

    return { url: normalizedUrl, title, description, thumbnail, publishedAt };
}

module.exports = { extractYouTubeId, normalizeYouTubeUrl, fetchYouTubeVideoMetadata };
