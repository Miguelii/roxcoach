export const ZEPP_IMPORTED_SPORT_TYPES = [1] as const

// Safety ceiling of details one sync run fetches (about 8 minutes at the request spacing), not a
// working limit.
export const MAX_DETAILS_PER_SYNC = 1000

// The sync reaches back this many days from now, no further.
export const ZEPP_SYNC_HISTORY_DAYS = 360

// The sync re-reads the connection after this many detail requests and stops when it is gone.
export const CONNECTION_RECHECK_EVERY = 25

export const DETAIL_REQUEST_DELAY_MS = 500

export const ZEPP_REQUEST_TIMEOUT_MS = 15_000

export const ZEPP_URLS = {
    tokens: 'https://api-user-us2.zepp.com/v2/registrations/tokens',
    login: 'https://api-mifit-us2.zepp.com/v2/client/login',
    history: 'https://api-mifit-us2.zepp.com/v1/sport/run/history.json',
    detail: 'https://api-mifit-us2.zepp.com/v1/sport/run/detail.json',
} as const

// Ported from the open source huami-token (MIT, Kirill Snezhko): the Zepp app encrypts the
// credentials of the first login call with this fixed key and IV, so they are not ours to choose.
export const ZEPP_LOGIN_CIPHER = {
    algorithm: 'aes-128-cbc',
    key: 'xeNtBVqzDc6tuNTh',
    iv: 'MAAAYAAAAAAAAABg',
} as const

export const ZEPP_TOKENS_PAYLOAD = {
    state: 'REDIRECTION',
    client_id: 'HuaMi',
    redirect_uri: 'https://s3-us-west-2.amazonaws.com/hm-registration/successsignin.html',
    region: 'us-west-2',
    country_code: 'US',
} as const

export const ZEPP_LOGIN_PAYLOAD = {
    device_model: 'android_phone',
    app_version: '9.12.5',
    dn: 'api-mifit.zepp.com,api-user.zepp.com,api-mifit.zepp.com,api-watch.zepp.com,app-analytics.zepp.com,auth.zepp.com,api-analytics.zepp.com',
    third_name: 'huami',
    source: 'com.huami.watch.hmwatchmanager:9.12.5:151689',
    app_name: 'com.huami.midong',
    country_code: 'US',
    grant_type: 'access_token',
    allow_registration: 'false',
    lang: 'en',
    countryState: 'US-NY',
} as const

export const ZEPP_TOKENS_HEADERS = {
    app_name: 'com.huami.midong',
    appname: 'com.huami.midong',
    cv: '151689_9.12.5',
    v: '2.0',
    appplatform: 'android_phone',
    vb: '202509151347',
    vn: '9.12.5',
    'user-agent': 'Zepp/9.12.5 (Pixel 4; Android 12; Density/2.75)',
    'x-hm-ekv': '1',
    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
} as const

export const ZEPP_LOGIN_HEADERS = {
    app_name: 'com.huami.webapp',
    appname: 'com.huami.webapp',
    origin: 'https://user.zepp.com',
    referer: 'https://user.zepp.com/',
    'user-agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
    accept: 'application/json, text/plain, */*',
} as const

export const ZEPP_DATA_HEADERS = {
    appPlatform: 'web',
    appname: 'com.huami.midong',
} as const

export const ZEPP_SYNC_TASK_ID = 'sync-zepp-activities'
