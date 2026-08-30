/** `npm run refresh:tw-list` — rebuild the Taiwan securities master now. */
import { refreshTwSecurities } from '../services/twSecurities.js';

refreshTwSecurities()
  .then((r) => {
    console.log(`tw_securities: ${r.upserted} upserted, ${r.total} total`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('refresh failed:', err);
    process.exit(1);
  });
