import { z } from "zod";

// Imported first in main.tsx: schemas read this when they are built. Each answer is parsed once or twice, so
// compiling a fast parser per object schema (`new Function`) costs more than it saves, on the first screen's path.
z.config({ jitless: true });
