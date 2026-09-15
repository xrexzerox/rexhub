/**
 * KissKH Nuvio Plugin - Auto-detect Movie/TV by TMDB ID
 * Domains: kisskh.nl (primary, proven working on mobile ISPs) ->
 *          kisskh.ovh -> kisskh.co (auto-failover per request)
 * Supports: Movies & TV Shows (Asian dramas)
 *
 * Entry point signatures:
 *   Movie: getStreams("1007757")
 *   TV:    getStreams("287011", "1", "1")
 *
 * v4.4.0 (2026-09-15) - device-killer fix (pack 4.43.1 review): fetchJson
 *   called the runtime's fetch() with NO timeout cap. The device fetch
 *   bridge just HANGS on a black-holed host (TCP connect to a blocked IP
 *   never settles), so one dead mirror stalled kisskhApi's rotation chain
 *   (nl -> ovh -> co = 3 hangs) and getStreams never resolved - the app
 *   burned its whole 60s plugin budget and the screen showed zero rows.
 *   Fix: repo-standard guarded fetchWithTimeout (hasTimers() gate - the
 *   QuickJS device realm has NO timers, so bare fetch is kept there and
 *   the app's 60s budget stays the hard cap; with timers we race a 12s
 *   cap per request so the full 3-mirror rotation stays inside budget).
 *   Same pattern proven on devices by asianhub 2.3.0 / pinoyhub 5.5.0 /
 *   pencuri 1.2.0. No lane logic changed.
 * v4.3.0 (2026-09-10) - app arg-shape hardening (same class of fixes as
 * pinoyhub 5.6.0, root cause of "movies work / series don't"):
 *   - IMDb tt-id inputs (app without TMDB key) resolved via TMDB find API
 *     with the authoritative movie/tv type pinned from the hit.
 *   - Media-type slot aliases "series"/"show"/"tv_show" normalized to "tv"
 *     (NuvioTVSmart passes the catalog type verbatim).
 *   - Missing/null season+episode on a TV id no longer returns zero rows:
 *     defaults to S1E1 (app's own testScraper convention).
 *   - Season/episode forms '01'/'S01'/'E01' normalized to digits.
 *   - Drama detail fetch now rides the mirror-rotation helper.
 */

var MAIN_URL = "https://kisskh.nl";
var KISSKH_HOSTS = ["https://kisskh.nl", "https://kisskh.ovh", "https://kisskh.co"];
var kisskhActiveHost = null;

// Rotate across kisskh mirrors: first success wins and is pinned for the
// rest of the session. Every API call goes through this helper.
function kisskhApi(path, headers) {
    var preferred = kisskhActiveHost ? [kisskhActiveHost] : [];
    var hosts = preferred.concat(KISSKH_HOSTS.filter(function (h) {
        return preferred.indexOf(h) === -1;
    }));
    function attempt(i) {
        if (i >= hosts.length) {
            return Promise.reject(new Error("All KissKH hosts failed (nl/ovh/co)"));
        }
        var host = hosts[i];
        return fetchJson(host + path, headers).then(function (data) {
            kisskhActiveHost = host;
            return data;
        }).catch(function (e) {
            log("Host " + host + " failed: " + e.message + " - trying next mirror");
            return attempt(i + 1);
        });
    }
    return attempt(0);
}

function kisskhBase() {
    return kisskhActiveHost || MAIN_URL;
}
var GOOGLE_SCRIPT_API = "https://script.google.com/macros/s/AKfycbzn8B31PuDxzaMa9_CQ0VGEDasFqfzI5bXvjaIZH4DM8DNq9q6xj1ALvZNz_JT3jF0suA/exec";
var TMDB_API_KEY = "b030404650f279792a8d3287232358e3";

function log(msg) {
    console.log("[KissKH] " + msg);
}

function safeJsonParse(text) {
    try {
        return JSON.parse(text);
    } catch (e) {
        return null;
    }
}

// v4.4.0 device-killer fix: every request is now capped. hasTimers() gate
// mirrors pencuri/pinoyhub/asianhub - the QuickJS device realm has no
// setTimeout, so there we call fetch bare (the native fetch bridge owns the
// wait; the app's 60s plugin budget is the hard cap) instead of throwing
// ReferenceError on the timer call (the 4.13.0 zero-rows device bug).
function hasTimers() {
    return typeof setTimeout === "function";
}

