// Existing real checkout exercised with local QR assertions; no domain changes.
process.env.VERIFY_RESERVATION_QR = '1';
process.env.CRITICAL_HEADED = '1';
// Discard the first successful response to exercise the existing idempotent retry.
process.env.CRITICAL_RETRY = '1';
process.env.RESERVATION_DAY_OFFSET ||= '21';
require('./reproduce.cjs');
