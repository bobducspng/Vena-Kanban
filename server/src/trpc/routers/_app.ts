import { router } from "../trpc.js";
import { userRouter } from "./user.js";
import { pipeRouter } from "./pipe.js";
import { phaseRouter } from "./phase.js";
import { fieldRouter } from "./field.js";
import { cardRouter } from "./card.js";
import { eventRouter } from "./event.js";

export const appRouter = router({
  user: userRouter,
  pipe: pipeRouter,
  phase: phaseRouter,
  field: fieldRouter,
  card: cardRouter,
  event: eventRouter,
});

// The front-end imports this type for an end-to-end-typed client.
export type AppRouter = typeof appRouter;
