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

    // Training - Activities repository
    TRAINING_ACTIVITY_INSERT = 'ljlybdci',
    TRAINING_ACTIVITY_INSERT_ERR = 'krro5o2k',
    TRAINING_ACTIVITY_START_LOOKUP = 'c7m2x9qd',
    TRAINING_ACTIVITY_START_LOOKUP_ERR = 'f4t8v1ne',
    TRAINING_ACTIVITY_DELETE = 'b2k6y3wr',
    TRAINING_ACTIVITY_DELETE_ERR = 'j9h5s7ua',
    TRAINING_ACTIVITY_RANGE = 'v51nvm93',
    TRAINING_ACTIVITY_RANGE_ERR = 'h8q3b2t2',
    TRAINING_ACTIVITY_RANGE_PARSE = 'fouue0tt',
    TRAINING_ACTIVITY_BY_ID = 'qgfc5s65',
    TRAINING_ACTIVITY_BY_ID_ERR = '4motkowx',
    TRAINING_ACTIVITY_BY_ID_PARSE = 'wojlgflc',

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

    // Training - Activity files
    TRAINING_FILE_UNSUPPORTED = 'u4f7n2xc',
    TRAINING_FILE_PARSE = 'p9k3w6ze',
    TRAINING_FILE_DUPLICATE = 'd3n8r5kz',
    TRAINING_FILE_TOO_LARGE = 'x6q1m4ph',
    TRAINING_FILE_STORAGE_PUT = 'g8w2e7bt',
    TRAINING_FILE_STORAGE_PUT_ERR = 'y5c9l3vs',
    TRAINING_FILE_STORAGE_REMOVE = 'a1z7o4mj',
    TRAINING_FILE_STORAGE_REMOVE_ERR = 'u2i6d8fx',
    TRAINING_FILE_ROW_INSERT = 'k7r3t9nq',
    TRAINING_FILE_ROW_INSERT_ERR = 'e4p1h6cw',
    TRAINING_FILE_HASH_LOOKUP = 'm9s5b2gy',
    TRAINING_FILE_HASH_LOOKUP_ERR = 'q8v4j7la',

    // Athlete - Profiles repository
    ATHLETE_PROFILE_SELECT = '9l42kdu7',
    ATHLETE_PROFILE_SELECT_ERR = 'v141ij6l',
    ATHLETE_PROFILE_SELECT_PARSE = 'm6dy8w79',
    ATHLETE_PROFILE_TIMEZONE_INVALID = 'w0w6fcsj',
    ATHLETE_PROFILE_FULL_SELECT = 'c7h2n5qe',
    ATHLETE_PROFILE_FULL_SELECT_ERR = 'r4t8y1wz',
    ATHLETE_PROFILE_FULL_SELECT_PARSE = 'k9b3m6xa',
    ATHLETE_PROFILE_UPSERT = 'd2f6j8vp',
    ATHLETE_PROFILE_UPSERT_ERR = 'g5s1h4ln',
    ATHLETE_PROFILE_INVALID = 'z8u3c7to',

    // Athlete - Queries
    ATHLETE_SB_CLIENT = 'xq3k7m2d',
}