function fetchWithTimeout(url, options, ms) {
    options = options || {};
    if (!hasTimers()) return fetch(url, options);
    var timer = null;
    var killer = new Promise(function(resolve, reject) {
        timer = setTimeout(function() {
            reject(new Error("fetch timeout"));
        }, ms || 12000);
    });
    return Promise.race([fetch(url, options), killer]).then(
        function(res) { clearTimeout(timer); return res; },
        function(err) { clearTimeout(timer); throw err; }
    );
}

function fetchJson(url, headers) {
    var opts = { headers: headers || {}, skipSizeCheck: true };
    // 12s cap: light JSON APIs. Worst case (TMDB miss + all 3 mirrors hung)
    // stays ~48s, inside the app's 60s plugin budget.
    return fetchWithTimeout(url, opts, 12000)
        .then(function(response) {
            if (!response.ok) throw new Error("HTTP " + response.status);
            return response.text();
        })
        .then(function(text) {
            return safeJsonParse(text);
        });
}

function levenshtein(a, b) {
    var matrix = [];
    for (var i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (var j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (var i = 1; i <= b.length; i++) {
        for (var j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) == a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

function similarityScore(query, candidate) {
    var q = query.toLowerCase().trim();
    var c = candidate.toLowerCase().trim();

    if (q === c) return 10000;

    var qClean = "";
    var cClean = "";
    for (var i = 0; i < q.length; i++) {
        var ch = q.charAt(i);
        if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9") || ch === " ") qClean += ch;
    }
    for (var i = 0; i < c.length; i++) {
        var ch = c.charAt(i);
        if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9") || ch === " ") cClean += ch;
    }
    qClean = qClean.trim();
    cClean = cClean.trim();

    if (qClean === cClean) return 9500;

    var qWords = qClean.split(" ");
    var cWords = cClean.split(" ");

    if (qWords.length >= 2) {
        var allFound = true;
        for (var i = 0; i < qWords.length; i++) {
            var found = false;
            for (var j = 0; j < cWords.length; j++) {
                if (qWords[i] === cWords[j]) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                allFound = false;
                break;
            }
        }

        if (allFound) {
            if (cWords.length === qWords.length) {
                var totalDist = 0;
                for (var i = 0; i < qWords.length; i++) {
                    if (qWords[i] !== cWords[i]) {
                        if (qWords[i].indexOf(cWords[i]) !== -1 || cWords[i].indexOf(qWords[i]) !== -1) {
                            totalDist += Math.abs(qWords[i].length - cWords[i].length) * 2;
                        } else {
                            totalDist += Math.max(qWords[i].length, cWords[i].length);
                        }
                    }
                }
                if (totalDist <= 2) return 9000;
                if (totalDist <= 5) return 7000;
                return 5000;
            }
            var extraCount = cWords.length - qWords.length;
            if (extraCount <= 2) return 8000 - extraCount * 100;
            return 4000;
        }
        return 0;
    }

    if (qClean.indexOf(cClean) !== -1) return 6000;
    if (cClean.indexOf(qClean) !== -1) return 5500;

    var dist = levenshtein(qClean, cClean);
    var maxLen = Math.max(qClean.length, cClean.length);
    if (maxLen === 0) return 0;
    return Math.floor((1 - dist / maxLen) * 4000);
}

// ===== TMDB AUTO-DETECT (same logic as 4KHDHub) =====

function getTmdbInfoAuto(tmdbId) {
    var movieUrl = "https://api.themoviedb.org/3/movie/" + tmdbId + "?api_key=" + TMDB_API_KEY;
    return fetchJson(movieUrl).then(function(data) {
        var title = data.title || "";
        var original = data.original_title || title;
        var year = (data.release_date || "").split("-")[0];
        return {
            type: "movie",
            title: title,
            original: original,
            year: year,
            raw: data
        };
    }).catch(function() {
        var tvUrl = "https://api.themoviedb.org/3/tv/" + tmdbId + "?api_key=" + TMDB_API_KEY;
        return fetchJson(tvUrl).then(function(data) {
            var title = data.name || "";
            var original = data.original_name || title;
            var year = (data.first_air_date || "").split("-")[0];
            return {
                type: "tv",
                title: title,
                original: original,
                year: year,
                raw: data
            };
        });
    }).catch(function() {
        return { type: "", title: "", original: "", year: "", raw: null };
    });
}

function getTmdbEpisodeTitle(tmdbId, season, episode) {
    if (!season || !episode) return Promise.resolve("");
    var url = "https://api.themoviedb.org/3/tv/" + tmdbId + "/season/" + season + "/episode/" + episode + "?api_key=" + TMDB_API_KEY;
    return fetchJson(url).then(function(data) {
        return data.name || "";
    }).catch(function() {
        return "";
    });
}

// v4.3.0: the app passes an IMDb tt-id when no TMDB key is configured
// (PluginRepository.ensureTmdbId falls back to the raw id). Resolve it to a
// TMDB id via the find API (same fix as pinoyhub 5.6.0) so the search lanes
// get a usable id + authoritative type.
function resolveImdbToTmdb(imdbId) {
    var url = "https://api.themoviedb.org/3/find/" + encodeURIComponent(imdbId) +
        "?api_key=" + TMDB_API_KEY + "&external_source=imdb_id";
    return fetchJson(url).then(function(data) {
        if (!data || typeof data !== "object") return null;
        var tv = (data.tv_results || [])[0];
        var mv = (data.movie_results || [])[0];
        if (tv && tv.id) {
            return { tmdbId: String(tv.id), type: "tv", title: tv.name || tv.original_name || "" };
        }
        if (mv && mv.id) {
            return { tmdbId: String(mv.id), type: "movie", title: mv.title || mv.original_title || "" };
        }
        return null;
    });
}

// ===== KISSKH SPECIFIC =====

// ---- Local kkey generation (v2.8.10 algorithm) ----
// Pure-JS port, byte-identical to the reference implementation and the
// Google Script API. Used as PRIMARY so kisskh never depends on an external
// key service; Google Script is kept as a fallback.
var KKEY_ROUND_KEYS = [
    0x4f6bdaa3, -0x61d07350, 0x7f5e722d, -0x61210cec,
    0x536620a8, -0x32b653e8, -0x4de821cb, 0x2cc92d21,
    -0x73412227, 0x41f771c1, -0xc1f500c, -0x20d67d2b,
    0x2dadde47, 0x6c5aaf86, -0x6045ff8e, 0x409382a7,
    -0x6417db2, -0x6a1bd238, 0xa5e2dba, 0x4acdaf1d,
    0x54c72698, -0x3edcf4b0, -0x3482d916, -0x7e4f7609,
    -0x6c9fb16c, 0x524345c4, -0x66c19cd2, 0x188eead9,
    -0x351884c7, -0x675bc103, 0x19a5dd3, 0x1914b70a,
    -0x4fb1e313, 0x28ea2210, 0x29707fc3, 0x3064c8c9,
    -0x17593e17, -0x3fb31c07, -0x16c363c6, -0x26a7ab0d,
    -0x4b793324, 0x74ca2f25, -0x62094ce1, 0x44aee7ec
];
var KKEY_IV = [0x1504af3, 0x56e619cf, 0x2e42bba6, -0x73c08f07];
var _kkeyTables = null;

function kkeyCalculateHash(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
    }
    return hash;
}

function kkeyWordsToHex(words) {
    var out = '';
    for (var i = 0; i < words.length; i++) {
        var hex = (words[i] >>> 0).toString(16);
        while (hex.length < 8) hex = '0' + hex;
        out += hex;
    }
    return out.toUpperCase();
}

function kkeyBuildTables() {
    var pow = [];
    for (var i = 0; i < 256; i++) pow[i] = i < 128 ? (i << 1) : ((i << 1) ^ 0x11b);
    var sbox = [], T1 = [], T2 = [], T3 = [], T4 = [];
    var x = 0, xi = 0;
    for (var j = 0; j < 256; j++) {
        var sx = xi ^ (xi << 1) ^ (xi << 2) ^ (xi << 3) ^ (xi << 4);
        sx = (sx >>> 8) ^ (0xff & sx) ^ 0x63;
        sbox[x] = sx;
        var x2 = pow[x];
        var x8 = pow[pow[x2]];
        var w = 0x101 * pow[sx] ^ 0x1010100 * sx;
        T1[x] = (w << 0x18) | (w >>> 0x8);
        T2[x] = (w << 0x10) | (w >>> 0x10);
        T3[x] = (w << 0x8) | (w >>> 0x18);
        T4[x] = w;
        if (x) {
            x = x2 ^ pow[pow[pow[x8 ^ x2]]];
            xi ^= pow[pow[xi]];
        } else {
            x = xi = 1;
        }
    }
    return [T1, T2, T3, T4, sbox];
}

function kkeyEncrypt(plaintext) {
    if (!_kkeyTables) _kkeyTables = kkeyBuildTables();
    var T1 = _kkeyTables[0], T2 = _kkeyTables[1], T3 = _kkeyTables[2], T4 = _kkeyTables[3], sbox = _kkeyTables[4];

    var data = plaintext;
    var padLen = 16 - (plaintext.length % 16);
    for (var p = 0; p < padLen; p++) data += String.fromCharCode(padLen);

    var words = [];
    for (var i = 0; i < data.length; i += 4) {
        words.push(
            data.charCodeAt(i) << 0x18 |
            data.charCodeAt(i + 1) << 0x10 |
            data.charCodeAt(i + 2) << 0x8 |
            data.charCodeAt(i + 3)
        );
    }

    var keys = KKEY_ROUND_KEYS;

    for (var block = 0; block < words.length; block += 4) {
        var roundKey = block === 0 ? KKEY_IV : words.slice(block - 4, block);

        for (var k = 0; k < 4; k++) words[block + k] ^= roundKey[k];

        var s0 = words[block] ^ keys[0];
        var s1 = words[block + 1] ^ keys[1];
        var s2 = words[block + 2] ^ keys[2];
        var s3 = words[block + 3] ^ keys[3];
        var tIdx = 4;

        for (var round = 1; round < 10; round++) {
            var t0 = T1[s0 >>> 0x18] ^ T2[(s1 >>> 0x10) & 0xff] ^ T3[(s2 >>> 0x8) & 0xff] ^ T4[s3 & 0xff] ^ keys[tIdx++];
            var t1 = T1[s1 >>> 0x18] ^ T2[(s2 >>> 0x10) & 0xff] ^ T3[(s3 >>> 0x8) & 0xff] ^ T4[s0 & 0xff] ^ keys[tIdx++];
            var t2 = T1[s2 >>> 0x18] ^ T2[(s3 >>> 0x10) & 0xff] ^ T3[(s0 >>> 0x8) & 0xff] ^ T4[s1 & 0xff] ^ keys[tIdx++];
            s3 = T1[s3 >>> 0x18] ^ T2[(s0 >>> 0x10) & 0xff] ^ T3[(s1 >>> 0x8) & 0xff] ^ T4[s2 & 0xff] ^ keys[tIdx++];
            s0 = t0; s1 = t1; s2 = t2;
        }

        words[block]     = ((sbox[s0 >>> 0x18] << 0x18) | (sbox[(s1 >>> 0x10) & 0xff] << 0x10) | (sbox[(s2 >>> 0x8) & 0xff] << 0x8) | sbox[s3 & 0xff]) ^ keys[tIdx++];
        words[block + 1] = ((sbox[s1 >>> 0x18] << 0x18) | (sbox[(s2 >>> 0x10) & 0xff] << 0x10) | (sbox[(s3 >>> 0x8) & 0xff] << 0x8) | sbox[s0 & 0xff]) ^ keys[tIdx++];
        words[block + 2] = ((sbox[s2 >>> 0x18] << 0x18) | (sbox[(s3 >>> 0x10) & 0xff] << 0x10) | (sbox[(s0 >>> 0x8) & 0xff] << 0x8) | sbox[s1 & 0xff]) ^ keys[tIdx++];
        words[block + 3] = ((sbox[s3 >>> 0x18] << 0x18) | (sbox[(s0 >>> 0x10) & 0xff] << 0x10) | (sbox[(s1 >>> 0x8) & 0xff] << 0x8) | sbox[s2 & 0xff]) ^ keys[tIdx++];
    }

    return kkeyWordsToHex(words);
}

function generateKkeyLocal(epsId, isSub) {
    var SUB_SALT = 'VgV52sWhwvBSf8BsM3BRY9weWiiCbtGp';
    var VIDEO_SALT = '62f176f3bb1b5b8e70e39932ad34a0c7';
    var fields = [
        '', epsId.toString(), '', 'mg3c3b04ba', '2.8.10',
        isSub ? SUB_SALT : VIDEO_SALT,
        '4830201', 'kisskh', 'kisskh', 'kisskh', 'kisskh', 'kisskh', 'kisskh',
        '00', ''
    ];
    var hash = kkeyCalculateHash(fields.join('|'));
    fields.splice(1, 0, hash.toString());
    return kkeyEncrypt(fields.join('|'));
}

function generateKey(epsId) {
    log("Generating key for episode: " + epsId);
    // PRIMARY: compute locally (no external dependency)
    try {
        var localKey = generateKkeyLocal(epsId, false);
        if (localKey && localKey.length >= 32) {
            log("Key generated locally");
            return Promise.resolve(localKey);
        }
    } catch (e) {
        log("Local key generation failed: " + e.message);
    }
    // FALLBACK: Google Script API
    var keyUrl = GOOGLE_SCRIPT_API + "?id=" + epsId + "&version=2.8.10";
    return fetchJson(keyUrl).then(function(keyData) {
        if (keyData && keyData.key) {
            log("Key generated via Google Script fallback");
            return keyData.key;
        }
        throw new Error("Google Script returned no key");
    });
}

function getVideoSources(epsId, key) {
    log("Fetching video sources");
    return kisskhApi("/api/DramaList/Episode/" + epsId + ".png?err=false&ts=&time=&kkey=" + key).then(function(sources) {
        if (!sources) throw new Error("Empty response from video API");
        log("Video API keys: " + Object.keys(sources).join(", "));
        return sources;
    });
}

function searchKisskh(title) {
    log("Searching KissKH: " + title);
    return kisskhApi("/api/DramaList/Search?q=" + encodeURIComponent(title) + "&type=0").then(function(searchList) {
        if (!searchList || !Array.isArray(searchList) || searchList.length === 0) {
            throw new Error("No KissKH results for: " + title);
        }

        var bestMatch = null;
        var bestScore = -1;

        for (var i = 0; i < searchList.length; i++) {
            var item = searchList[i];
            var itemTitle = item.title || "";
            // Strip year suffix like " (2026)" before scoring
            var itemTitleClean = itemTitle.replace(/\s*\(\d{4}\)\s*$/, "").trim();
            var score = similarityScore(title, itemTitleClean);

            log("Result " + (i + 1) + " : " + itemTitle + " - Score: " + score);

            if (score > bestScore) {
                bestScore = score;
                bestMatch = item;
            }
        }

        log("Best match: " + (bestMatch ? bestMatch.title : "None") + " Score: " + bestScore + " (threshold: 6000)");

        if (!bestMatch || bestScore < 6000) {
            throw new Error("No confident match found (score < 6000)");
        }

        log("Confirmed match: " + bestMatch.title + " (ID: " + bestMatch.id + ")");
        return bestMatch;
    });
}

function getDramaDetail(dramaId) {
    // v4.3.0: route through kisskhApi so a mid-session host failure rotates
    // mirrors instead of hard-failing on the pinned base.
    return kisskhApi("/api/DramaList/Drama/" + dramaId + "?isq=false").then(function(detail) {
        if (!detail || !detail.episodes || detail.episodes.length === 0) {
            throw new Error("No episodes found for drama " + dramaId);
        }
        log("Found " + detail.episodes.length + " episodes");
        return detail;
    });
}

function findEpisode(episodes, mediaType, episodeNum) {
    var targetEp = null;
    if (mediaType === "movie") {
        targetEp = episodes[episodes.length - 1];
        log("Movie mode: using episode " + targetEp.number + " (ID: " + targetEp.id + ")");
        return targetEp;
    }

    // Debug: log all available episodes
    var epList = [];
    for (var i = 0; i < episodes.length; i++) {
        epList.push("#" + episodes[i].number + "(id=" + episodes[i].id + ")");
    }
    log("Available episodes: [" + epList.join(", ") + "]");

    var targetNum = parseInt(episodeNum, 10);

    // Strategy 1: Exact number match
    for (var i = 0; i < episodes.length; i++) {
        if (parseInt(episodes[i].number, 10) === targetNum) {
            targetEp = episodes[i];
            log("Exact match: episode " + targetEp.number + " (ID: " + targetEp.id + ")");
            return targetEp;
        }
    }

    // Strategy 2: Index-based fallback (episode 1 = index 0)
    var idx = targetNum - 1;
    if (idx >= 0 && idx < episodes.length) {
        targetEp = episodes[idx];
        log("Index fallback: requested ep " + targetNum + " -> index " + idx + " (number=" + targetEp.number + ", ID=" + targetEp.id + ")");
        return targetEp;
    }

    // Strategy 3: String contains match
    for (var i = 0; i < episodes.length; i++) {
        var numStr = String(episodes[i].number || "");
        if (numStr.indexOf(String(targetNum)) !== -1) {
            targetEp = episodes[i];
            log("String match: episode " + targetEp.number + " (ID: " + targetEp.id + ")");
            return targetEp;
        }
    }

    throw new Error("Episode " + episodeNum + " not found among " + episodes.length + " episodes");
}

function extractQuality(url) {
    if (!url) return "Auto";
    var qMatch = url.match(/_(\d+p)_/i);
    if (qMatch) return qMatch[1];
    if (url.match(/1080p/i)) return "1080p";
    if (url.match(/720p/i)) return "720p";
    if (url.match(/480p/i)) return "480p";
    if (url.match(/360p/i)) return "360p";
    return "Auto";
}

function sourcesToStreams(sources, dramaTitle, epTitle, epNumber) {
    var streams = [];
    var links = [];

    if (sources.Video) links.push(sources.Video);
    if (sources.Video_tmp) links.push(sources.Video_tmp);
    if (sources.ThirdParty) links.push(sources.ThirdParty);

    if (links.length === 0) {
        log("No video links found");
        return streams;
    }

    var displayTitle = dramaTitle || "KissKH";
    var displayEp = epTitle || ("Episode " + epNumber);
    var baseHeaders = {
        "Origin": kisskhBase(),
        "Referer": kisskhBase() + "/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    };

    for (var i = 0; i < links.length; i++) {
        var link = links[i];
        if (!link) continue;

        var isM3u8 = link.indexOf(".m3u8") !== -1;
        var isMp4 = link.indexOf(".mp4") !== -1;

        if (isM3u8 || isMp4) {
            var quality = extractQuality(link);
            var typeLabel = isM3u8 ? "HLS" : "MP4";

            streams.push({
                name: "KissKH | " + quality + " | " + typeLabel,
                title: displayEp + " | " + displayTitle + " | " + quality + " | KissKH",
                url: link,
                quality: quality,
                provider: "kisskh",
                headers: baseHeaders
            });
            log("Added stream: " + typeLabel + " " + quality);
        }
    }

    return streams;
}

// ===== ENTRY POINT (same signature as 4KHDHub) =====

// v4.3.0: normalize '1', '01', 'S01', 'E01' etc. to a plain digit string.
function normalizeNum(v) {
    if (v === undefined || v === null) return "";
    var s = String(v).replace(/^[se]/i, "").replace(/[^0-9]/g, "");
    return s;
}

// Core flow, split out of getStreams so the IMDb tt-id branch can reuse it.
// mediaTypeHint: null (auto-detect) | "movie" | "tv" (pinned by app or IMDb).
function runStreams(tmdbId, mediaTypeHint, season, episode) {
    season = normalizeNum(season);
    episode = normalizeNum(episode);
    log("getStreams called: " + tmdbId + " type=" + (mediaTypeHint || "auto") + " S" + season + "E" + episode);

    // If season and episode are provided, force TV mode (avoids TMDB ID namespace collision)
    var forceTv = !!(season && episode);

    var tmdbPromise;
    if (mediaTypeHint === "tv") {
        tmdbPromise = fetchJson("https://api.themoviedb.org/3/tv/" + tmdbId + "?api_key=" + TMDB_API_KEY).then(function(data) {
            var title = data.name || "";
            var original = data.original_name || title;
            var year = (data.first_air_date || "").split("-")[0];
            return { type: "tv", title: title, original: original, year: year, raw: data };
        }).catch(function() {
            return { type: "", title: "", original: "", year: "", raw: null };
        });
    } else if (mediaTypeHint === "movie") {
        tmdbPromise = fetchJson("https://api.themoviedb.org/3/movie/" + tmdbId + "?api_key=" + TMDB_API_KEY).then(function(data) {
            var title = data.title || "";
            var original = data.original_title || title;
            var year = (data.release_date || "").split("-")[0];
            return { type: "movie", title: title, original: original, year: year, raw: data };
        }).catch(function() {
            return { type: "", title: "", original: "", year: "", raw: null };
        });
    } else {
        tmdbPromise = forceTv
            ? fetchJson("https://api.themoviedb.org/3/tv/" + tmdbId + "?api_key=" + TMDB_API_KEY).then(function(data) {
                var title = data.name || "";
                var original = data.original_name || title;
                var year = (data.first_air_date || "").split("-")[0];
                return { type: "tv", title: title, original: original, year: year, raw: data };
            }).catch(function() {
                return { type: "", title: "", original: "", year: "", raw: null };
            })
            : getTmdbInfoAuto(tmdbId);
    }

    return tmdbPromise.then(function(tmdbData) {
        if (!tmdbData.type) {
            log("Could not detect media type for TMDB ID: " + tmdbId);
            return [];
        }
        var mediaType = tmdbData.type;
        log("Detected type: " + mediaType + " | Title: " + tmdbData.title + " | Year: " + tmdbData.year);

        // v4.3.0: several app entry points pass season/episode as null
        // (StreamsScreen.loadSources defaults). Instead of returning zero
        // rows, default to S1E1 (same convention as the app's testScraper).
        if (mediaType === "tv" && (!season || !episode)) {
            log("Season/episode not provided by app - defaulting to S1E1");
            season = "1";
            episode = "1";
        }

        var epPromise = (mediaType === "tv")
            ? getTmdbEpisodeTitle(tmdbId, season, episode)
            : Promise.resolve("");

        return epPromise.then(function(epTitle) {
            return searchKisskh(tmdbData.title).then(function(drama) {
                return getDramaDetail(drama.id).then(function(detail) {
                    return { drama: drama, detail: detail };
                });
            }).then(function(info) {
                var targetEp = findEpisode(info.detail.episodes, mediaType, episode);
                return { drama: info.drama, episode: targetEp };
            }).then(function(info) {
                return generateKey(info.episode.id).then(function(key) {
                    return getVideoSources(info.episode.id, key).then(function(sources) {
                        return sourcesToStreams(
                            sources,
                            info.drama.title,
                            info.episode.title,
                            info.episode.number
                        );
                    });
                });
            }).then(function(streams) {
                log("Returning " + streams.length + " streams");
                return streams;
            });
        });
    }).catch(function(err) {
        log("Error: " + err.message);
        return [];
    });
}

function getStreams(tmdbId, season, episode) {
    // App signature: getStreams(tmdbId, mediaType, seasonNum, episodeNum).
    // Media-type slot accepts the documented "movie"/"tv" plus the aliases
    // NuvioTVSmart passes verbatim ("series"/"show") - normalize before the
    // remap so the shift never misfires.
    var mediaType = null;
    var mtSlot = String(season === undefined || season === null ? "" : season).toLowerCase();
    if (mtSlot === "movie" || mtSlot === "tv" || mtSlot === "series" || mtSlot === "show" || mtSlot === "tv_show" || mtSlot === "tvshow") {
        mediaType = mtSlot === "movie" ? "movie" : "tv";
        season = episode;
        episode = arguments[3];
        log("Detected app signature (mediaType=" + mediaType + "), remapped to season=" + season + " episode=" + episode);
    }

    var idStr = String(tmdbId === undefined || tmdbId === null ? "" : tmdbId).replace(/^tmdb:/i, "").trim();
    if (!idStr) return Promise.resolve([]);

    // v4.3.0: IMDb tt-id (app without TMDB key) -> resolve to TMDB first.
    if (/^tt\d+/i.test(idStr)) {
        return resolveImdbToTmdb(idStr).then(function(hit) {
            if (!hit) {
                log("IMDb id could not be resolved to TMDB: " + idStr);
                return [];
            }
            log("IMDb " + idStr + " -> TMDB " + hit.tmdbId + " (" + hit.type + ")");
            return runStreams(hit.tmdbId, mediaType || hit.type, season, episode);
        }).catch(function(e) {
            log("IMDb resolve failed: " + e.message);
            return [];
        });
    }

    return runStreams(idStr, mediaType, season, episode);
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { getStreams: getStreams };
} else if (typeof global !== "undefined") {
    global.getStreams = getStreams;
}
