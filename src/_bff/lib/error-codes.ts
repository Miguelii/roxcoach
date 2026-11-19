// Distinct 8-character lowercase alphanumeric codes, one per failure point
export enum ErrorCode {
    // Auth - Session
    AUTH_SESSION_SB_CLIENT = 'k4m7x2qd',
    AUTH_SESSION_GET_USER = 'p9w3h6vn',

    // Auth - Login
    AUTH_LOGIN_SB_CLIENT = 'b2t8c5jr',
    AUTH_LOGIN_SIGN_IN = 'f7y1n4zm',
    AUTH_LOGIN_SIGN_IN_ERR = 'h3d6s9gx',
    AUTH_LOGIN_NO_ACCESS = 'v5q2k8wa',

    // Auth - Logout
    AUTH_LOGOUT_SB_CLIENT = 'n8r4j1tc',
    AUTH_LOGOUT_SIGN_OUT = 'z6e9u3pl',

    // Strava - API client
    STRAVA_API_UNAUTHORIZED = 'c8x3m6re',
    STRAVA_API_NOT_FOUND = 'j2u7d4yb',
    STRAVA_API_RATE_LIMITED = 'q5k9a1sw',
    STRAVA_API_FETCH = 'g4n8t2hf',
    STRAVA_API_HTTP = 'y7p3v6zc',
    STRAVA_API_PARSE = 'w1b5e9lq',

    // Strava - OAuth client
    STRAVA_OAUTH_UNAUTHORIZED = 'd9f2r7xk',
    STRAVA_OAUTH_RATE_LIMITED = 'm3h6j1ua',
    STRAVA_OAUTH_FETCH = 't8c4q5ns',
    STRAVA_OAUTH_HTTP = 'x6l1w3pd',
    STRAVA_OAUTH_PARSE = 'e5v9g2bz',

    // Strava - Credentials
    STRAVA_NOT_CONFIGURED = 'hrhwtzi6',

    // Strava - Connection repository
    STRAVA_CONN_SELECT = 'nzsa2re1',
    STRAVA_CONN_SELECT_ERR = 'a10jw8bt',
    STRAVA_CONN_SELECT_PARSE = 'tzzi6g6w',
    STRAVA_CONN_UPSERT = 'tgo6r1vq',
    STRAVA_CONN_UPSERT_ERR = '6umatkca',
    STRAVA_CONN_DELETE = '4sjfwvna',
    STRAVA_CONN_DELETE_ERR = '48rehixq',
    STRAVA_CONN_UPDATE_TOKENS = 'l5e32q9g',
    STRAVA_CONN_UPDATE_TOKENS_ERR = 'n2kwpsum',
    STRAVA_CONN_TOUCH = '9zeobj4t',
    STRAVA_CONN_TOUCH_ERR = 'tfyizwtv',
    STRAVA_CONN_FIND_OWNER = 'jvootv2f',
    STRAVA_CONN_FIND_OWNER_ERR = 'fc7ytaqj',

    // Strava - Access token
    STRAVA_TOKEN_SB_CLIENT = 't77xcslj',
    STRAVA_TOKEN_NOT_CONNECTED = 'h2kmiols',
    STRAVA_TOKEN_NOT_CONNECTED_AFTER_RACE = '2ew6r569',
}
