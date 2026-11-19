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

    // Training - Activities repository
    TRAINING_ACTIVITY_FIND = 'eikolu6v',
    TRAINING_ACTIVITY_FIND_ERR = 'd4p5if14',
    TRAINING_ACTIVITY_INSERT = 'ljlybdci',
    TRAINING_ACTIVITY_INSERT_ERR = 'krro5o2k',
    TRAINING_ACTIVITY_UPDATE = 'pxppbrhh',
    TRAINING_ACTIVITY_UPDATE_ERR = 'ocd4c1wx',
    TRAINING_ACTIVITY_SOFT_DELETE = '73a1lh2u',
    TRAINING_ACTIVITY_SOFT_DELETE_ERR = '9np7n5r7',
    TRAINING_ACTIVITY_RANGE = 'v51nvm93',
    TRAINING_ACTIVITY_RANGE_ERR = 'h8q3b2t2',
    TRAINING_ACTIVITY_RANGE_PARSE = 'fouue0tt',
    TRAINING_ACTIVITY_BY_ID = 'qgfc5s65',
    TRAINING_ACTIVITY_BY_ID_ERR = '4motkowx',
    TRAINING_ACTIVITY_BY_ID_PARSE = 'wojlgflc',
    TRAINING_ACTIVITY_COUNT = 'ej3f0wkv',
    TRAINING_ACTIVITY_COUNT_ERR = 'g9gc1t2u',

    // Training - Activity laps repository
    TRAINING_LAPS_DELETE = 'rmnen1n8',
    TRAINING_LAPS_DELETE_ERR = 'behzgpse',
    TRAINING_LAPS_INSERT = 'ok7qtvcf',
    TRAINING_LAPS_INSERT_ERR = 't3ox8847',
    TRAINING_LAPS_SELECT = 'ikpnqmhn',
    TRAINING_LAPS_SELECT_ERR = 'vnu5kbm9',
    TRAINING_LAPS_SELECT_PARSE = 'gm8afoa9',

    // Training - Queries
    TRAINING_SB_CLIENT = 'hct8vnt6',
    TRAINING_RANGE_INVALID = 't3vf1ezs',
    TRAINING_RANGE_TOO_LONG = 'jqc9i19q',

    // Athlete - Profiles repository
    ATHLETE_PROFILE_SELECT = '9l42kdu7',
    ATHLETE_PROFILE_SELECT_ERR = 'v141ij6l',
    ATHLETE_PROFILE_SELECT_PARSE = 'm6dy8w79',
    ATHLETE_PROFILE_TIMEZONE_INVALID = 'w0w6fcsj',

    // Strava - Webhook events repository
    STRAVA_EVENT_INSERT = 'ki61c74c',
    STRAVA_EVENT_INSERT_ERR = 'ncalfdlp',
    STRAVA_EVENT_STATUS = 'jgk44lgz',
    STRAVA_EVENT_STATUS_ERR = 'p24swdq9',

    // Strava - Sync services
    STRAVA_SYNC_SB_CLIENT = 'ux59iit2',
    STRAVA_SYNC_ACTIVITY_PAYLOAD = 'gb991ewe',
    STRAVA_SYNC_LAPS_PAYLOAD = '8eeud38e',
    STRAVA_SYNC_MAPPING = 'gjkfa24l',
    STRAVA_SYNC_LIST_PAYLOAD = 'l7ays98u',
    STRAVA_SYNC_MISSING_SB_CLIENT = 'i31u3x03',
    STRAVA_SYNC_ATHLETE_MISMATCH = 'davdrf9h',
    STRAVA_SYNC_NOT_CONNECTED = '7b8pgc0x',
    STRAVA_VERIFY_SB_CLIENT = 'ecnq9b07',

    // Strava - Webhook event handling
    STRAVA_WEBHOOK_SB_CLIENT = 'pskuolsh',
    STRAVA_WEBHOOK_EVENT_TIME = 'el6aljqx',
}
