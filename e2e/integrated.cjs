// This command intentionally uses a real window to exercise document visibility.
process.env.CRITICAL_OBSERVABILITY = '1';
process.env.CRITICAL_HEADED = '1';
require('./reproduce.cjs');
