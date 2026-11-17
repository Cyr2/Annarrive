// `config`, not `z.config`: the build treats every `z.` call as pure (vite.config.ts) and would drop this one.
import { config } from "zod";

// Imported first in main.tsx, before any schema is built. The CSP allows no eval, so zod's compiled parsers never
// run here; without this, each launch still tries `new Function` once and the browser reports a CSP violation.
config({ jitless: true });
