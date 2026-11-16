/** Motion springs, the JS side of the duration tokens (styles/tokens.css). No bounce: iOS push transition. */
export const SPRING_STEP = { type: "spring", bounce: 0, duration: 0.45 } as const;
/** Glass bubbles of the guided tour: a small bounce as they land on their target. */
export const SPRING_BUBBLE = { type: "spring", bounce: 0.2, duration: 0.4 } as const;
