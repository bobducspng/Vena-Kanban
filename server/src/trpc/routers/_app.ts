import { router } from "../trpc.js";
import { userRouter } from "./user.js";
import { pipeRouter } from "./pipe.js";
import { phaseRouter } from "./phase.js";
import { fieldRouter } from "./field.js";
import { cardRouter } from "./card.js";
import { eventRouter } from "./event.js";
import { labelRouter } from "./label.js";
import { commentRouter } from "./comment.js";
import { checklistRouter } from "./checklist.js";
import { conditionRouter } from "./condition.js";
import { databaseRouter } from "./database.js";

export const appRouter = router({
  user: userRouter,
  pipe: pipeRouter,
  phase: phaseRouter,
  field: fieldRouter,
  card: cardRouter,
  event: eventRouter,
  label: labelRouter,
  comment: commentRouter,
  checklist: checklistRouter,
  condition: conditionRouter,
  database: databaseRouter,
});

// The front-end imports this type for an end-to-end-typed client.
export type AppRouter = typeof appRouter;
